import type { ColorName } from "./types";

/** Habit / avatar palette. Hex values tuned to read well on light and dark. */
export const COLORS: Record<ColorName, { label: string; hex: string }> = {
  rose: { label: "Rose", hex: "#f43f5e" },
  orange: { label: "Orange", hex: "#f97316" },
  amber: { label: "Amber", hex: "#f59e0b" },
  lime: { label: "Lime", hex: "#84cc16" },
  emerald: { label: "Emerald", hex: "#10b981" },
  teal: { label: "Teal", hex: "#14b8a6" },
  sky: { label: "Sky", hex: "#0ea5e9" },
  blue: { label: "Blue", hex: "#3b82f6" },
  violet: { label: "Violet", hex: "#8b5cf6" },
  fuchsia: { label: "Fuchsia", hex: "#d946ef" },
};

export const COLOR_NAMES = Object.keys(COLORS) as ColorName[];

export function colorHex(name: string | null | undefined): string {
  return COLORS[(name as ColorName) ?? "emerald"]?.hex ?? COLORS.emerald.hex;
}

/** `#rrggbb` + alpha → rgba() */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
