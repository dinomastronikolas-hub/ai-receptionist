"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useIsClient } from "@/lib/use-is-client";

/**
 * Bottom sheet on phones, centered dialog on larger screens.
 * Drag the handle down, tap the backdrop or press Escape to close.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useDragControls();
  const mounted = useIsClient();

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            className={cn(
              "pb-safe relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-elevated shadow-float outline-none sm:max-w-md sm:rounded-[28px]",
              className,
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 600) onClose();
            }}
          >
            <div
              className="sticky top-0 z-10 cursor-grab touch-none bg-elevated px-5 pt-2.5 pb-1 active:cursor-grabbing"
              onPointerDown={(e) => drag.start(e)}
            >
              <div className="mx-auto h-1.5 w-10 rounded-full bg-line-strong sm:hidden" />
              <div className="flex min-h-10 items-center justify-between gap-3 pt-2">
                {title ? (
                  <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                    {title}
                  </h2>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex size-9 items-center justify-center rounded-full bg-sunken text-muted hover:text-fg"
                >
                  <X className="size-4.5" />
                </button>
              </div>
            </div>
            <div className="px-5 pt-2 pb-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ConfirmSheet({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  onConfirm,
  loading,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="text-[15px] leading-relaxed text-muted">{body}</div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className="h-12 rounded-full bg-sunken font-semibold">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={cn("h-12 rounded-full font-semibold disabled:opacity-60", danger ? "bg-danger text-white" : "bg-primary text-primary-fg")}
        >
          {loading ? "Working…" : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
