import { addDays, todayInTimeZone, toDayNum } from "./dates";
import { HabitEngine, combinedRate, countPerfectDays, dayProgress, ratePercent } from "./habit-engine";
import type { Board } from "./queries";
import type { GroupMember, Habit } from "./types";

export interface MemberStats {
  member: GroupMember;
  /** The member's own local calendar day. */
  today: string;
  habits: Habit[];
  engines: Map<string, HabitEngine>;
  todayDue: number;
  todayDone: number;
  todayPct: number | null;
  /** Consistency over the last 7 days (their local days), 0–100. */
  weekPct: number | null;
  perfectDays7: number;
  bestStreak: { habit: Habit; current: number; unit: "day" | "week" } | null;
}

/** Per-member stats from a group board, each judged in the member's own time zone. */
export function computeMemberStats(board: Board, now: Date = new Date()): MemberStats[] {
  const byUser = new Map<string, Habit[]>();
  for (const h of board.habits) {
    const list = byUser.get(h.user_id) ?? [];
    list.push(h);
    byUser.set(h.user_id, list);
  }
  return board.members.map((member) => {
    const today = todayInTimeZone(member.profile.timezone, now);
    const habits = byUser.get(member.user_id) ?? [];
    const engines = new Map(habits.map((h) => [h.id, new HabitEngine(h, board.history.get(h.id)?.days ?? [], today)]));
    const list = [...engines.values()];
    const p = dayProgress(list, toDayNum(today));
    const weekFrom = addDays(today, -6);
    let best: MemberStats["bestStreak"] = null;
    for (const h of habits) {
      const s = engines.get(h.id)!.streaks();
      const score = s.unit === "week" ? s.current * 7 : s.current;
      const bestScore = best ? (best.unit === "week" ? best.current * 7 : best.current) : 0;
      if (s.current > 0 && score > bestScore) best = { habit: h, current: s.current, unit: s.unit };
    }
    return {
      member,
      today,
      habits,
      engines,
      todayDue: p.due,
      todayDone: p.done,
      todayPct: p.due > 0 ? Math.round((p.done / p.due) * 100) : null,
      weekPct: ratePercent(combinedRate(list, weekFrom, today)),
      perfectDays7: countPerfectDays(list, weekFrom, today),
      bestStreak: best,
    };
  });
}

/**
 * Friendly leaderboard: ranks by 7-day consistency (not raw counts, so easy
 * or numerous habits don't win), then perfect days, then best streak.
 * Members with nothing scheduled this week are listed last.
 */
export function rankMembers(stats: MemberStats[]): MemberStats[] {
  const streakDays = (s: MemberStats) => (s.bestStreak ? s.bestStreak.current * (s.bestStreak.unit === "week" ? 7 : 1) : 0);
  return [...stats].sort((a, b) => {
    if ((a.weekPct === null) !== (b.weekPct === null)) return a.weekPct === null ? 1 : -1;
    return (
      (b.weekPct ?? 0) - (a.weekPct ?? 0) ||
      b.perfectDays7 - a.perfectDays7 ||
      streakDays(b) - streakDays(a) ||
      a.member.profile.display_name.localeCompare(b.member.profile.display_name)
    );
  });
}
