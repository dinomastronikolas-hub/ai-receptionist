import { describe, expect, it } from "vitest";
import { addDays, isoWeekday } from "../dates";
import {
  HabitEngine,
  type Schedule,
  combinedRate,
  countPerfectDays,
  dayProgress,
  describeSchedule,
  ratePercent,
} from "../habit-engine";
import { toDayNum } from "../dates";

const MON = "2026-09-28"; // a Monday

function sched(partial: Partial<Schedule> & Pick<Schedule, "kind">, from = "2026-01-01"): Schedule {
  return { effective_from: from, weekdays: null, times_per_week: null, interval_days: null, ...partial };
}

function engine(opts: { start: string; schedules: Schedule[]; done: string[]; today: string }) {
  return new HabitEngine({ start_date: opts.start, habit_schedules: opts.schedules }, opts.done, opts.today);
}

/** Consecutive days ending at `last` (inclusive). */
function run(last: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(last, -i));
}

describe("fixtures", () => {
  it("2026-09-28 is a Monday", () => {
    expect(isoWeekday(MON)).toBe(1);
  });
});

describe("daily habits", () => {
  it("counts a streak of consecutive completed days", () => {
    const e = engine({ start: "2026-09-01", schedules: [sched({ kind: "daily" })], done: run(MON, 5), today: MON });
    expect(e.streaks()).toEqual({ current: 5, longest: 5, unit: "day" });
  });

  it("does not break the streak just because today is not done yet", () => {
    const e = engine({
      start: "2026-09-01",
      schedules: [sched({ kind: "daily" })],
      done: run(addDays(MON, -1), 4),
      today: MON,
    });
    expect(e.statusOn(MON)).toBe("pending");
    expect(e.streaks().current).toBe(4);
  });

  it("breaks the streak on a missed day and keeps the longest", () => {
    const done = [...run("2026-09-20", 7), ...run(MON, 3)]; // 14..20 and 26..28
    const e = engine({ start: "2026-09-01", schedules: [sched({ kind: "daily" })], done, today: MON });
    expect(e.statusOn("2026-09-22")).toBe("missed");
    expect(e.streaks()).toEqual({ current: 3, longest: 7, unit: "day" });
  });

  it("marks days before the start date and in the future separately", () => {
    const e = engine({ start: "2026-09-20", schedules: [sched({ kind: "daily" })], done: [], today: MON });
    expect(e.statusOn("2026-09-19")).toBe("before");
    expect(e.statusOn(addDays(MON, 1))).toBe("future");
  });
});

describe("specific weekdays (Mon/Wed/Fri)", () => {
  const mwf = sched({ kind: "weekdays", weekdays: [1, 3, 5] });

  it("rest days never break the streak", () => {
    // Mon 21, Wed 23, Fri 25, Mon 28 completed; Tue/Thu/Sat/Sun untouched.
    const e = engine({
      start: "2026-09-01",
      schedules: [mwf],
      done: ["2026-09-21", "2026-09-23", "2026-09-25", MON],
      today: MON,
    });
    expect(e.statusOn("2026-09-22")).toBe("rest");
    expect(e.statusOn("2026-09-27")).toBe("rest");
    expect(e.streaks().current).toBe(4);
  });

  it("a missed scheduled day breaks the streak", () => {
    const e = engine({
      start: "2026-09-01",
      schedules: [mwf],
      done: ["2026-09-21", "2026-09-25", MON], // Wed 23 missed
      today: MON,
    });
    expect(e.statusOn("2026-09-23")).toBe("missed");
    expect(e.streaks().current).toBe(2);
  });

  it("a completion on an unscheduled day is a bonus that neither breaks nor extends", () => {
    const e = engine({
      start: "2026-09-21",
      schedules: [mwf],
      done: ["2026-09-21", "2026-09-22", "2026-09-23"],
      today: "2026-09-24",
    });
    expect(e.statusOn("2026-09-22")).toBe("bonus");
    expect(e.streaks().current).toBe(2);
    expect(e.totalCompletions()).toBe(3);
  });

  it("completion rate only counts scheduled days", () => {
    // Week of Sep 21: M,W,F scheduled; 2 of 3 done. Today (Mon 28) not done yet → excluded.
    const e = engine({
      start: "2026-09-21",
      schedules: [mwf],
      done: ["2026-09-21", "2026-09-25", "2026-09-22"],
      today: MON,
    });
    const r = e.rate("2026-09-21", MON);
    expect(r).toEqual({ achieved: 2, expected: 3 });
    expect(ratePercent(r)).toBe(67);
  });
});

describe("every N days", () => {
  it("is anchored on the start date", () => {
    const e = engine({
      start: "2026-09-20",
      schedules: [sched({ kind: "interval", interval_days: 3 }, "2026-09-20")],
      done: ["2026-09-20", "2026-09-23", "2026-09-26"],
      today: MON,
    });
    expect(e.isScheduledDay(toDayNum("2026-09-20"))).toBe(true);
    expect(e.isScheduledDay(toDayNum("2026-09-21"))).toBe(false);
    expect(e.isScheduledDay(toDayNum("2026-09-29"))).toBe(true);
    expect(e.streaks().current).toBe(3);
    expect(e.statusOn(MON)).toBe("rest");
  });
});

describe("times per week", () => {
  const thrice = sched({ kind: "times_per_week", times_per_week: 3 });

  it("counts streaks in weeks and ignores which days were used", () => {
    const done = [
      "2026-09-07", "2026-09-08", "2026-09-09", // week of Sep 7: 3
      "2026-09-15", "2026-09-17", "2026-09-20", // week of Sep 14: 3
      "2026-09-21", "2026-09-26", "2026-09-27", // week of Sep 21: 3
    ];
    const e = engine({ start: "2026-09-07", schedules: [thrice], done, today: MON });
    expect(e.streaks()).toEqual({ current: 3, longest: 3, unit: "week" });
    expect(e.statusOn("2026-09-22")).toBe("rest"); // target met that week
  });

  it("a failed week breaks the streak and marks its empty days as missed", () => {
    const done = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-21", "2026-09-22"];
    const e = engine({ start: "2026-09-14", schedules: [thrice], done, today: MON });
    expect(e.statusOn("2026-09-24")).toBe("missed");
    expect(e.streaks()).toEqual({ current: 0, longest: 1, unit: "week" });
  });

  it("the current week is open until it can no longer be met", () => {
    // Today Thursday Oct 1; done Mon only. Tue/Wed are "open" (4 days left for 2 more).
    const e = engine({ start: "2026-09-28", schedules: [thrice], done: [MON], today: "2026-10-01" });
    expect(e.statusOn("2026-09-29")).toBe("open");
    expect(e.statusOn("2026-10-01")).toBe("pending");
    expect(e.isDue(toDayNum("2026-10-01"))).toBe(true);
  });

  it("is no longer due once the weekly target is met", () => {
    const e = engine({
      start: "2026-09-28",
      schedules: [thrice],
      done: [MON, "2026-09-29", "2026-09-30"],
      today: "2026-10-01",
    });
    expect(e.isDue(toDayNum("2026-10-01"))).toBe(false);
    expect(e.weekProgress(toDayNum("2026-10-01"))).toEqual({ done: 3, target: 3 });
  });

  it("does not penalise an unfinished week in the completion rate", () => {
    const e = engine({ start: "2026-09-28", schedules: [thrice], done: [MON], today: "2026-09-29" });
    expect(ratePercent(e.rate("2026-09-28", "2026-09-29"))).toBe(100);
  });

  it("caps the first partial week's target by the days available", () => {
    // Starts on Sunday: only one day that week, so one completion meets the target.
    const e = engine({ start: "2026-09-27", schedules: [thrice], done: ["2026-09-27"], today: MON });
    expect(e.statusOn("2026-09-27")).toBe("done");
    expect(e.streaks().current).toBe(1);
  });
});

describe("schedule changes", () => {
  it("judges past days by the schedule in force at the time", () => {
    // Daily until Sep 20, then Mon/Wed/Fri from Sep 21. Sep 19 missed under daily rules;
    // Sep 22 (Tue) is a rest day under the new rules.
    const schedules = [
      sched({ kind: "daily" }, "2026-09-01"),
      sched({ kind: "weekdays", weekdays: [1, 3, 5] }, "2026-09-21"),
    ];
    const e = engine({ start: "2026-09-01", schedules, done: ["2026-09-20", "2026-09-21"], today: "2026-09-22" });
    expect(e.statusOn("2026-09-19")).toBe("missed");
    expect(e.statusOn("2026-09-22")).toBe("rest");
    expect(e.streaks().current).toBe(2);
  });
});

describe("multi-habit progress", () => {
  const daily = sched({ kind: "daily" });
  const mwf = sched({ kind: "weekdays", weekdays: [1, 3, 5] });

  it("counts only habits due that day", () => {
    const a = engine({ start: "2026-09-01", schedules: [daily], done: [MON], today: MON });
    const b = engine({ start: "2026-09-01", schedules: [mwf], done: [], today: MON });
    expect(dayProgress([a, b], toDayNum(MON))).toEqual({ due: 2, done: 1 });
    // Tuesday before: only the daily habit was due and it was not done.
    expect(dayProgress([a, b], toDayNum("2026-09-29"))).toEqual({ due: 0, done: 0 }); // future
  });

  it("counts perfect days and combines rates", () => {
    const a = engine({ start: "2026-09-26", schedules: [daily], done: ["2026-09-26", "2026-09-27", MON], today: MON });
    const b = engine({ start: "2026-09-26", schedules: [mwf], done: [], today: MON });
    // Sat, Sun: only `a` due and done → perfect. Mon: b due but not done → not perfect.
    expect(countPerfectDays([a, b], "2026-09-26", MON)).toBe(2);
    // Mon: `b` isn't done but today doesn't count as missed yet.
    expect(combinedRate([a, b], "2026-09-26", MON)).toEqual({ achieved: 3, expected: 3 });
  });
});

describe("describeSchedule", () => {
  it("produces friendly labels", () => {
    expect(describeSchedule({ kind: "weekdays", weekdays: [1, 2, 3, 4, 5], times_per_week: null, interval_days: null })).toBe("Weekdays");
    expect(describeSchedule({ kind: "weekdays", weekdays: [1, 3, 5], times_per_week: null, interval_days: null })).toBe("Mon · Wed · Fri");
    expect(describeSchedule({ kind: "times_per_week", weekdays: null, times_per_week: 3, interval_days: null })).toBe("3× a week");
    expect(describeSchedule({ kind: "interval", weekdays: null, times_per_week: null, interval_days: 2 })).toBe("Every 2 days");
  });
});
