"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Lock, Pencil, Trash2, UsersRound } from "lucide-react";
import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckButton } from "@/components/habits/check-button";
import { DaySheet } from "@/components/habits/day-sheet";
import { HabitIcon } from "@/components/habits/habit-row";
import { RANGE_DAYS, RANGE_OPTIONS, type GridRange } from "@/components/grid/habit-history-card";
import { GridLegend, HistoryGrid } from "@/components/grid/history-grid";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile } from "@/components/stats/stat-tile";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { ConfirmSheet } from "@/components/ui/sheet";
import { PageSkeleton } from "@/components/ui/skeleton";
import { alpha, colorHex } from "@/lib/colors";
import { addDays, formatDay, relativeDayLabel, toDayNum } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { describeSchedule, formatStreak, ratePercent } from "@/lib/habit-engine";
import { useDeleteHabit, useUpdateHabit } from "@/lib/queries";
import { getSupabase } from "@/lib/supabase/client";
import { useCheckIn } from "@/lib/use-check-in";
import { useMyHabits } from "@/lib/use-me";

function useRecentNotes(habitId: string, version: number) {
  return useQuery({
    queryKey: ["notes", habitId, version],
    queryFn: async () => {
      const res = await getSupabase()
        .from("habit_completions")
        .select("completed_on, note")
        .eq("habit_id", habitId)
        .not("note", "is", null)
        .order("completed_on", { ascending: false })
        .limit(8);
      if (res.error) throw res.error;
      return res.data as { completed_on: string; note: string }[];
    },
  });
}

export default function HabitPage({ params }: PageProps<"/habits/[habitId]">) {
  const { habitId } = use(params);
  const router = useRouter();
  const { userId, habits, engines, history, today, isLoading } = useMyHabits();
  const [range, setRange] = useState<GridRange>("half");
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const checkIn = useCheckIn(userId);
  const update = useUpdateHabit(userId);
  const del = useDeleteHabit(userId);
  const habit = habits.find((h) => h.id === habitId);
  const noteVersion = history?.get(habitId)?.noteDays.size ?? 0;
  const notes = useRecentNotes(habitId, noteVersion);

  if (isLoading) return <PageSkeleton />;
  if (!habit) {
    return (
      <>
        <PageHeader back="/today" title="Habit not found" />
        <EmptyState emoji="🫥" title="This habit doesn't exist" body="It may have been deleted." action={<ButtonLink href="/today">Back to today</ButtonLink>} />
      </>
    );
  }

  const engine = engines.get(habit.id)!;
  const hex = colorHex(habit.color);
  const { current, longest, unit } = engine.streaks();
  const week = ratePercent(engine.rate(addDays(today, -6), today));
  const month = ratePercent(engine.rate(addDays(today, -29), today));
  const allTime = ratePercent(engine.rate(habit.start_date, today));
  const total = engine.totalCompletions();
  const doneToday = engine.isDoneOn(today);
  const started = toDayNum(habit.start_date) <= toDayNum(today);
  const archived = Boolean(habit.archived_at);

  const setArchived = (on: boolean) =>
    update.mutate(
      { id: habit.id, patch: { archived_at: on ? new Date().toISOString() : null } },
      {
        onSuccess: () => toast.success(on ? "Archived — history is kept" : "Restored"),
        onError: (e) => toast.error(friendlyError(e)),
      },
    );

  return (
    <div className="space-y-6">
      <PageHeader
        back
        title={
          <span className="flex items-center gap-3">
            <HabitIcon habit={habit} size={48} />
            <span className="min-w-0 break-words">{habit.name}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{describeSchedule(engine.currentSchedule())}</span>
            <span className="inline-flex items-center gap-1">
              {habit.visibility === "group" ? <UsersRound className="size-3.5" /> : <Lock className="size-3.5" />}
              {habit.visibility === "group" ? "Shared with groups" : "Private"}
            </span>
            {archived && <span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold">Archived</span>}
          </span>
        }
        action={
          <Link href={`/habits/${habit.id}/edit`} aria-label="Edit habit" className={buttonClass("secondary", "icon")}>
            <Pencil className="size-4.5" />
          </Link>
        }
      />

      {habit.description && <p className="-mt-3 text-[15px] leading-relaxed text-muted">{habit.description}</p>}

      {!archived && started && (
        <Card className="flex items-center gap-4 p-4" style={{ background: doneToday ? alpha(hex, 0.12) : undefined }}>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{doneToday ? "Done for today" : "Today"}</p>
            <p className="text-[13px] text-muted">
              {engine.isDue(toDayNum(today)) || doneToday ? formatDay(today) : "Not scheduled today — you can still check it off"}
            </p>
          </div>
          <CheckButton
            checked={doneToday}
            hex={hex}
            size={56}
            label={`Mark ${habit.name} ${doneToday ? "not done" : "done"} today`}
            onToggle={() => checkIn(habit, today, !doneToday, history, today)}
          />
        </Card>
      )}
      {!started && (
        <Card className="p-4 text-[15px] text-muted">Starts {formatDay(habit.start_date)}.</Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Current streak" value={formatStreak(current, unit)} accent={current > 0 ? hex : undefined} sub={current > 0 ? "🔥 keep going" : "start one today"} />
        <StatTile label="Longest streak" value={formatStreak(longest, unit)} />
        <StatTile label="Total" value={total} sub="check-ins" />
        <StatTile label="Last 7 days" value={week === null ? "—" : `${week}%`} />
        <StatTile label="Last 30 days" value={month === null ? "—" : `${month}%`} />
        <StatTile label="All time" value={allTime === null ? "—" : `${allTime}%`} />
      </div>

      <section>
        <SectionTitle>History</SectionTitle>
        <Card className="p-4">
          <HistoryGrid
            engine={engine}
            hex={hex}
            noteDays={history?.get(habit.id)?.noteDays}
            from={addDays(today, -RANGE_DAYS[range] + 1)}
            to={today}
            today={today}
            onSelect={setSelected}
            selected={selected}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <GridLegend hex={hex} />
            <Segmented value={range} onChange={setRange} options={RANGE_OPTIONS} size="sm" className="w-full sm:w-auto" />
          </div>
          <p className="mt-3 text-[12px] text-subtle">Tap a square to see the day, add a note, or fix a missed check-in.</p>
        </Card>
      </section>

      {notes.data && notes.data.length > 0 && (
        <section>
          <SectionTitle>Notes</SectionTitle>
          <Card className="divide-y divide-line">
            {notes.data.map((n) => (
              <button key={n.completed_on} type="button" onClick={() => setSelected(n.completed_on)} className="block w-full px-4 py-3 text-left hover:bg-sunken/50">
                <p className="text-[12px] font-semibold text-subtle">{relativeDayLabel(n.completed_on, today)}</p>
                <p className="text-[15px]">{n.note}</p>
              </button>
            ))}
          </Card>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 pt-2">
        <button type="button" onClick={() => setArchived(!archived)} disabled={update.isPending} className={buttonClass("secondary", "md")}>
          {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          {archived ? "Restore" : "Archive"}
        </button>
        <button type="button" onClick={() => setConfirmDelete(true)} className={buttonClass("secondary", "md", "text-danger")}>
          <Trash2 className="size-4" /> Delete
        </button>
      </section>
      <p className="-mt-3 px-1 text-[12px] text-subtle">Archiving hides the habit but keeps its history. Deleting removes it and every check-in for good.</p>

      <DaySheet habit={habit} engine={engine} day={selected} onClose={() => setSelected(null)} userId={userId} />
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete “${habit.name}”?`}
        body={`This permanently removes the habit and all ${total} check-ins, notes and reactions. If you just want it out of the way, archive it instead.`}
        confirmLabel="Delete forever"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(habit.id, {
            onSuccess: () => {
              toast.success("Habit deleted");
              router.replace("/today");
            },
            onError: (e) => toast.error(friendlyError(e)),
          })
        }
      />
    </div>
  );
}
