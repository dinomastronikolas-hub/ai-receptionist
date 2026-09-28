"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Settings, UserPlus } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { ActivityFeed } from "@/components/group/activity-feed";
import { InviteSheet } from "@/components/group/invite-sheet";
import { Leaderboard } from "@/components/group/leaderboard";
import { MiniStrip } from "@/components/grid/mini-strip";
import { PageHeader } from "@/components/shell/page-header";
import { Bar } from "@/components/today/friends-today";
import { Avatar, displayName } from "@/components/ui/avatar";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { PageSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { colorHex } from "@/lib/colors";
import { friendlyError } from "@/lib/errors";
import { formatStreak } from "@/lib/habit-engine";
import { type MemberStats, computeMemberStats } from "@/lib/group-stats";
import { setSelectedGroup, useBoard, useFeed, useMemberMap, useSelectedGroup } from "@/lib/queries";
import { useMe } from "@/lib/use-me";

type Tab = "today" | "habits" | "activity";

function MemberHabits({ s, isMe }: { s: MemberStats; isMe: boolean }) {
  return (
    <Card className="p-4">
      <Link href={`/people/${s.member.user_id}`} className="mb-3 flex items-center gap-3">
        <Avatar profile={s.member.profile} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold tracking-tight">
            {displayName(s.member.profile)}
            {isMe && <span className="font-normal text-muted"> (you)</span>}
          </p>
          <p className="text-[13px] text-muted">
            {s.todayDue > 0 ? `${s.todayDone}/${s.todayDue} today` : "Rest day"}
            {s.weekPct !== null && ` · ${s.weekPct}% this week`}
          </p>
        </div>
        <ChevronRight className="size-5 text-subtle" />
      </Link>
      {s.habits.length === 0 ? (
        <p className="text-[14px] text-muted">No shared habits yet.</p>
      ) : (
        <div className="space-y-3.5">
          {s.habits.map((h) => {
            const e = s.engines.get(h.id)!;
            const { current, unit } = e.streaks();
            const hex = colorHex(h.color);
            return (
              <div key={h.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold">
                    {h.emoji} {h.name}
                  </span>
                  <span className="tabular shrink-0 text-[13px] font-semibold" style={{ color: current > 0 ? hex : "var(--fg-subtle)" }}>
                    {current > 0 ? `🔥 ${formatStreak(current, unit)}` : "—"}
                  </span>
                </div>
                <MiniStrip engine={e} hex={hex} today={s.today} days={14} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function GroupDashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const { userId, today } = useMe();
  const { group, groups, isLoading: groupsLoading, error: groupsError } = useSelectedGroup(userId);
  const { data: board, isLoading, error } = useBoard(group?.id);
  const people = useMemberMap(board?.members);
  const memberIds = useMemo(() => board?.members.map((m) => m.user_id), [board]);
  const feed = useFeed(group?.id, memberIds, today);
  const [inviteOpen, setInviteOpen] = useState(params.get("invite") === "1");
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const tab = (["today", "habits", "activity"].includes(params.get("tab") ?? "") ? params.get("tab") : "today") as Tab;
  const setTab = (t: Tab) => router.replace(`/group?tab=${t}`, { scroll: false });

  const stats = useMemo(() => (board ? computeMemberStats(board) : []), [board]);
  const ordered = useMemo(() => [...stats].sort((a, b) => (a.member.user_id === userId ? -1 : b.member.user_id === userId ? 1 : 0)), [stats, userId]);
  const groupToday = useMemo(() => {
    const due = stats.reduce((n, s) => n + s.todayDue, 0);
    const done = stats.reduce((n, s) => n + s.todayDone, 0);
    return { due, done };
  }, [stats]);

  if (groupsLoading) return <PageSkeleton />;

  if (groupsError) {
    return (
      <>
        <PageHeader title="Group" />
        <EmptyState emoji="😵" title="Couldn't load your groups" body={friendlyError(groupsError)} />
      </>
    );
  }

  if (!group) {
    return (
      <>
        <PageHeader title="Group" />
        <EmptyState
          emoji="🤝"
          title="Accountability works better together"
          body="Create a private group and invite your friends, or join theirs with an invite link or code."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <ButtonLink href="/groups/new">Create a group</ButtonLink>
              <ButtonLink href="/join" variant="secondary">
                Join with a code
              </ButtonLink>
            </div>
          }
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <button
            type="button"
            onClick={() => setSwitcherOpen(true)}
            className="-ml-1 flex max-w-full items-center gap-2 rounded-2xl px-1 text-left"
            aria-label="Switch group"
          >
            <span aria-hidden>{group.emoji}</span>
            <span className="truncate">{group.name}</span>
            <ChevronDown className="size-5 shrink-0 text-subtle" />
          </button>
        }
        subtitle={
          board
            ? `${board.members.length} member${board.members.length === 1 ? "" : "s"} · ${groupToday.done}/${groupToday.due} check-ins today`
            : " "
        }
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => setInviteOpen(true)} aria-label="Invite friends" className={buttonClass("primary", "icon")}>
              <UserPlus className="size-4.5" />
            </button>
            <Link href={`/group/${group.id}/settings`} aria-label="Group settings" className={buttonClass("secondary", "icon")}>
              <Settings className="size-4.5" />
            </Link>
          </div>
        }
      />

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "today", label: "Today" },
          { value: "habits", label: "Habits" },
          { value: "activity", label: "Activity" },
        ]}
      />

      {isLoading ? (
        <PageSkeleton />
      ) : error || !board ? (
        <EmptyState
          emoji="🫥"
          title="This group isn't available"
          body={error ? friendlyError(error) : "It may have been deleted, or you were removed."}
          action={<Button onClick={() => router.refresh()}>Reload</Button>}
        />
      ) : tab === "today" ? (
        <>
          <section>
            <SectionTitle>Today</SectionTitle>
            <Card className="divide-y divide-line overflow-hidden">
              {ordered.map((s) => (
                <Link key={s.member.user_id} href={`/people/${s.member.user_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken/60">
                  <Avatar profile={s.member.profile} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">
                        {displayName(s.member.profile)}
                        {s.member.user_id === userId && <span className="font-normal text-muted"> (you)</span>}
                      </span>
                      <span className="tabular shrink-0 text-[14px] font-bold">
                        {s.todayDue > 0 ? (
                          <>
                            {s.todayDone}/{s.todayDue} <span className="font-semibold text-muted">{s.todayPct}%</span>
                          </>
                        ) : (
                          <span className="font-medium text-muted">rest day</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Bar value={s.todayDue > 0 ? s.todayDone / s.todayDue : 0} color={s.todayPct === 100 ? "var(--brand)" : undefined} />
                    </div>
                    <p className="mt-1 text-[12px] text-muted">
                      {s.weekPct !== null ? `${s.weekPct}% this week` : "No check-ins due this week"}
                      {s.bestStreak && ` · 🔥 ${formatStreak(s.bestStreak.current, s.bestStreak.unit)} ${s.bestStreak.habit.name}`}
                    </p>
                  </div>
                </Link>
              ))}
            </Card>
            {board.members.length === 1 && (
              <Button className="mt-3 w-full" variant="secondary" onClick={() => setInviteOpen(true)}>
                <UserPlus className="size-4" /> Invite your first friend
              </Button>
            )}
          </section>
          {group.leaderboard_enabled && board.members.length > 1 && (
            <section>
              <SectionTitle>Leaderboard</SectionTitle>
              <Leaderboard stats={stats} userId={userId} />
            </section>
          )}
        </>
      ) : tab === "habits" ? (
        <div className="space-y-3">
          {ordered.map((s) => (
            <MemberHabits key={s.member.user_id} s={s} isMe={s.member.user_id === userId} />
          ))}
          <p className="px-1 text-center text-[12px] text-subtle">Last 14 days. Private habits are never shown to the group.</p>
        </div>
      ) : (
        <ActivityFeed items={feed.data} isLoading={feed.isLoading} people={people} userId={userId} today={today} />
      )}

      <InviteSheet group={group} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <Sheet open={switcherOpen} onClose={() => setSwitcherOpen(false)} title="Your groups">
        <div className="space-y-1.5">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setSelectedGroup(g.id);
                setSwitcherOpen(false);
              }}
              className={cn("flex h-14 w-full items-center gap-3 rounded-2xl px-4 text-left font-semibold", g.id === group.id ? "bg-sunken" : "hover:bg-sunken/60")}
            >
              <span className="text-xl" aria-hidden>
                {g.emoji}
              </span>
              <span className="flex-1 truncate">{g.name}</span>
              {g.id === group.id && <Check className="size-5 text-brand" />}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <ButtonLink href="/groups/new" variant="secondary" onClick={() => setSwitcherOpen(false)}>
            New group
          </ButtonLink>
          <ButtonLink href="/join" variant="secondary" onClick={() => setSwitcherOpen(false)}>
            Join a group
          </ButtonLink>
        </div>
      </Sheet>
    </div>
  );
}

export default function GroupPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <GroupDashboard />
    </Suspense>
  );
}
