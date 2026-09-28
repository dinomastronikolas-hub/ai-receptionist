"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { formatDay } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { useNote, useSaveNote } from "@/lib/queries";
import type { Habit } from "@/lib/types";

export function NoteSheet({
  habit,
  day,
  userId,
  onClose,
}: {
  habit: Habit | null;
  day: string;
  userId: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={Boolean(habit)} onClose={onClose} title={habit ? `${habit.emoji} ${habit.name}` : ""}>
      {habit && <NoteEditor key={`${habit.id}-${day}`} habit={habit} day={day} userId={userId} onDone={onClose} />}
    </Sheet>
  );
}

export function NoteEditor({ habit, day, userId, onDone }: { habit: Habit; day: string; userId: string; onDone?: () => void }) {
  const { data: note, isLoading } = useNote(habit.id, day, true);
  const [draft, setDraft] = useState<string | null>(null);
  const save = useSaveNote(userId);
  const value = draft ?? note ?? "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          { habitId: habit.id, day, note: value },
          {
            onSuccess: () => {
              toast.success(value.trim() ? "Note saved" : "Note removed");
              onDone?.();
            },
            onError: (err) => toast.error(friendlyError(err, "Couldn't save your note.")),
          },
        );
      }}
    >
      <p className="mb-3 text-sm text-muted">{formatDay(day)}</p>
      <Textarea
        autoFocus
        maxLength={280}
        placeholder={isLoading ? "Loading…" : "How did it go? e.g. “Leg day — 45 min”"}
        value={value}
        disabled={isLoading}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="mt-1.5 flex justify-between px-1 text-xs text-subtle">
        <span>{habit.visibility === "group" ? "Visible to your group" : "Only you can see this"}</span>
        <span className="tabular">{value.length}/280</span>
      </div>
      <Button type="submit" className="mt-4 w-full" size="lg" loading={save.isPending}>
        Save note
      </Button>
    </form>
  );
}
