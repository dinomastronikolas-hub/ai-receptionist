"use client";

import { Avatar, displayName } from "@/components/ui/avatar";
import { Card, SectionTitle } from "@/components/ui/card";
import { relativeTime } from "@/lib/dates";
import { useCheers } from "@/lib/queries";

/** Reactions and comments friends left on your check-ins (last 3 days). */
export function Cheers({ userId }: { userId: string }) {
  const { data } = useCheers(userId);
  if (!data || data.length === 0) return null;
  return (
    <section>
      <SectionTitle>Cheers for you</SectionTitle>
      <Card className="divide-y divide-line">
        {data.slice(0, 5).map((c) => (
          <div key={`${c.kind}-${c.id}`} className="flex items-center gap-3 px-4 py-3">
            <Avatar profile={c.from} size={32} />
            <p className="min-w-0 flex-1 text-[14px] leading-snug">
              <span className="font-semibold">{displayName(c.from)}</span>{" "}
              {c.kind === "reaction" ? (
                <>
                  reacted {c.emoji} to your <span className="font-medium">{c.habit.emoji} {c.habit.name}</span>
                </>
              ) : (
                <>
                  on your {c.habit.emoji} {c.habit.name}: <span className="text-muted">“{c.body}”</span>
                </>
              )}
            </p>
            <span className="shrink-0 text-xs text-subtle">{relativeTime(c.created_at)}</span>
          </div>
        ))}
      </Card>
    </section>
  );
}
