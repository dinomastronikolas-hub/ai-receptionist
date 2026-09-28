import type { CSSProperties } from "react";
import { alpha } from "@/lib/colors";
import type { DayStatus } from "@/lib/habit-engine";

export const STATUS_LABEL: Record<DayStatus, string> = {
  done: "Completed",
  bonus: "Completed (extra day)",
  missed: "Missed",
  pending: "Not done yet",
  rest: "Not scheduled",
  open: "Open — weekly goal still reachable",
  before: "Before the habit started",
  future: "Upcoming",
};

export interface CellLook {
  style: CSSProperties;
  dot?: "rest" | "note";
}

export function cellLook(status: DayStatus, hex: string, hasNote = false): CellLook {
  switch (status) {
    case "done":
      return { style: { background: hex }, dot: hasNote ? "note" : undefined };
    case "bonus":
      return { style: { background: alpha(hex, 0.55) }, dot: hasNote ? "note" : undefined };
    case "missed":
      return { style: { background: "var(--cell-missed)" } };
    case "open":
      return { style: { background: "var(--cell-open)" } };
    case "pending":
      return { style: { background: "var(--cell-open)", boxShadow: `inset 0 0 0 1.5px ${alpha(hex, 0.7)}` } };
    case "rest":
      return { style: { background: "transparent" }, dot: "rest" };
    case "before":
    case "future":
      return { style: { background: "transparent", visibility: "hidden" } };
  }
}

/** GitHub-style intensity for "share of due habits completed" (0–1). */
export function intensityLook(value: number | null, hex: string): CellLook {
  if (value === null) return { style: { background: "transparent" }, dot: "rest" };
  if (value <= 0) return { style: { background: "var(--cell-missed)" } };
  const a = value >= 1 ? 1 : value >= 0.75 ? 0.75 : value >= 0.5 ? 0.55 : 0.32;
  return { style: { background: alpha(hex, a) } };
}
