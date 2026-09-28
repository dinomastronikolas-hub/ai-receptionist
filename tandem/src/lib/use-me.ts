"use client";

import { useMemo } from "react";
import { HabitEngine } from "./habit-engine";
import { useHabits, useHistory, useProfile, useToday } from "./queries";
import { useSession } from "./session";
import type { Habit, HistoryMap } from "./types";

export function useMe() {
  const { userId, initialProfile } = useSession();
  const { data } = useProfile(userId, initialProfile);
  const profile = data ?? initialProfile;
  const today = useToday(profile.timezone);
  return { userId, profile, today };
}

export function buildEngines(habits: Habit[], history: HistoryMap | undefined, today: string) {
  const map = new Map<string, HabitEngine>();
  for (const h of habits) {
    map.set(h.id, new HabitEngine(h, history?.get(h.id)?.days ?? [], today));
  }
  return map;
}

/** The signed-in user's habits + history + engines, ready for rendering. */
export function useMyHabits() {
  const me = useMe();
  const habitsQ = useHabits(me.userId);
  const historyQ = useHistory(me.userId);
  const habits = useMemo(() => habitsQ.data ?? [], [habitsQ.data]);
  const active = useMemo(() => habits.filter((h) => !h.archived_at), [habits]);
  const archived = useMemo(() => habits.filter((h) => h.archived_at), [habits]);
  const engines = useMemo(() => buildEngines(habits, historyQ.data, me.today), [habits, historyQ.data, me.today]);
  return {
    ...me,
    habits,
    active,
    archived,
    history: historyQ.data,
    engines,
    isLoading: habitsQ.isLoading || historyQ.isLoading,
    error: habitsQ.error ?? historyQ.error,
    refetch: () => {
      void habitsQ.refetch();
      void historyQ.refetch();
    },
  };
}
