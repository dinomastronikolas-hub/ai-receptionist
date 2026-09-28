import { describe, expect, it } from "vitest";
import { computeMemberStats, rankMembers } from "../group-stats";
import type { Board } from "../queries";
import type { Habit, HistoryMap, Profile } from "../types";

const now = new Date("2026-09-28T16:00:00Z"); // Monday afternoon in Europe & Americas

function profile(id: string, tz = "UTC"): Profile {
  return { id, username: id, display_name: id, avatar_emoji: null, avatar_color: "violet", timezone: tz, created_at: "" };
}
function habit(id: string, user: string): Habit {
  return {
    id, user_id: user, name: id, description: null, emoji: "✅", color: "emerald", start_date: "2026-09-01",
    visibility: "group", reminder_time: null, sort_order: 0, archived_at: null, created_at: "",
    habit_schedules: [{ effective_from: "2026-09-01", kind: "daily", weekdays: null, times_per_week: null, interval_days: null }],
  };
}
const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `2026-09-${String(from + i).padStart(2, "0")}`);

describe("group stats & leaderboard", () => {
  it("ranks by consistency, not by number of habits", () => {
    // Ann: one habit, perfect week. Ben: five habits, done ~half the time.
    const ann = habit("ann-h", "ann");
    const ben = Array.from({ length: 5 }, (_, i) => habit(`ben-h${i}`, "ben"));
    const board: Board = {
      members: [
        { user_id: "ben", role: "member", joined_at: "", profile: profile("ben") },
        { user_id: "ann", role: "owner", joined_at: "", profile: profile("ann") },
      ],
      habits: [ann, ...ben],
      history: new Map([
        ["ann-h", { days: days(20, 28), noteDays: new Set<string>() }],
        ...ben.map((h): [string, { days: string[]; noteDays: Set<string> }] => [
          h.id,
          { days: ["2026-09-22", "2026-09-24", "2026-09-26", "2026-09-28"], noteDays: new Set<string>() },
        ]),
      ]) as HistoryMap,
    };
    const stats = computeMemberStats(board, now);
    const ranked = rankMembers(stats);
    expect(ranked[0].member.user_id).toBe("ann");
    expect(ranked[0].weekPct).toBe(100);
    expect(ranked[1].weekPct).toBeLessThan(100);
    expect(ranked[0].perfectDays7).toBe(7);
  });

  it("uses each member's own local day", () => {
    const tokyo = habit("t", "tokyo");
    const board: Board = {
      members: [{ user_id: "tokyo", role: "member", joined_at: "", profile: profile("tokyo", "Asia/Tokyo") }],
      habits: [tokyo],
      history: new Map([["t", { days: ["2026-09-29"], noteDays: new Set() }]]),
    };
    // 16:00 UTC = 01:00 Sep 29 in Tokyo
    const [s] = computeMemberStats(board, now);
    expect(s.today).toBe("2026-09-29");
    expect(s.todayDone).toBe(1);
  });
});
