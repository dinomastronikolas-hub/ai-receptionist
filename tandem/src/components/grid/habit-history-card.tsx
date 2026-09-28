"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { HabitIcon } from "@/components/habits/habit-row";
import { DaySheet } from "@/components/habits/day-sheet";
import { colorHex } from "@/lib/colors";
import { addDays } from "@/lib/dates";
import { type HabitEngine, describeSchedule, formatStreak, ratePercent } from "@/lib/habit-engine";
import type { Habit } from "@/lib/types";
import { GridLegend, HistoryGrid } from "./history-grid";

export type GridRange = "month" | "half" | "year";

export const RANGE_DAYS: Record<GridRange, number> = { month: 35, half: 182, year: 364 };

export const RANGE_OPTIONS: { value: GridRange; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "half", label: "6 months" },
  { value: "year", label: "Year" },
];

/** Habit card with its history grid, streak and a range switcher. */
export function HabitHistoryCard({
  habit,
  engine,
  noteDays,
  today,
  userId,
  ownerName,
  initialRange = "half",
  href,
  range: controlledRange,
  from,
  to,
}: {
  habit: Habit;
  engine: HabitEngine;
  noteDays?: Set<string>;
  today: string;
  userId: string;
  ownerName?: string;
  initialRange?: GridRange;
  href?: string;
  /** When provided, the range is controlled by the parent (no switcher). */
  range?: GridRange;
  from?: string;
  to?: string;
}) {
  const [ownRange, setRange] = useState<GridRange>(initialRange);
  const [selected, setSelected] = useState<string | null>(null);
  const range = controlledRange ?? ownRange;
  const hex = colorHex(habit.color);
  const gridTo = to ?? today;
  const gridFrom = from ?? addDays(today, -RANGE_DAYS[range] + 1);
  const { current, longest, unit } = engine.streaks();
  const rate = ratePercent(engine.rate(gridFrom, gridTo));

  const title = (
    <span className="flex min-w-0 items-center gap-3">
      <HabitIcon habit={habit} size={38} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{habit.name}</span>
        <span className="block truncate text-[13px] text-muted">{describeSchedule(engine.currentSchedule())}</span>
      </span>
    </span>
  );

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        {href ? (
          <Link href={href} className="min-w-0 rounded-xl">
            {title}
          </Link>
        ) : (
          title
        )}
        <div className="shrink-0 text-right">
          <p className="tabular text-[15px] font-bold" style={{ color: current > 0 ? hex : undefined }}>
            {current > 0 ? `🔥 ${formatStreak(current, unit)}` : "No streak"}
          </p>
          <p className="tabular text-[12px] text-muted">
            best {formatStreak(longest, unit)}
            {rate !== null && ` · ${rate}%`}
          </p>
        </div>
      </div>
      <HistoryGrid engine={engine} hex={hex} noteDays={noteDays} from={gridFrom} to={gridTo} today={today} onSelect={setSelected} selected={selected} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <GridLegend hex={hex} />
        {!controlledRange && <Segmented value={range} onChange={setRange} options={RANGE_OPTIONS} size="sm" className="w-full sm:w-auto" />}
      </div>
      <DaySheet habit={habit} engine={engine} day={selected} onClose={() => setSelected(null)} userId={userId} ownerName={ownerName} />
    </Card>
  );
}
