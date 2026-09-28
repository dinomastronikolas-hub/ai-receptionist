"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Avatar, displayName } from "@/components/ui/avatar";
import { Card, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { computeMemberStats } from "@/lib/group-stats";
import { useBoard, useSelectedGroup } from "@/lib/queries";

export function Bar({ value, color = "var(--brand)" }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-sunken">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </div>
  );
}

export function FriendsToday({ userId }: { userId: string }) {
  const { group, isLoading: groupsLoading } = useSelectedGroup(userId);
  const { data: board, isLoading } = useBoard(group?.id);
  const stats = useMemo(() => (board ? computeMemberStats(board).filter((s) => s.member.user_id !== userId) : []), [board, userId]);

  if (groupsLoading || (group && isLoading)) {
    return (
      <section>
        <SectionTitle>Friends today</SectionTitle>
        <Skeleton className="h-40 w-full rounded-3xl" />
      </section>
    );
  }

  if (!group) {
    return (
      <section>
        <SectionTitle>Friends today</SectionTitle>
        <EmptyState
          emoji="🤝"
          title="Accountability works better together"
          body="Start a private group and invite a friend — you'll see each other's progress here."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/groups/new">Create a group</ButtonLink>
              <ButtonLink href="/join" variant="secondary">
                Join with a code
              </ButtonLink>
            </div>
          }
        />
      </section>
    );
  }

  return (
    <section>
      <SectionTitle
        action={
          <Link href="/group" className="text-[13px] font-semibold text-muted hover:text-fg">
            {group.emoji} {group.name}
          </Link>
        }
      >
        Friends today
      </SectionTitle>
      {stats.length === 0 ? (
        <EmptyState
          emoji="👋"
          title="It's just you so far"
          body="Accountability works better together. Invite a friend to your group."
          action={<ButtonLink href="/group?invite=1">Invite a friend</ButtonLink>}
        />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {stats.map((s) => (
            <Link key={s.member.user_id} href={`/people/${s.member.user_id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken/60">
              <Avatar profile={s.member.profile} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{displayName(s.member.profile)}</span>
                  <span className="tabular shrink-0 text-[13px] font-semibold text-muted">
                    {s.todayDue > 0 ? `${s.todayDone}/${s.todayDue}` : "rest day"}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar value={s.todayDue > 0 ? s.todayDone / s.todayDue : 0} />
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-subtle" />
            </Link>
          ))}
        </Card>
      )}
    </section>
  );
}
