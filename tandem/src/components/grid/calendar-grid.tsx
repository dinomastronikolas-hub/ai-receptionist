"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/cn";
import { WEEKDAY_LETTER, fromDayNum, monthLabel, toDayNum, weekStartDayNum } from "@/lib/dates";
import type { CellLook } from "./cell-style";

export interface CalendarCell extends CellLook {
  label: string;
  clickable: boolean;
}

/**
 * GitHub-style calendar: one column per week (Mon→Sun top to bottom), most
 * recent week on the right. Cell size adapts to the container width and the
 * grid scrolls horizontally (pinned to "now") when it can't fit.
 */
export function CalendarGrid({
  from,
  to,
  today,
  cell,
  onSelect,
  selected,
  className,
  showWeekdays = true,
}: {
  from: string;
  to: string;
  today: string;
  cell: (day: number) => CalendarCell;
  onSelect?: (iso: string) => void;
  selected?: string | null;
  className?: string;
  showWeekdays?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstWs = weekStartDayNum(toDayNum(from));
  const lastWs = weekStartDayNum(toDayNum(to));
  const weeks = Math.max(1, (lastWs - firstWs) / 7 + 1);
  const fromN = toDayNum(from);
  const toN = toDayNum(to);
  const todayN = toDayNum(today);
  const selectedN = selected ? toDayNum(selected) : null;

  const months = useMemo(() => {
    const out: { col: number; label: string }[] = [];
    let prevMonth = "";
    for (let w = 0; w < weeks; w++) {
      // Label a column with the month its first in-range day belongs to.
      const day = Math.max(firstWs + w * 7, fromN);
      const iso = fromDayNum(day);
      const m = iso.slice(0, 7);
      if (m !== prevMonth) {
        if (out.length === 0 || w - out[out.length - 1].col >= 3) out.push({ col: w, label: monthLabel(iso) });
        prevMonth = m;
      }
    }
    return out;
  }, [weeks, firstWs, fromN]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks, to]);

  const cells: React.ReactNode[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let r = 0; r < 7; r++) {
      const day = firstWs + w * 7 + r;
      const inRange = day >= fromN && day <= toN;
      if (!inRange) {
        cells.push(<span key={day} aria-hidden />);
        continue;
      }
      const c = cell(day);
      const iso = fromDayNum(day);
      const isToday = day === todayN;
      const isSelected = day === selectedN;
      const common = cn(
        "relative block rounded-[3px] transition-transform",
        isSelected && "ring-2 ring-fg ring-offset-1 ring-offset-[var(--bg-elevated)] z-10",
        isToday && !isSelected && "ring-1 ring-fg/40",
      );
      const inner =
        c.dot === "rest" ? (
          <span className="absolute inset-0 m-auto size-[3px] rounded-full bg-[var(--cell-rest-dot)]" />
        ) : c.dot === "note" ? (
          <span className="absolute inset-0 m-auto size-[4px] rounded-full bg-white/80" />
        ) : null;
      cells.push(
        c.clickable && onSelect ? (
          <button
            key={day}
            type="button"
            aria-label={`${iso}: ${c.label}`}
            onClick={() => onSelect(iso)}
            className={cn(common, "hover:scale-125 focus-visible:scale-125")}
            style={c.style}
          >
            {inner}
          </button>
        ) : (
          <span key={day} className={common} style={c.style} title={`${iso}: ${c.label}`}>
            {inner}
          </span>
        ),
      );
    }
  }

  return (
    <div className={cn("history-grid", className)}>
      <div className="history-grid-inner flex" style={{ "--weeks": weeks } as React.CSSProperties}>
        {showWeekdays && (
          <div
            className="grid w-5 shrink-0"
            style={{ gridTemplateRows: "repeat(7, var(--cell))", rowGap: "var(--gap)", paddingTop: "calc(0.875rem + 0.375rem)" }}
            aria-hidden
          >
            {WEEKDAY_LETTER.map((l, i) => (
              <span key={i} className="text-[9px] leading-[var(--cell)] font-medium text-subtle">
                {i % 2 === 0 ? l : ""}
              </span>
            ))}
          </div>
        )}
        <div ref={scrollRef} className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
          <div className="inline-flex flex-col gap-1.5 pr-0.5">
            <div className="flex" style={{ gap: "var(--gap)" }}>
              {Array.from({ length: weeks }, (_, w) => {
                const m = months.find((x) => x.col === w);
                return (
                  <span key={w} className="relative h-3.5 shrink-0" style={{ width: "var(--cell)" }}>
                    {m && <span className="absolute left-0 text-[10px] font-medium whitespace-nowrap text-subtle">{m.label}</span>}
                  </span>
                );
              })}
            </div>
            <div
              role="grid"
              className="grid"
              style={{
                gridTemplateRows: "repeat(7, var(--cell))",
                gridAutoColumns: "var(--cell)",
                gridAutoFlow: "column",
                gap: "var(--gap)",
              }}
            >
              {cells}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
