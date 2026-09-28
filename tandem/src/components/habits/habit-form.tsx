"use client";

import { useRouter } from "next/navigation";
import { Bell, BellOff, Lock, Minus, Plus, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { COLORS, COLOR_NAMES, alpha, colorHex } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { WEEKDAY_SHORT } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { type ScheduleKind, describeSchedule } from "@/lib/habit-engine";
import { pushConfigured } from "@/lib/push";
import { useSaveHabit } from "@/lib/queries";
import type { HabitInput } from "@/lib/types";
import { habitNameSchema } from "@/lib/validation";
import { EmojiPicker } from "./emoji-picker";

function Stepper({ value, onChange, min, max, label }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex size-10 items-center justify-center rounded-full bg-sunken disabled:opacity-40"
      >
        <Minus className="size-4" />
      </button>
      <span className="tabular w-8 text-center text-xl font-bold" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`More ${label}`}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex size-10 items-center justify-center rounded-full bg-sunken disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function HabitForm({
  userId,
  habitId,
  initial,
  hasHistory,
}: {
  userId: string;
  habitId: string | null;
  initial: HabitInput;
  hasHistory?: boolean;
}) {
  const router = useRouter();
  const save = useSaveHabit(userId);
  const [v, setV] = useState<HabitInput>(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const hex = colorHex(v.color);
  const set = <K extends keyof HabitInput>(k: K, val: HabitInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const canRemind = pushConfigured();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const name = habitNameSchema.safeParse(v.name);
    if (!name.success) {
      setNameError(name.error.issues[0].message);
      return;
    }
    if (v.kind === "weekdays" && v.weekdays.length === 0) {
      setFormError("Pick at least one day of the week.");
      return;
    }
    save.mutate(
      { id: habitId, input: { ...v, name: name.data } },
      {
        onSuccess: (id) => {
          toast.success(habitId ? "Habit updated" : `${v.emoji} ${name.data} added`);
          router.push(habitId ? `/habits/${id}` : "/today");
        },
        onError: (err) => setFormError(friendlyError(err, "Couldn't save this habit.")),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {/* Preview + name */}
      <div className="flex items-end gap-3">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Change icon"
          className="flex size-16 shrink-0 items-center justify-center rounded-[20px] text-[32px] transition active:scale-95"
          style={{ background: alpha(hex, 0.16), boxShadow: `inset 0 0 0 2px ${alpha(hex, 0.35)}` }}
        >
          {v.emoji}
        </button>
        <Field label="Name" error={nameError} className="flex-1">
          {(id) => (
            <Input
              id={id}
              autoFocus={!habitId}
              placeholder="e.g. Gym, Read, Drink water"
              maxLength={60}
              value={v.name}
              onChange={(e) => {
                set("name", e.target.value);
                setNameError(null);
              }}
            />
          )}
        </Field>
      </div>

      <Field label="Description" hint="Optional — what does “done” mean?">
        {(id) => (
          <Textarea id={id} rows={2} maxLength={280} placeholder="e.g. 30 minutes, any kind of workout" value={v.description} onChange={(e) => set("description", e.target.value)} className="min-h-0" />
        )}
      </Field>

      <div className="space-y-2">
        <p className="px-1 text-[13px] font-semibold text-muted">Color</p>
        <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Color">
          {COLOR_NAMES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={v.color === c}
              aria-label={COLORS[c].label}
              onClick={() => set("color", c)}
              className={cn("size-9 rounded-full transition active:scale-90", v.color === c && "ring-[3px] ring-offset-2 ring-offset-[var(--bg)]")}
              style={{ background: COLORS[c].hex, ["--tw-ring-color" as string]: COLORS[c].hex }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="px-1 text-[13px] font-semibold text-muted">How often</p>
        <Segmented<ScheduleKind>
          value={v.kind}
          onChange={(k) => set("kind", k)}
          size="sm"
          options={[
            { value: "daily", label: "Daily" },
            { value: "weekdays", label: "Days" },
            { value: "times_per_week", label: "× / week" },
            { value: "interval", label: "Every N" },
          ]}
        />
        <div className="rounded-3xl bg-elevated p-4 shadow-card">
          {v.kind === "daily" && <p className="text-[15px] text-muted">Every single day. Classic.</p>}
          {v.kind === "weekdays" && (
            <div className="space-y-3">
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_SHORT.map((d, i) => {
                  const day = i + 1;
                  const on = v.weekdays.includes(day);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("weekdays", on ? v.weekdays.filter((x) => x !== day) : [...v.weekdays, day].sort())}
                      className="h-11 rounded-2xl text-[13px] font-semibold transition active:scale-95"
                      style={on ? { background: hex, color: "#fff" } : { background: "var(--bg-sunken)", color: "var(--fg-muted)" }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <p className="text-[13px] text-muted">
                {v.weekdays.length ? `${describeSchedule({ ...v, kind: "weekdays", weekdays: v.weekdays, times_per_week: null, interval_days: null })}. Other days never break your streak.` : "Pick at least one day."}
              </p>
            </div>
          )}
          {v.kind === "times_per_week" && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] text-muted">Any days you like, this many times each week (Mon–Sun).</p>
              <Stepper value={v.times_per_week} onChange={(n) => set("times_per_week", n)} min={1} max={7} label="times per week" />
            </div>
          )}
          {v.kind === "interval" && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] text-muted">
                Every <b className="text-fg">{v.interval_days}</b> days, counting from the start date.
              </p>
              <Stepper value={v.interval_days} onChange={(n) => set("interval_days", n)} min={2} max={60} label="days between" />
            </div>
          )}
        </div>
        {habitId && hasHistory && (
          <p className="px-1 text-[13px] text-subtle">Schedule changes apply from today — your past days keep their old rules.</p>
        )}
      </div>

      <Field label="Start date" hint="Days before this don't count.">
        {(id) => <Input id={id} type="date" value={v.start_date} onChange={(e) => e.target.value && set("start_date", e.target.value)} />}
      </Field>

      <div className="space-y-2">
        <p className="px-1 text-[13px] font-semibold text-muted">Who can see it</p>
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Visibility">
          {(
            [
              { value: "group", icon: UsersRound, title: "My groups", body: "Friends see progress & notes" },
              { value: "private", icon: Lock, title: "Private", body: "Only you, ever" },
            ] as const
          ).map((o) => {
            const on = v.visibility === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("visibility", o.value)}
                className={cn(
                  "rounded-3xl p-4 text-left transition active:scale-[0.98]",
                  on ? "bg-elevated shadow-card ring-2 ring-fg" : "bg-sunken text-muted",
                )}
              >
                <o.icon className="mb-2 size-5" />
                <span className="block font-semibold text-fg">{o.title}</span>
                <span className="block text-[13px] leading-snug">{o.body}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-3xl bg-elevated p-4 shadow-card">
        <div className="flex items-center gap-3">
          {v.reminder_time ? <Bell className="size-5 text-fg" /> : <BellOff className="size-5 text-muted" />}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Reminder</p>
            <p className="text-[13px] text-muted">
              {canRemind
                ? "A notification if it isn't done by this time."
                : "Notifications aren't set up on this server yet — you can still pick a time."}
            </p>
          </div>
          <Switch label="Reminder" checked={Boolean(v.reminder_time)} onChange={(on) => set("reminder_time", on ? "08:00" : null)} />
        </div>
        {v.reminder_time && (
          <Input
            type="time"
            aria-label="Reminder time"
            className="mt-3"
            value={v.reminder_time.slice(0, 5)}
            onChange={(e) => set("reminder_time", e.target.value || null)}
          />
        )}
      </div>

      {formError && (
        <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-[14px] font-medium text-danger">
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" loading={save.isPending}>
        {habitId ? "Save changes" : "Create habit"}
      </Button>

      <EmojiPicker open={pickerOpen} onClose={() => setPickerOpen(false)} value={v.emoji} onChange={(e) => set("emoji", e)} />
    </form>
  );
}
