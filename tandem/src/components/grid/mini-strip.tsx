"use client";

import { cn } from "@/lib/cn";
import { addDays, formatDay, toDayNum } from "@/lib/dates";
import type { HabitEngine } from "@/lib/habit-engine";
import { STATUS_LABEL, cellLook } from "./cell-style";

/** Compact row of the last `days` days — used on friend cards. */
export function MiniStrip({
  engine,
  hex,
  today,
  days = 14,
  className,
}: {
  engine: HabitEngine;
  hex: string;
  today: string;
  days?: number;
  className?: string;
}) {
  const items = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  return (
    <div className={cn("flex gap-[3px]", className)} role="img" aria-label={`Last ${days} days`}>
      {items.map((iso) => {
        const status = engine.status(toDayNum(iso));
        const look = cellLook(status, hex);
        const hidden = status === "before";
        return (
          <span
            key={iso}
            title={`${formatDay(iso, { weekday: "short", month: "short", day: "numeric" })}: ${STATUS_LABEL[status]}`}
            className="relative aspect-square max-w-7 min-w-0 flex-1 rounded-[4px]"
            style={hidden ? { background: "transparent" } : look.style}
          >
            {look.dot === "rest" && !hidden && (
              <span className="absolute inset-0 m-auto size-[3px] rounded-full bg-[var(--cell-rest-dot)]" />
            )}
          </span>
        );
      })}
    </div>
  );
}
