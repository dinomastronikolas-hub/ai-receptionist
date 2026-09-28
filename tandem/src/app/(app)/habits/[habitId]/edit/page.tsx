"use client";

import { use } from "react";
import { HabitForm } from "@/components/habits/habit-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/skeleton";
import { useMyHabits } from "@/lib/use-me";

export default function EditHabitPage({ params }: PageProps<"/habits/[habitId]/edit">) {
  const { habitId } = use(params);
  const { userId, habits, engines, isLoading } = useMyHabits();
  const habit = habits.find((h) => h.id === habitId);

  if (isLoading) return <PageSkeleton />;
  if (!habit) {
    return (
      <>
        <PageHeader back="/today" title="Habit not found" />
        <EmptyState emoji="🫥" title="This habit doesn't exist" body="It may have been deleted." action={<ButtonLink href="/today">Back to today</ButtonLink>} />
      </>
    );
  }
  const current = engines.get(habit.id)!.currentSchedule();
  return (
    <>
      <PageHeader back={`/habits/${habit.id}`} title="Edit habit" />
      <HabitForm
        userId={userId}
        habitId={habit.id}
        hasHistory={engines.get(habit.id)!.totalCompletions() > 0}
        initial={{
          name: habit.name,
          description: habit.description ?? "",
          emoji: habit.emoji,
          color: habit.color,
          start_date: habit.start_date,
          visibility: habit.visibility,
          reminder_time: habit.reminder_time ? habit.reminder_time.slice(0, 5) : null,
          kind: current.kind,
          weekdays: current.weekdays ?? [1, 3, 5],
          times_per_week: current.times_per_week ?? 3,
          interval_days: current.interval_days ?? 2,
        }}
      />
    </>
  );
}
