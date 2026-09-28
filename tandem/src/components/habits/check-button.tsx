"use client";

import { AnimatePresence, motion } from "motion/react";
import { alpha } from "@/lib/colors";
import { cn } from "@/lib/cn";

const PARTICLES = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2;
  return { x: Math.cos(angle) * 30, y: Math.sin(angle) * 30 };
});

export function CheckButton({
  checked,
  onToggle,
  hex,
  label,
  size = 48,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  hex: string;
  label: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (!checked && "vibrate" in navigator) navigator.vibrate?.(8);
        onToggle();
      }}
      className={cn("relative shrink-0 rounded-full outline-offset-4 disabled:opacity-60")}
      style={{ width: size, height: size }}
    >
      <motion.span
        className="absolute inset-0 rounded-full"
        initial={false}
        animate={{
          backgroundColor: checked ? hex : alpha(hex, 0),
          boxShadow: checked ? `inset 0 0 0 2px ${hex}` : `inset 0 0 0 2px ${alpha(hex, 0.4)}`,
          scale: checked ? [1, 0.82, 1.08, 1] : 1,
        }}
        transition={{ duration: 0.38, ease: "easeOut" }}
      />
      <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto" width={size * 0.5} height={size * 0.5} aria-hidden>
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          fill="none"
          stroke={checked ? "#fff" : alpha(hex, 0.0)}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0 }}
          transition={{ duration: 0.28, delay: checked ? 0.08 : 0 }}
        />
      </svg>
      <AnimatePresence initial={false}>
        {checked && (
          <motion.span key="burst" className="pointer-events-none absolute inset-0" initial="hidden" animate="show" exit="hidden">
            {PARTICLES.map((p, i) => (
              <motion.span
                key={i}
                className="absolute top-1/2 left-1/2 size-1.5 rounded-full"
                style={{ background: hex, marginLeft: -3, marginTop: -3 }}
                variants={{
                  hidden: { x: 0, y: 0, opacity: 0, scale: 0.4 },
                  show: { x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0.4, 1, 0.6], transition: { duration: 0.55, ease: "easeOut" } },
                }}
              />
            ))}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
