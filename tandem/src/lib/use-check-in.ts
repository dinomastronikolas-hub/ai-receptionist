"use client";

import { toast } from "sonner";
import { HabitEngine } from "./habit-engine";
import { useToggleCompletion } from "./queries";
import type { Habit, HistoryMap } from "./types";

const MILESTONES = new Set([3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365, 500, 1000]);

/**
 * Check a habit off (or undo) for a day, with an Undo toast and a little
 * celebration for streak milestones.
 */
export function useCheckIn(userId: string) {
  const toggle = useToggleCompletion(userId);

  return (habit: Habit, day: string, done: boolean, history: HistoryMap | undefined, today: string) => {
    toggle.mutate({ habitId: habit.id, day, done });
    if (!done) return;
    const days = [...(history?.get(habit.id)?.days ?? []), day];
    const { current, unit } = new HabitEngine(habit, days, today).streaks();
    const milestone = MILESTONES.has(current) && unit === "day" ? current : null;
    const weekMilestone = unit === "week" && current > 1 && [2, 4, 8, 12, 26, 52].includes(current) ? current : null;
    const title = milestone
      ? `🔥 ${milestone}-day streak on ${habit.name}!`
      : weekMilestone
        ? `🔥 ${weekMilestone} weeks in a row — ${habit.name}!`
        : `${habit.emoji} ${habit.name} — done`;
    toast.success(title, {
      duration: 4000,
      action: { label: "Undo", onClick: () => toggle.mutate({ habitId: habit.id, day, done: false }) },
    });
  };
}
