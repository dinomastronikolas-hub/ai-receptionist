/**
 * Habit engine — the single source of truth for schedules, day statuses,
 * streaks and completion rates. Pure and synchronous so it can be unit tested
 * and reused on the client and in the reminder dispatcher.
 *
 * Rules
 * -----
 * • Every habit has a versioned schedule. The schedule effective on a given
 *   day decides how that day is judged, so editing a schedule never rewrites
 *   the past.
 * • Per-day schedules (every day / specific weekdays / every N days):
 *     done    – completed on a scheduled day
 *     bonus   – completed on a day it wasn't scheduled (counts toward totals,
 *               never breaks or extends a streak)
 *     missed  – scheduled, not completed, and the day is over
 *     pending – scheduled today and not completed yet (never a failure)
 *     rest    – not scheduled (never a failure)
 * • "X times per week" schedules are judged per ISO week (Mon–Sun):
 *     done    – completed that day
 *     rest    – not completed but the week's target was met
 *     open    – current week, target still reachable
 *     missed  – week over (or target now unreachable) without hitting target
 *   Their streak is counted in weeks.
 * • Today is never counted against you until it is over.
 */

import {
  type ISODate,
  fromDayNum,
  isoWeekdayOfDayNum,
  toDayNum,
  weekStartDayNum,
} from "./dates";

export type ScheduleKind = "daily" | "weekdays" | "times_per_week" | "interval";

export interface Schedule {
  effective_from: ISODate;
  kind: ScheduleKind;
  /** ISO weekdays, 1 = Monday … 7 = Sunday */
  weekdays: number[] | null;
  times_per_week: number | null;
  interval_days: number | null;
}

export interface HabitScheduleInfo {
  start_date: ISODate;
  habit_schedules: Schedule[];
}

export type DayStatus =
  | "before"
  | "future"
  | "done"
  | "bonus"
  | "missed"
  | "pending"
  | "rest"
  | "open";

export interface Rate {
  achieved: number;
  expected: number;
}

export function ratePercent(r: Rate): number | null {
  return r.expected > 0 ? Math.round((r.achieved / r.expected) * 100) : null;
}

interface InternalSchedule extends Schedule {
  from: number;
}

const DAILY: Omit<InternalSchedule, "from"> = {
  effective_from: "1970-01-01",
  kind: "daily",
  weekdays: null,
  times_per_week: null,
  interval_days: null,
};

export class HabitEngine {
  readonly start: number;
  readonly today: number;
  private readonly done: Set<number>;
  private readonly schedules: InternalSchedule[];

  constructor(habit: HabitScheduleInfo, completionDays: Iterable<ISODate>, today: ISODate) {
    this.start = toDayNum(habit.start_date);
    this.today = toDayNum(today);
    this.done = new Set<number>();
    for (const d of completionDays) this.done.add(toDayNum(d));
    const sorted = [...habit.habit_schedules]
      .map((s) => ({ ...s, from: toDayNum(s.effective_from) }))
      .sort((a, b) => a.from - b.from);
    this.schedules = sorted.length > 0 ? sorted : [{ ...DAILY, from: this.start }];
  }

  // ---------------------------------------------------------------------------
  // Schedule lookup
  // ---------------------------------------------------------------------------

  /** Schedule in force on `day` (the earliest one covers days before it). */
  scheduleAt(day: number): InternalSchedule {
    let found = this.schedules[0];
    for (const s of this.schedules) {
      if (s.from <= day) found = s;
      else break;
    }
    return found;
  }

  currentSchedule(): Schedule {
    return this.scheduleAt(Math.max(this.today, this.start));
  }

  get streakUnit(): "day" | "week" {
    return this.currentSchedule().kind === "times_per_week" ? "week" : "day";
  }

  isWeekly(day: number): boolean {
    return this.scheduleAt(day).kind === "times_per_week";
  }

  /** For per-day schedules: is `day` a scheduled day? */
  isScheduledDay(day: number): boolean {
    if (day < this.start) return false;
    const s = this.scheduleAt(day);
    switch (s.kind) {
      case "daily":
        return true;
      case "weekdays":
        return (s.weekdays ?? []).includes(isoWeekdayOfDayNum(day));
      case "interval": {
        const n = Math.max(1, s.interval_days ?? 1);
        const anchor = Math.max(s.from, this.start);
        return day >= anchor && (day - anchor) % n === 0;
      }
      case "times_per_week":
        return true;
    }
  }

  isDone(day: number): boolean {
    return this.done.has(day);
  }

  isDoneOn(iso: ISODate): boolean {
    return this.done.has(toDayNum(iso));
  }

  private countDone(from: number, to: number): number {
    let c = 0;
    for (let d = Math.max(from, this.start); d <= to; d++) if (this.done.has(d)) c++;
    return c;
  }

  /** Weekly target for the week starting `ws`, capped by the days tracked in it. */
  private weekTarget(ws: number, s: InternalSchedule): number {
    const tracked = ws + 6 - Math.max(ws, this.start) + 1;
    return Math.max(1, Math.min(s.times_per_week ?? 1, tracked));
  }

  /** Progress for the ISO week containing `day` (weekly schedules). */
  weekProgress(day: number): { done: number; target: number } {
    const ws = weekStartDayNum(day);
    const s = this.scheduleAt(Math.max(ws, this.start));
    const target = s.kind === "times_per_week" ? this.weekTarget(ws, s) : 0;
    return { done: this.countDone(ws, Math.min(ws + 6, this.today)), target };
  }

  // ---------------------------------------------------------------------------
  // Day status
  // ---------------------------------------------------------------------------

  status(day: number): DayStatus {
    if (day < this.start) return "before";
    if (day > this.today) return "future";
    const s = this.scheduleAt(day);
    const done = this.done.has(day);

    if (s.kind === "times_per_week") {
      if (done) return "done";
      const ws = weekStartDayNum(day);
      const we = ws + 6;
      const target = this.weekTarget(ws, s);
      const c = this.countDone(ws, Math.min(we, this.today));
      if (c >= target) return "rest";
      if (we < this.today) return "missed";
      if (day === this.today) return "pending";
      const remaining = we - this.today + 1;
      return c + remaining < target ? "missed" : "open";
    }

    const scheduled = this.isScheduledDay(day);
    if (done) return scheduled ? "done" : "bonus";
    if (!scheduled) return "rest";
    if (day === this.today) return "pending";
    return "missed";
  }

  statusOn(iso: ISODate): DayStatus {
    return this.status(toDayNum(iso));
  }

  /**
   * Whether the habit counts toward `day`'s "X of Y done" progress.
   * Weekly habits are due until their weekly target has been met on an
   * earlier day of that week.
   */
  isDue(day: number): boolean {
    if (day < this.start || day > this.today) return false;
    const s = this.scheduleAt(day);
    if (s.kind === "times_per_week") {
      const ws = weekStartDayNum(day);
      return this.countDone(ws, day - 1) < this.weekTarget(ws, s);
    }
    return this.isScheduledDay(day);
  }

  // ---------------------------------------------------------------------------
  // Streaks
  // ---------------------------------------------------------------------------

  streaks(): { current: number; longest: number; unit: "day" | "week" } {
    const unit = this.streakUnit;
    if (this.today < this.start) return { current: 0, longest: 0, unit };
    return unit === "week" ? this.weekStreaks() : this.dayStreaks();
  }

  /** Consecutive completed scheduled days; unscheduled days are skipped. */
  private dayStreaks(): { current: number; longest: number; unit: "day" } {
    let run = 0;
    let longest = 0;
    for (let d = this.start; d <= this.today; d++) {
      const st = this.status(d);
      if (st === "done") {
        run++;
        if (run > longest) longest = run;
      } else if (st === "missed") {
        run = 0;
      }
    }
    return { current: run, longest, unit: "day" };
  }

  /** Consecutive weeks meeting the target; the current week never breaks it. */
  private weekStreaks(): { current: number; longest: number; unit: "week" } {
    let run = 0;
    let longest = 0;
    const lastWs = weekStartDayNum(this.today);
    for (let ws = weekStartDayNum(this.start); ws <= lastWs; ws += 7) {
      const we = ws + 6;
      const ended = we < this.today;
      const s = this.scheduleAt(Math.max(ws, this.start));
      let success: boolean;
      let failed: boolean;
      if (s.kind === "times_per_week") {
        const c = this.countDone(ws, Math.min(we, this.today));
        success = c >= this.weekTarget(ws, s);
        failed = !success && ended;
      } else {
        let anyDone = false;
        let anyMissed = false;
        for (let d = Math.max(ws, this.start); d <= Math.min(we, this.today); d++) {
          const st = this.status(d);
          if (st === "done") anyDone = true;
          if (st === "missed") anyMissed = true;
        }
        success = anyDone && !anyMissed && ended;
        failed = anyMissed;
      }
      if (success) {
        run++;
        if (run > longest) longest = run;
      } else if (failed) {
        run = 0;
      }
    }
    return { current: run, longest, unit: "week" };
  }

  // ---------------------------------------------------------------------------
  // Rates & totals
  // ---------------------------------------------------------------------------

  /**
   * Completion rate over [from, to] (inclusive, clipped to the habit's life).
   * Per-day schedules: completed scheduled days / scheduled days (today only
   * counts once completed). Weekly schedules: each week contributes
   * min(done, target) / target, weighted by how much of the week is in range;
   * an unfinished week that hasn't hit its target yet only contributes what
   * has been done, so it can't drag the rate down early in the week.
   */
  rate(fromIso: ISODate, toIso: ISODate): Rate {
    const a = Math.max(toDayNum(fromIso), this.start);
    const b = Math.min(toDayNum(toIso), this.today);
    let achieved = 0;
    let expected = 0;
    const weeks = new Map<number, number>(); // week start → days of that week in range

    for (let d = a; d <= b; d++) {
      const s = this.scheduleAt(d);
      if (s.kind === "times_per_week") {
        const ws = weekStartDayNum(d);
        weeks.set(ws, (weeks.get(ws) ?? 0) + 1);
        continue;
      }
      if (!this.isScheduledDay(d)) continue;
      if (this.done.has(d)) {
        achieved++;
        expected++;
      } else if (d < this.today) {
        expected++;
      }
    }

    for (const [ws, daysInRange] of weeks) {
      const we = ws + 6;
      const tracked = we - Math.max(ws, this.start) + 1;
      const frac = daysInRange / tracked;
      const s = this.scheduleAt(Math.max(ws, this.start));
      const target = s.kind === "times_per_week" ? this.weekTarget(ws, s) : 1;
      const c = Math.min(this.countDone(ws, Math.min(we, this.today)), target);
      const ended = we < this.today;
      if (ended || c >= target) {
        expected += target * frac;
        achieved += c * frac;
      } else {
        expected += c * frac;
        achieved += c * frac;
      }
    }
    return { achieved, expected };
  }

  totalCompletions(fromIso?: ISODate, toIso?: ISODate): number {
    const a = fromIso ? toDayNum(fromIso) : -Infinity;
    const b = toIso ? toDayNum(toIso) : Infinity;
    let c = 0;
    for (const d of this.done) if (d >= a && d <= b && d >= this.start) c++;
    return c;
  }

  /** Scheduled days in the future are not failures: next scheduled day ≥ today. */
  nextScheduledDay(): ISODate | null {
    for (let d = Math.max(this.today, this.start); d < this.today + 400; d++) {
      if (this.scheduleAt(d).kind === "times_per_week" || this.isScheduledDay(d)) return fromDayNum(d);
    }
    return null;
  }
}

// -----------------------------------------------------------------------------
// Multi-habit helpers
// -----------------------------------------------------------------------------

export interface DayProgress {
  due: number;
  done: number;
}

export function dayProgress(engines: HabitEngine[], day: number): DayProgress {
  let due = 0;
  let done = 0;
  for (const e of engines) {
    if (!e.isDue(day)) continue;
    due++;
    if (e.isDone(day)) done++;
  }
  return { due, done };
}

/** Perfect day: at least one habit was due and every due habit was completed. */
export function isPerfectDay(engines: HabitEngine[], day: number): boolean {
  const p = dayProgress(engines, day);
  return p.due > 0 && p.done === p.due;
}

export function countPerfectDays(engines: HabitEngine[], fromIso: ISODate, toIso: ISODate): number {
  let c = 0;
  for (let d = toDayNum(fromIso); d <= toDayNum(toIso); d++) if (isPerfectDay(engines, d)) c++;
  return c;
}

export function combinedRate(engines: HabitEngine[], fromIso: ISODate, toIso: ISODate): Rate {
  const total: Rate = { achieved: 0, expected: 0 };
  for (const e of engines) {
    const r = e.rate(fromIso, toIso);
    total.achieved += r.achieved;
    total.expected += r.expected;
  }
  return total;
}

export function describeSchedule(s: Pick<Schedule, "kind" | "weekdays" | "times_per_week" | "interval_days">): string {
  switch (s.kind) {
    case "daily":
      return "Every day";
    case "weekdays": {
      const days = [...(s.weekdays ?? [])].sort();
      if (days.length === 7) return "Every day";
      if (days.join() === "1,2,3,4,5") return "Weekdays";
      if (days.join() === "6,7") return "Weekends";
      const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      return days.map((d) => names[d - 1]).join(" · ");
    }
    case "times_per_week":
      return s.times_per_week === 7 ? "7× a week" : `${s.times_per_week}× a week`;
    case "interval":
      return `Every ${s.interval_days} days`;
  }
}

export function formatStreak(n: number, unit: "day" | "week"): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}
