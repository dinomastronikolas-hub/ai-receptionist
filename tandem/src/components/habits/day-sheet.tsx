"use client";

import { Check, RotateCcw } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { STATUS_LABEL } from "@/components/grid/cell-style";
import { alpha, colorHex } from "@/lib/colors";
import { formatDay, toDayNum } from "@/lib/dates";
import type { HabitEngine } from "@/lib/habit-engine";
import { useNote, useToggleCompletion } from "@/lib/queries";
import type { Habit } from "@/lib/types";
import { NoteEditor } from "./note-sheet";

/**
 * Details for one square of a history grid. Owners can back-fill or undo a
 * day and edit its note; friends see the status and note read-only.
 */
export function DaySheet({
  habit,
  engine,
  day,
  onClose,
  userId,
  ownerName,
}: {
  habit: Habit;
  engine: HabitEngine;
  day: string | null;
  onClose: () => void;
  userId: string;
  ownerName?: string;
}) {
  return (
    <Sheet open={Boolean(day)} onClose={onClose} title={day ? formatDay(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : ""}>
      {day && <DayDetails key={day} habit={habit} engine={engine} day={day} userId={userId} ownerName={ownerName} />}
    </Sheet>
  );
}

function DayDetails({ habit, engine, day, userId, ownerName }: { habit: Habit; engine: HabitEngine; day: string; userId: string; ownerName?: string }) {
  const hex = colorHex(habit.color);
  const status = engine.status(toDayNum(day));
  const done = status === "done" || status === "bonus";
  const isOwner = habit.user_id === userId;
  const toggle = useToggleCompletion(userId);
  const { data: note } = useNote(habit.id, day, done && !isOwner);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl p-3" style={{ background: alpha(hex, done ? 0.14 : 0.06) }}>
        <span className="text-2xl" aria-hidden>
          {habit.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{habit.name}</p>
          <p className="text-sm" style={{ color: done ? hex : undefined }}>
            {STATUS_LABEL[status]}
          </p>
        </div>
        {done && <Check className="size-5" style={{ color: hex }} strokeWidth={3} />}
      </div>

      {isOwner ? (
        <>
          <button
            type="button"
            onClick={() => toggle.mutate({ habitId: habit.id, day, done: !done })}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.98]"
            style={done ? { background: "var(--bg-sunken)" } : { background: hex, color: "#fff" }}
          >
            {done ? (
              <>
                <RotateCcw className="size-4" /> Mark as not done
              </>
            ) : (
              <>
                <Check className="size-4" strokeWidth={3} /> Mark as done
              </>
            )}
          </button>
          {done && <NoteEditor habit={habit} day={day} userId={userId} showDate={false} />}
        </>
      ) : done ? (
        note ? (
          <blockquote className="rounded-2xl bg-sunken p-4 text-[15px] leading-relaxed">
            “{note}”<footer className="mt-1.5 text-xs text-muted">— {ownerName ?? "their note"}</footer>
          </blockquote>
        ) : (
          <p className="text-sm text-muted">No note for this day.</p>
        )
      ) : null}
    </div>
  );
}
