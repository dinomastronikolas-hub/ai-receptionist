"use client";

import Link from "next/link";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, displayName } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { alpha, colorHex } from "@/lib/colors";
import { relativeDayLabel, relativeTime } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { useAddComment, useDeleteComment, useToggleReaction } from "@/lib/queries";
import { REACTION_EMOJIS, type FeedItem, type Profile } from "@/lib/types";

function FeedEntry({ item, author, people, userId, today }: { item: FeedItem; author: Profile; people: Map<string, Profile>; userId: string; today: string }) {
  const toggle = useToggleReaction(userId);
  const addComment = useAddComment(userId);
  const delComment = useDeleteComment();
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState("");
  const hex = colorHex(item.habit.color);
  const mine = item.user_id === userId;

  const counts = REACTION_EMOJIS.map((emoji) => {
    const rs = item.reactions.filter((r) => r.emoji === emoji);
    return { emoji, count: rs.length, me: rs.some((r) => r.user_id === userId), who: rs.map((r) => displayName(people.get(r.user_id))).join(", ") };
  });

  return (
    <div className="px-4 py-3.5">
      <div className="flex gap-3">
        <Link href={`/people/${item.user_id}`} className="shrink-0">
          <Avatar profile={author} size={36} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug">
            <Link href={`/people/${item.user_id}`} className="font-semibold">
              {mine ? "You" : displayName(author)}
            </Link>{" "}
            completed{" "}
            <span className="rounded-md px-1.5 py-0.5 font-semibold" style={{ background: alpha(hex, 0.14), color: hex }}>
              {item.habit.emoji} {item.habit.name}
            </span>
          </p>
          <p className="mt-0.5 text-[12px] text-subtle">
            {relativeDayLabel(item.completed_on, today)} · {relativeTime(item.created_at)}
          </p>
          {item.note && <p className="mt-2 rounded-2xl bg-sunken px-3 py-2 text-[14px]">“{item.note}”</p>}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {counts.map((c) =>
              mine && c.count === 0 ? null : (
                <button
                  key={c.emoji}
                  type="button"
                  disabled={mine}
                  title={c.who || undefined}
                  aria-pressed={c.me}
                  aria-label={`${c.emoji} ${c.count}${c.me ? ", including you" : ""}`}
                  onClick={() => toggle.mutate({ completionId: item.id, emoji: c.emoji, on: !c.me })}
                  className={cn(
                    "flex h-8 items-center gap-1 rounded-full px-2.5 text-[14px] transition active:scale-90 disabled:cursor-default disabled:active:scale-100",
                    c.me ? "bg-brand/15 ring-1 ring-brand/40" : "bg-sunken",
                    c.count === 0 && "opacity-60 hover:opacity-100",
                  )}
                >
                  <span>{c.emoji}</span>
                  {c.count > 0 && <span className="tabular text-[12px] font-semibold">{c.count}</span>}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={() => setCommenting((v) => !v)}
              aria-label="Comment"
              className="flex h-8 items-center gap-1 rounded-full bg-sunken px-2.5 text-muted opacity-80 hover:opacity-100"
            >
              <MessageCircle className="size-4" />
              {item.comments.length > 0 && <span className="tabular text-[12px] font-semibold">{item.comments.length}</span>}
            </button>
          </div>

          {item.comments.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {item.comments.map((c) => (
                <li key={c.id} className="group flex items-start gap-2 text-[14px]">
                  <p className="min-w-0 flex-1">
                    <span className="font-semibold">{c.user_id === userId ? "You" : displayName(people.get(c.user_id))}</span> {c.body}
                  </p>
                  {(c.user_id === userId || mine) && (
                    <button
                      type="button"
                      aria-label="Delete comment"
                      onClick={() => delComment.mutate({ id: c.id, completionId: item.id }, { onError: (e) => toast.error(friendlyError(e)) })}
                      className="shrink-0 p-1 text-subtle hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {commenting && (
            <form
              className="mt-2.5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const body = draft.trim();
                if (!body) return;
                addComment.mutate(
                  { completionId: item.id, body },
                  {
                    onSuccess: () => {
                      setDraft("");
                      setCommenting(false);
                    },
                    onError: (err) => toast.error(friendlyError(err, "Couldn't post your comment.")),
                  },
                );
              }}
            >
              <input
                autoFocus
                maxLength={280}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Say something nice…"
                aria-label="Comment"
                className="h-10 min-w-0 flex-1 rounded-full bg-sunken px-4 outline-none focus:ring-2 focus:ring-brand/40"
              />
              <button type="submit" disabled={!draft.trim() || addComment.isPending} aria-label="Send" className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-fg disabled:opacity-40">
                <Send className="size-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function ActivityFeed({
  items,
  isLoading,
  people,
  userId,
  today,
}: {
  items: FeedItem[] | undefined;
  isLoading: boolean;
  people: Map<string, Profile>;
  userId: string;
  today: string;
}) {
  if (isLoading) return <Skeleton className="h-48 w-full rounded-3xl" />;
  const list = (items ?? []).filter((i) => people.has(i.user_id));
  if (list.length === 0) {
    return <EmptyState emoji="🌤️" title="Quiet so far" body="Check-ins from the last two weeks show up here. Be the first today!" />;
  }
  return (
    <Card className="divide-y divide-line">
      {list.map((item) => (
        <FeedEntry key={item.id} item={item} author={people.get(item.user_id)!} people={people} userId={userId} today={today} />
      ))}
    </Card>
  );
}
