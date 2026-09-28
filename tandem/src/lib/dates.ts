/**
 * Calendar-day helpers.
 *
 * All habit logic works on *calendar days* represented as ISO strings
 * ("2026-09-28") or integer day numbers (days since 1970-01-01). A day number
 * is pure calendar arithmetic — it is never derived from the device clock's
 * UTC offset, so there are no off-by-one errors around midnight or DST.
 *
 * The only place a real instant is turned into a calendar day is
 * `todayInTimeZone`, which asks Intl for the wall-clock date in an explicit
 * IANA time zone.
 */

export type ISODate = string;

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toDayNum(iso: ISODate): number {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS_PER_DAY);
}

export function fromDayNum(day: number): ISODate {
  const d = new Date(day * MS_PER_DAY);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function addDays(iso: ISODate, n: number): ISODate {
  return fromDayNum(toDayNum(iso) + n);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNum(a) - toDayNum(b);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. 1970-01-01 was a Thursday. */
export function isoWeekdayOfDayNum(day: number): number {
  return (((day + 3) % 7) + 7) % 7 + 1;
}

export function isoWeekday(iso: ISODate): number {
  return isoWeekdayOfDayNum(toDayNum(iso));
}

/** Day number of the Monday starting the week containing `day`. */
export function weekStartDayNum(day: number): number {
  return day - (isoWeekdayOfDayNum(day) - 1);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The wall-clock calendar date at instant `now` in time zone `tz`. */
export function todayInTimeZone(tz: string, now: Date = new Date()): ISODate {
  const zone = isValidTimeZone(tz) ? tz : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Hour of day (0–23) at `now` in `tz`, for greetings. */
export function hourInTimeZone(tz: string, now: Date = new Date()): number {
  const zone = isValidTimeZone(tz) ? tz : "UTC";
  const h = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(now);
  return Number(h) % 24;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    // Calendar days are formatted as UTC midnights so the zone never shifts them.
    f = new Intl.DateTimeFormat(undefined, { ...opts, timeZone: "UTC" });
    fmtCache.set(key, f);
  }
  return f;
}

export function formatDay(iso: ISODate, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }): string {
  return fmt(opts).format(new Date(toDayNum(iso) * MS_PER_DAY));
}

export function formatShortDay(iso: ISODate): string {
  return formatDay(iso, { month: "short", day: "numeric" });
}

export function monthLabel(iso: ISODate): string {
  return formatDay(iso, { month: "short" });
}

/** "Today", "Yesterday", weekday name within a week, else "Sep 3". */
export function relativeDayLabel(iso: ISODate, today: ISODate): string {
  const diff = diffDays(today, iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) return formatDay(iso, { weekday: "long" });
  return formatShortDay(iso);
}

export function relativeTime(date: Date | string, now: Date = new Date()): string {
  const t = typeof date === "string" ? new Date(date) : date;
  const s = Math.max(0, Math.round((now.getTime() - t.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return t.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAY_LETTER = ["M", "T", "W", "T", "F", "S", "S"] as const;
