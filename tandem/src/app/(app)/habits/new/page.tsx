"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { HabitForm } from "@/components/habits/habit-form";
import { PageHeader } from "@/components/shell/page-header";
import { COLOR_NAMES } from "@/lib/colors";
import { useMe } from "@/lib/use-me";
import type { ColorName } from "@/lib/types";

function NewHabit() {
  const { userId, today } = useMe();
  const params = useSearchParams();
  const color = params.get("color");
  return (
    <HabitForm
      userId={userId}
      habitId={null}
      initial={{
        name: params.get("name")?.slice(0, 60) ?? "",
        description: "",
        emoji: params.get("emoji")?.slice(0, 16) || "✅",
        color: COLOR_NAMES.includes(color as ColorName) ? (color as ColorName) : "emerald",
        start_date: today,
        visibility: "group",
        reminder_time: null,
        kind: "daily",
        weekdays: [1, 3, 5],
        times_per_week: 3,
        interval_days: 2,
      }}
    />
  );
}

export default function NewHabitPage() {
  return (
    <>
      <PageHeader back title="New habit" />
      <Suspense>
        <NewHabit />
      </Suspense>
    </>
  );
}
