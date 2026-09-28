"use client";

import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { alpha, colorHex } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { toDayNum } from "@/lib/dates";
import { type HabitEngine, describeSchedule, formatStreak } from "@/lib/habit-engine";
import type { Habit } from "@/lib/types";
import { CheckButton } from "./check-button";

export function HabitIcon({ habit, size = 44 }: { habit: Pick<Habit, "emoji" | "color">; size?: number }) {
  const hex = colorHex(habit.color);
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[14px]"
      style={{ width: size, height: size, background: alpha(hex, 0.14), fontSize: size * 0.5 }}
    >
      {habit.emoji}
    </span>
  );
}

export function habitSubtitle(habit: Habit, engine: HabitEngine, today: string): string {
  const { current, unit } = engine.streaks();
  const s = engine.currentSchedule();
  const parts: string[] = [];
  if (s.kind === "times_per_week") {
    const wp = engine.weekProgress(toDayNum(today));
    parts.push(`${Math.min(wp.done, wp.target)}/${wp.target} this week`);
  }
  if (current > 0) parts.push(`🔥 ${formatStreak(current, unit)}`);
  else if (s.kind !== "times_per_week") parts.push(describeSchedule(s));
  return parts.join(" · ");
}

export function HabitRow({
  habit,
  engine,
  today,
  hasNote,
  onToggle,
  onNote,
  muted,
}: {
  habit: Habit;
  engine: HabitEngine;
  today: string;
  hasNote: boolean;
  onToggle: (done: boolean) => void;
  onNote: () => void;
  muted?: boolean;
}) {
  const hex = colorHex(habit.color);
  const done = engine.isDoneOn(today);
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-3xl bg-elevated py-3 pr-3 pl-3 shadow-card transition-opacity",
        muted && !done && "opacity-75",
      )}
    >
      <Link href={`/habits/${habit.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl">
        <HabitIcon habit={habit} />
        <span className="min-w-0">
          <span className={cn("block truncate text-[16px] font-semibold tracking-tight", done && "text-muted")}>{habit.name}</span>
          <span className="block truncate text-[13px] text-muted">{habitSubtitle(habit, engine, today)}</span>
        </span>
      </Link>
      {done && (
        <button
          type="button"
          onClick={onNote}
          aria-label={hasNote ? `Edit note for ${habit.name}` : `Add a note to ${habit.name}`}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
            hasNote ? "text-fg" : "text-subtle hover:text-fg",
          )}
          style={hasNote ? { background: alpha(hex, 0.14), color: hex } : undefined}
        >
          <NotebookPen className="size-4.5" />
        </button>
      )}
      <CheckButton checked={done} onToggle={() => onToggle(!done)} hex={hex} label={`Mark ${habit.name} ${done ? "not done" : "done"} today`} />
    </div>
  );
}
