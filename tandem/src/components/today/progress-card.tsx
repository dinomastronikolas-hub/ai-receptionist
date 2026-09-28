"use client";

import { motion } from "motion/react";
import { Card } from "@/components/ui/card";

export function ProgressRing({ value, size = 76, stroke = 8, color = "var(--brand)" }: { value: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={false}
        animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, value))) }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </svg>
  );
}

export function ProgressCard({ done, due }: { done: number; due: number }) {
  const pct = due > 0 ? done / due : 0;
  const left = due - done;
  const message =
    due === 0
      ? "Nothing scheduled today — enjoy the rest day."
      : left === 0
        ? "Perfect day. Everything's done! 🎉"
        : done === 0
          ? "Let's get the first one in."
          : left === 1
            ? "Just one to go."
            : `${left} to go — keep it rolling.`;
  return (
    <Card className="flex items-center gap-5 p-5">
      <div className="relative">
        <ProgressRing value={pct} />
        <span className="tabular absolute inset-0 flex items-center justify-center text-[17px] font-bold">
          {due > 0 ? `${Math.round(pct * 100)}%` : "—"}
        </span>
      </div>
      <div className="min-w-0">
        <p className="tabular text-[22px] font-bold tracking-tight">
          {done} <span className="text-muted">of</span> {due} <span className="text-muted">done</span>
        </p>
        <p className="mt-0.5 text-[15px] text-muted">{message}</p>
      </div>
    </Card>
  );
}
