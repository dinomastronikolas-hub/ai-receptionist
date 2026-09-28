"use client";

import Link from "next/link";
import { Check, Circle, Minus } from "lucide-react";
import { use, useMemo } from "react";
import { HabitHistoryCard } from "@/components/grid/habit-history-card";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile } from "@/components/stats/stat-tile";
import { Avatar, displayName } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/skeleton";
import { colorHex } from "@/lib/colors";
import { addDays, formatDay, todayInTimeZone, toDayNum } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { combinedRate, countPerfectDays, dayProgress, formatStreak, ratePercent } from "@/lib/habit-engine";
import { usePerson } from "@/lib/queries";
import { buildEngines, useMe } from "@/lib/use-me";

export default function PersonPage({ params }: PageProps<"/people/[userId]">) {
  const { userId: personId } = use(params);
  const { userId } = useMe();
  const { data, isLoading, error } = usePerson(personId, userId);
  const today = data ? todayInTimeZone(data.profile.timezone) : null;
  const engines = useMemo(() => (data && today ? buildEngines(data.habits, data.history, today) : new Map()), [data, today]);

  if (isLoading) return <PageSkeleton />;
  if (error) return <EmptyState emoji="😵" title="Couldn't load this profile" body={friendlyError(error)} />;
  if (!data || !today) {
    return (
      <>
        <PageHeader back title="Profile unavailable" />
        <EmptyState emoji="🔒" title="You can't see this profile" body="You can only see people who share a group with you." action={<ButtonLink href="/group">Back to group</ButtonLink>} />
      </>
    );
  }

  const { profile, habits, history } = data;
  const isMe = personId === userId;
  const list = habits.map((h) => engines.get(h.id)!);
  const todayN = toDayNum(today);
  const progress = dayProgress(list, todayN);
  const week = ratePercent(combinedRate(list, addDays(today, -6), today));
  const perfect = countPerfectDays(list, addDays(today, -29), today);
  const name = displayName(profile);

  return (
    <div className="space-y-6">
      <PageHeader
        back
        title={
          <span className="flex items-center gap-3">
            <Avatar profile={profile} size={52} />
            <span className="min-w-0">
              <span className="block truncate">{isMe ? `${name} (you)` : name}</span>
              <span className="block text-[15px] font-medium text-muted">@{profile.username}</span>
            </span>
          </span>
        }
      />

      {habits.length === 0 ? (
        <EmptyState emoji="🌱" title={`${name} has no shared habits yet`} body="Private habits are never visible to the group." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Today" value={progress.due > 0 ? `${progress.done}/${progress.due}` : "—"} sub={progress.due > 0 ? "done" : "rest day"} />
            <StatTile label="7 days" value={week === null ? "—" : `${week}%`} sub="consistency" />
            <StatTile label="Perfect" value={perfect} sub="days (30d)" />
          </div>

          <section>
            <SectionTitle>{isMe ? "Your day" : `${name}'s day`} · {formatDay(today, { weekday: "short", month: "short", day: "numeric" })}</SectionTitle>
            <Card className="divide-y divide-line">
              {habits.map((h) => {
                const e = engines.get(h.id)!;
                const done = e.isDone(todayN);
                const due = e.isDue(todayN);
                const { current, unit } = e.streaks();
                const hex = colorHex(h.color);
                return (
                  <Link key={h.id} href={`#habit-${h.id}`} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-full"
                      style={done ? { background: hex, color: "#fff" } : { boxShadow: `inset 0 0 0 2px ${due ? hex : "var(--border-strong)"}`, opacity: due ? 0.6 : 1 }}
                      aria-label={done ? "Done" : due ? "Not done yet" : "Not due today"}
                    >
                      {done ? <Check className="size-4" strokeWidth={3} /> : due ? <Circle className="size-0" /> : <Minus className="size-3.5 text-subtle" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {h.emoji} {h.name}
                    </span>
                    <span className="tabular shrink-0 text-[13px] font-semibold" style={{ color: current > 0 ? hex : "var(--fg-subtle)" }}>
                      {current > 0 ? `🔥 ${formatStreak(current, unit)}` : due && !done ? "not yet" : done ? "" : "rest"}
                    </span>
                  </Link>
                );
              })}
            </Card>
          </section>

          <section className="space-y-3">
            <SectionTitle>History</SectionTitle>
            {habits.map((h) => (
              <div key={h.id} id={`habit-${h.id}`} className="scroll-mt-4">
                <HabitHistoryCard
                  habit={h}
                  engine={engines.get(h.id)!}
                  noteDays={history.get(h.id)?.noteDays}
                  today={today}
                  userId={userId}
                  ownerName={name}
                  initialRange="half"
                  href={isMe ? `/habits/${h.id}` : undefined}
                />
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
