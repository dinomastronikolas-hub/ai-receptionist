"use client";

import { useCallback } from "react";
import type { HabitEngine } from "@/lib/habit-engine";
import { CalendarGrid, type CalendarCell } from "./calendar-grid";
import { STATUS_LABEL, cellLook } from "./cell-style";
import { fromDayNum } from "@/lib/dates";

/** A single habit's history grid. */
export function HistoryGrid({
  engine,
  hex,
  noteDays,
  from,
  to,
  today,
  onSelect,
  selected,
  className,
}: {
  engine: HabitEngine;
  hex: string;
  noteDays?: Set<string>;
  from: string;
  to: string;
  today: string;
  onSelect?: (iso: string) => void;
  selected?: string | null;
  className?: string;
}) {
  const cell = useCallback(
    (day: number): CalendarCell => {
      const status = engine.status(day);
      const look = cellLook(status, hex, noteDays?.has(fromDayNum(day)));
      return { ...look, label: STATUS_LABEL[status], clickable: status !== "future" && status !== "before" };
    },
    [engine, hex, noteDays],
  );
  return (
    <CalendarGrid from={from} to={to} today={today} cell={cell} onSelect={onSelect} selected={selected} className={className} />
  );
}

export function GridLegend({ hex }: { hex: string }) {
  const item = (look: ReturnType<typeof cellLook>, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className="relative inline-block size-2.5 rounded-[3px]" style={look.style}>
        {look.dot === "rest" && <span className="absolute inset-0 m-auto size-[3px] rounded-full bg-[var(--cell-rest-dot)]" />}
      </span>
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] font-medium text-subtle">
      {item(cellLook("done", hex), "Done")}
      {item(cellLook("missed", hex), "Missed")}
      {item(cellLook("rest", hex), "Not scheduled")}
      {item(cellLook("pending", hex), "Today")}
    </div>
  );
}
