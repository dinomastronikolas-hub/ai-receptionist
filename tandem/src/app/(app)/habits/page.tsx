"use client";

import Link from "next/link";
import { ArchiveRestore, ChevronRight, GripVertical, Plus } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { HabitIcon } from "@/components/habits/habit-row";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/errors";
import { describeSchedule } from "@/lib/habit-engine";
import { useReorderHabits, useUpdateHabit } from "@/lib/queries";
import { useMyHabits } from "@/lib/use-me";
import type { Habit } from "@/lib/types";
import type { HabitEngine } from "@/lib/habit-engine";

function Row({ habit, engine, onDragEnd }: { habit: Habit; engine: HabitEngine; onDragEnd: () => void }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={habit}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="relative flex items-center gap-2 rounded-3xl bg-elevated py-2.5 pr-3 pl-1.5 shadow-card"
      whileDrag={{ scale: 1.02, boxShadow: "var(--shadow-float)", zIndex: 10 }}
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${habit.name}`}
        className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-subtle active:cursor-grabbing"
        onPointerDown={(e) => controls.start(e)}
      >
        <GripVertical className="size-5" />
      </button>
      <Link href={`/habits/${habit.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <HabitIcon habit={habit} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{habit.name}</span>
          <span className="block truncate text-[13px] text-muted">
            {describeSchedule(engine.currentSchedule())} · {habit.visibility === "group" ? "Shared" : "Private"}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-subtle" />
      </Link>
    </Reorder.Item>
  );
}

export default function ManageHabitsPage() {
  const { userId, active, archived, engines, isLoading } = useMyHabits();
  const reorder = useReorderHabits(userId);
  const update = useUpdateHabit(userId);
  const [order, setOrder] = useState<Habit[] | null>(null);
  const items = order ?? active;

  return (
    <div className="space-y-6">
      <PageHeader
        back
        title="Your habits"
        subtitle="Drag to reorder. Tap to see history."
        action={
          <Link href="/habits/new" aria-label="New habit" className={buttonClass("primary", "icon")}>
            <Plus className="size-5" />
          </Link>
        }
      />
      {isLoading ? (
        <PageSkeleton />
      ) : active.length === 0 && archived.length === 0 ? (
        <EmptyState emoji="🌱" title="No habits yet" body="Create your first habit to get started." action={<ButtonLink href="/habits/new">Create a habit</ButtonLink>} />
      ) : (
        <>
          <Reorder.Group axis="y" values={items} onReorder={setOrder} className="space-y-2.5">
            {items.map((h) => (
              <Row
                key={h.id}
                habit={h}
                engine={engines.get(h.id)!}
                onDragEnd={() => {
                  if (!order) return;
                  const ids = order.map((x) => x.id);
                  if (ids.join() !== active.map((x) => x.id).join()) reorder.mutate(ids, { onSettled: () => setOrder(null) });
                  else setOrder(null);
                }}
              />
            ))}
          </Reorder.Group>

          {archived.length > 0 && (
            <section>
              <SectionTitle>Archived</SectionTitle>
              <Card className="divide-y divide-line">
                {archived.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                    <Link href={`/habits/${h.id}`} className="flex min-w-0 flex-1 items-center gap-3 opacity-70">
                      <HabitIcon habit={h} size={36} />
                      <span className="truncate font-medium">{h.name}</span>
                    </Link>
                    <button
                      type="button"
                      className={buttonClass("secondary", "sm")}
                      onClick={() =>
                        update.mutate(
                          { id: h.id, patch: { archived_at: null } },
                          { onSuccess: () => toast.success(`${h.name} restored`), onError: (e) => toast.error(friendlyError(e)) },
                        )
                      }
                    >
                      <ArchiveRestore className="size-4" /> Restore
                    </button>
                  </div>
                ))}
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}
