"use client";

import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { HabitIcon, HabitRow } from "@/components/habits/habit-row";
import { NoteSheet } from "@/components/habits/note-sheet";
import { Cheers } from "@/components/today/cheers";
import { FriendsToday } from "@/components/today/friends-today";
import { ProgressCard } from "@/components/today/progress-card";
import { ButtonLink } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/skeleton";
import { displayName } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { colorHex } from "@/lib/colors";
import { formatDay, hourInTimeZone, toDayNum } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { formatStreak } from "@/lib/habit-engine";
import { useCheckIn } from "@/lib/use-check-in";
import { useMyHabits } from "@/lib/use-me";
import type { Habit } from "@/lib/types";

const SUGGESTIONS = [
  { name: "Drink water", emoji: "💧", color: "sky" },
  { name: "Workout", emoji: "🏋️", color: "orange" },
  { name: "Read 10 pages", emoji: "📖", color: "violet" },
  { name: "Meditate", emoji: "🧘", color: "teal" },
  { name: "10K steps", emoji: "👟", color: "emerald" },
  { name: "Journal", emoji: "📝", color: "fuchsia" },
];

function greeting(hour: number) {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function TodayPage() {
  const { userId, profile, today, active, engines, history, isLoading, error, refetch } = useMyHabits();
  const checkIn = useCheckIn(userId);
  const [noteFor, setNoteFor] = useState<Habit | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const todayN = toDayNum(today);
  const { due, others, doneCount } = useMemo(() => {
    const due: Habit[] = [];
    const others: Habit[] = [];
    for (const h of active) {
      const e = engines.get(h.id);
      if (!e || todayN < e.start) continue; // not started yet
      (e.isDue(todayN) ? due : others).push(h);
    }
    const doneCount = due.filter((h) => engines.get(h.id)?.isDone(todayN)).length;
    return { due, others, doneCount };
  }, [active, engines, todayN]);

  const upcoming = active.filter((h) => toDayNum(h.start_date) > todayN);

  const streaks = useMemo(
    () =>
      active
        .map((h) => ({ habit: h, ...engines.get(h.id)!.streaks() }))
        .filter((s) => s.current >= 2)
        .sort((a, b) => b.current * (b.unit === "week" ? 7 : 1) - a.current * (a.unit === "week" ? 7 : 1))
        .slice(0, 6),
    [active, engines],
  );

  const name = displayName(profile).split(" ")[0];

  return (
    <div className="space-y-7">
      <header className="flex items-start justify-between gap-4 pt-5">
        <div>
          <p className="text-[15px] font-medium text-muted">{formatDay(today)}</p>
          <h1 className="mt-0.5 text-[28px] leading-tight font-bold tracking-tight">
            {greeting(hourInTimeZone(profile.timezone))}, {name} 👋
          </h1>
        </div>
        <Link
          href="/habits/new"
          aria-label="New habit"
          className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg shadow-float transition active:scale-95 md:hidden"
        >
          <Plus className="size-5" strokeWidth={2.5} />
        </Link>
      </header>

      {isLoading ? (
        <PageSkeleton />
      ) : error ? (
        <EmptyState
          emoji="😵"
          title="Couldn't load your habits"
          body={friendlyError(error)}
          action={
            <button type="button" onClick={refetch} className="h-11 rounded-full bg-primary px-5 font-semibold text-primary-fg">
              Try again
            </button>
          }
        />
      ) : active.length === 0 ? (
        <section>
          <EmptyState
            emoji="🌱"
            title="Your board is empty"
            body="Create your first habit. Small and daily beats big and rare."
            action={<ButtonLink href="/habits/new">Create a habit</ButtonLink>}
          />
          <p className="mt-6 mb-3 px-1 text-[13px] font-semibold text-subtle">Or start with one of these</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Link
                key={s.name}
                href={`/habits/new?${new URLSearchParams({ name: s.name, emoji: s.emoji, color: s.color })}`}
                className="flex h-10 items-center gap-2 rounded-full bg-elevated px-4 text-[15px] font-medium shadow-card hover:bg-sunken"
              >
                <span aria-hidden>{s.emoji}</span> {s.name}
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <>
          <ProgressCard done={doneCount} due={due.length} />

          <section>
            <SectionTitle>Today</SectionTitle>
            {due.length === 0 ? (
              <Card className="px-5 py-6 text-center text-[15px] text-muted">Nothing scheduled today. Rest counts too. 🌿</Card>
            ) : (
              <motion.div layout className="space-y-2.5">
                {due.map((h) => (
                  <motion.div layout key={h.id} transition={{ type: "spring", stiffness: 500, damping: 40 }}>
                    <HabitRow
                      habit={h}
                      engine={engines.get(h.id)!}
                      today={today}
                      hasNote={history?.get(h.id)?.noteDays.has(today) ?? false}
                      onToggle={(done) => checkIn(h, today, done, history, today)}
                      onNote={() => setNoteFor(h)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}

            {others.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowOthers((v) => !v)}
                  aria-expanded={showOthers}
                  className="flex h-10 items-center gap-1.5 px-1 text-[14px] font-semibold text-muted hover:text-fg"
                >
                  <ChevronDown className={cn("size-4 transition-transform", showOthers && "rotate-180")} />
                  Not due today ({others.length})
                </button>
                <AnimatePresence initial={false}>
                  {showOthers && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-2.5 overflow-hidden pt-1"
                    >
                      {others.map((h) => (
                        <HabitRow
                          key={h.id}
                          muted
                          habit={h}
                          engine={engines.get(h.id)!}
                          today={today}
                          hasNote={history?.get(h.id)?.noteDays.has(today) ?? false}
                          onToggle={(done) => checkIn(h, today, done, history, today)}
                          onNote={() => setNoteFor(h)}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {upcoming.length > 0 && (
              <p className="mt-3 px-1 text-[13px] text-subtle">
                Starting soon: {upcoming.map((h) => `${h.emoji} ${h.name}`).join(", ")}
              </p>
            )}
          </section>

          {streaks.length > 0 && (
            <section>
              <SectionTitle>Current streaks</SectionTitle>
              <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
                {streaks.map(({ habit, current, unit }) => (
                  <Link
                    key={habit.id}
                    href={`/habits/${habit.id}`}
                    className="flex shrink-0 items-center gap-2.5 rounded-2xl bg-elevated py-2.5 pr-4 pl-2.5 shadow-card"
                  >
                    <HabitIcon habit={habit} size={34} />
                    <span>
                      <span className="block text-[13px] font-medium text-muted">{habit.name}</span>
                      <span className="tabular block text-[15px] font-bold" style={{ color: colorHex(habit.color) }}>
                        🔥 {formatStreak(current, unit)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Cheers userId={userId} />
      <FriendsToday userId={userId} />

      <NoteSheet habit={noteFor} day={today} userId={userId} onClose={() => setNoteFor(null)} />
      <span className="sr-only" aria-live="polite">
        {doneCount} of {due.length} habits done today
      </span>
    </div>
  );
}
