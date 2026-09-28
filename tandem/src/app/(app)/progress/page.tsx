"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { CalendarGrid, type CalendarCell } from "@/components/grid/calendar-grid";
import { intensityLook } from "@/components/grid/cell-style";
import { HabitHistoryCard } from "@/components/grid/habit-history-card";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile } from "@/components/stats/stat-tile";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { PageSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { alpha, colorHex } from "@/lib/colors";
import { addDays, diffDays, formatShortDay, toDayNum } from "@/lib/dates";
import { combinedRate, countPerfectDays, dayProgress, formatStreak, ratePercent } from "@/lib/habit-engine";
import { useMyHabits } from "@/lib/use-me";

type Preset = "7" | "30" | "90" | "365" | "custom";
const PRESETS: { value: Preset; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "Year" },
  { value: "custom", label: "Custom" },
];

const BRAND = "#10b981";

export default function ProgressPage() {
  const { userId, today, habits, engines, history, isLoading } = useMyHabits();
  const [preset, setPreset] = useState<Preset>("90");
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => ({ from: addDays(today, -59), to: today }));
  const [habitFilter, setHabitFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);

  const { from, to } = useMemo(() => {
    if (preset !== "custom") return { from: addDays(today, -Number(preset) + 1), to: today };
    let f = custom.from > today ? today : custom.from;
    let t = custom.to > today ? today : custom.to;
    if (f > t) [f, t] = [t, f];
    if (diffDays(t, f) > 365 * 3) f = addDays(t, -365 * 3);
    return { from: f, to: t };
  }, [preset, custom, today]);

  const visible = useMemo(() => habits.filter((h) => showArchived || !h.archived_at), [habits, showArchived]);
  const selected = useMemo(() => (habitFilter === "all" ? visible : visible.filter((h) => h.id === habitFilter)), [visible, habitFilter]);
  const selectedEngines = useMemo(() => selected.map((h) => engines.get(h.id)!).filter(Boolean), [selected, engines]);

  const summary = useMemo(() => {
    const rate = ratePercent(combinedRate(selectedEngines, from, to));
    const checkIns = selectedEngines.reduce((n, e) => n + e.totalCompletions(from, to), 0);
    const perfect = countPerfectDays(selectedEngines, from, to);
    let best: { name: string; current: number; unit: "day" | "week"; hex: string } | null = null;
    for (const h of selected) {
      const s = engines.get(h.id)!.streaks();
      if (s.current > 0 && (!best || s.current * (s.unit === "week" ? 7 : 1) > best.current * (best.unit === "week" ? 7 : 1))) {
        best = { name: h.name, current: s.current, unit: s.unit, hex: colorHex(h.color) };
      }
    }
    return { rate, checkIns, perfect, best };
  }, [selectedEngines, selected, engines, from, to]);

  const overallCell = useCallback(
    (day: number): CalendarCell => {
      if (day > toDayNum(today)) return { style: { visibility: "hidden" }, label: "Upcoming", clickable: false };
      const p = dayProgress(selectedEngines, day);
      const value = p.due > 0 ? p.done / p.due : null;
      const look = intensityLook(value, BRAND);
      return { ...look, label: p.due > 0 ? `${p.done} of ${p.due} done` : "Nothing scheduled", clickable: false };
    },
    [selectedEngines, today],
  );

  if (isLoading) return <PageSkeleton />;

  if (habits.length === 0) {
    return (
      <>
        <PageHeader title="Progress" />
        <EmptyState emoji="📈" title="Nothing to chart yet" body="Create a habit and check it off — your history grid will start filling in right away." action={<ButtonLink href="/habits/new">Create a habit</ButtonLink>} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Progress"
        subtitle={`${formatShortDay(from)} – ${formatShortDay(to)}`}
        action={
          <Link href="/habits" aria-label="Manage habits" className={buttonClass("secondary", "icon")}>
            <Settings2 className="size-4.5" />
          </Link>
        }
      />

      <div className="space-y-3">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={preset === p.value}
              onClick={() => setPreset(p.value)}
              className={cn(
                "h-9 shrink-0 rounded-full px-4 text-[14px] font-semibold transition",
                preset === p.value ? "bg-primary text-primary-fg" : "bg-elevated text-muted shadow-card hover:text-fg",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" aria-label="From" value={custom.from} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
            <Input type="date" aria-label="To" value={custom.to} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        )}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          <button
            type="button"
            aria-pressed={habitFilter === "all"}
            onClick={() => setHabitFilter("all")}
            className={cn(
              "h-9 shrink-0 rounded-full px-4 text-[14px] font-semibold transition",
              habitFilter === "all" ? "bg-primary text-primary-fg" : "bg-elevated text-muted shadow-card",
            )}
          >
            All habits
          </button>
          {visible.map((h) => {
            const on = habitFilter === h.id;
            const hex = colorHex(h.color);
            return (
              <button
                key={h.id}
                type="button"
                aria-pressed={on}
                onClick={() => setHabitFilter(on ? "all" : h.id)}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold shadow-card transition"
                style={on ? { background: hex, color: "#fff" } : { background: "var(--bg-elevated)", color: "var(--fg-muted)" }}
              >
                <span aria-hidden>{h.emoji}</span>
                {h.name}
              </button>
            );
          })}
        </div>
        {habits.some((h) => h.archived_at) && (
          <label className="flex items-center gap-2 px-1 text-[14px] text-muted">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4 accent-[var(--brand)]" />
            Include archived habits
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Consistency" value={summary.rate === null ? "—" : `${summary.rate}%`} sub="of scheduled check-ins" accent={summary.rate !== null ? BRAND : undefined} />
        <StatTile label="Check-ins" value={summary.checkIns} sub="in this period" />
        <StatTile label="Perfect days" value={summary.perfect} sub="everything due, done" />
        <StatTile
          label="Best streak now"
          value={summary.best ? formatStreak(summary.best.current, summary.best.unit) : "—"}
          sub={summary.best?.name ?? "check in to start one"}
          accent={summary.best?.hex}
        />
      </div>

      {habitFilter === "all" && selectedEngines.length > 1 && (
        <section>
          <SectionTitle>All habits</SectionTitle>
          <Card className="p-4">
            <CalendarGrid from={from} to={to} today={today} cell={overallCell} />
            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-subtle">
              Less
              {[0, 0.3, 0.6, 0.8, 1].map((v) => (
                <span key={v} className="size-2.5 rounded-[3px]" style={v === 0 ? { background: "var(--cell-missed)" } : { background: alpha(BRAND, v) }} />
              ))}
              More
            </div>
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle>{habitFilter === "all" ? "Each habit" : "History"}</SectionTitle>
        {selected.map((h) => (
          <HabitHistoryCard
            key={h.id}
            habit={h}
            engine={engines.get(h.id)!}
            noteDays={history?.get(h.id)?.noteDays}
            today={today}
            userId={userId}
            href={`/habits/${h.id}`}
            range="half"
            from={from}
            to={to}
          />
        ))}
      </section>
      <p className="px-1 text-center text-[12px] text-subtle">
        Consistency counts only scheduled days — rest days never count against you.
      </p>
    </div>
  );
}
