"use client";

import Link from "next/link";
import { Avatar, displayName } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatStreak } from "@/lib/habit-engine";
import { type MemberStats, rankMembers } from "@/lib/group-stats";

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({ stats, userId }: { stats: MemberStats[]; userId: string }) {
  const ranked = rankMembers(stats);
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-line px-4 py-2.5 text-[11px] font-semibold tracking-wide text-subtle uppercase">
        <span>Last 7 days</span>
        <span className="w-14 text-right">Perfect</span>
        <span className="w-14 text-right">Score</span>
      </div>
      {ranked.map((s, i) => (
        <Link
          key={s.member.user_id}
          href={`/people/${s.member.user_id}`}
          className={cn("grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-3 hover:bg-sunken/60", s.member.user_id === userId && "bg-brand/5")}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="w-6 text-center text-lg" aria-label={`Rank ${i + 1}`}>
              {s.weekPct !== null && i < 3 ? MEDALS[i] : <span className="text-sm font-semibold text-subtle">{i + 1}</span>}
            </span>
            <Avatar profile={s.member.profile} size={32} />
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {displayName(s.member.profile)}
                {s.member.user_id === userId && <span className="font-normal text-muted"> (you)</span>}
              </span>
              <span className="block truncate text-[12px] text-muted">
                {s.bestStreak ? `🔥 ${formatStreak(s.bestStreak.current, s.bestStreak.unit)} · ${s.bestStreak.habit.name}` : "No active streak"}
              </span>
            </span>
          </span>
          <span className="tabular w-14 text-right text-[15px] font-semibold">{s.perfectDays7}</span>
          <span className="tabular w-14 text-right text-[15px] font-bold">{s.weekPct === null ? "—" : `${s.weekPct}%`}</span>
        </Link>
      ))}
      <p className="border-t border-line px-4 py-2.5 text-[12px] text-subtle">
        Score = share of scheduled check-ins completed, so easy extra habits don&apos;t win. Only shared habits count.
      </p>
    </Card>
  );
}
