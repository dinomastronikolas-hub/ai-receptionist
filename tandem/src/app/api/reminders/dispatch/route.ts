import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { addDays, toDayNum } from "@/lib/dates";
import { HabitEngine, type Schedule } from "@/lib/habit-engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Sends due reminder notifications. Call every 5–15 minutes from a scheduler
 * (Supabase pg_cron + pg_net, GitHub Actions, or any cron service) with
 *   Authorization: Bearer $CRON_SECRET
 * See README → "Reminders".
 */
export const dynamic = "force-dynamic";

const WINDOW_MINUTES = 15;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Candidate {
  habit_id: string;
  user_id: string;
  name: string;
  emoji: string;
  local_day: string;
  timezone: string;
}

async function dispatch(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  const admin = createSupabaseAdminClient();
  if (!publicKey || !privateKey || !admin) {
    return NextResponse.json({ error: "Reminders are not configured (VAPID keys / service role key missing)." }, { status: 503 });
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const { data: candidates, error } = await admin.rpc("reminder_candidates", { p_window_minutes: WINDOW_MINUTES });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const list = (candidates ?? []) as Candidate[];
  if (list.length === 0) return NextResponse.json({ sent: 0, candidates: 0 });

  // Respect schedules: only remind about habits actually due today.
  const ids = list.map((c) => c.habit_id);
  const earliest = list.reduce((m, c) => (c.local_day < m ? c.local_day : m), list[0].local_day);
  const [habitsRes, doneRes] = await Promise.all([
    admin.from("habits").select("id, start_date, habit_schedules(effective_from, kind, weekdays, times_per_week, interval_days)").in("id", ids),
    admin.from("habit_completions").select("habit_id, completed_on").in("habit_id", ids).gte("completed_on", addDays(earliest, -7)),
  ]);
  if (habitsRes.error || doneRes.error) return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  const habits = new Map((habitsRes.data as { id: string; start_date: string; habit_schedules: Schedule[] }[]).map((h) => [h.id, h]));
  const doneBy = new Map<string, string[]>();
  for (const c of doneRes.data as { habit_id: string; completed_on: string }[]) {
    doneBy.set(c.habit_id, [...(doneBy.get(c.habit_id) ?? []), c.completed_on]);
  }
  const due = list.filter((c) => {
    const h = habits.get(c.habit_id);
    if (!h) return false;
    const engine = new HabitEngine({ start_date: h.start_date, habit_schedules: h.habit_schedules }, doneBy.get(c.habit_id) ?? [], c.local_day);
    return engine.isDue(toDayNum(c.local_day));
  });
  if (due.length === 0) return NextResponse.json({ sent: 0, candidates: list.length });

  // Claim deliveries first so overlapping runs never double-notify.
  const { data: claimed, error: claimErr } = await admin
    .from("reminder_deliveries")
    .upsert(due.map((c) => ({ habit_id: c.habit_id, local_day: c.local_day })), { onConflict: "habit_id,local_day", ignoreDuplicates: true })
    .select("habit_id");
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });
  const claimedIds = new Set((claimed ?? []).map((r: { habit_id: string }) => r.habit_id));
  const toSend = due.filter((c) => claimedIds.has(c.habit_id));

  const byUser = new Map<string, Candidate[]>();
  for (const c of toSend) byUser.set(c.user_id, [...(byUser.get(c.user_id) ?? []), c]);

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", [...byUser.keys()]);

  let sent = 0;
  const expired: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }) => {
      const items = byUser.get(s.user_id) ?? [];
      if (items.length === 0) return;
      const names = items.map((i) => `${i.emoji} ${i.name}`);
      const payload = JSON.stringify({
        title: items.length === 1 ? `${items[0].emoji} ${items[0].name}` : "Time to check in",
        body: items.length === 1 ? "Still on your list today — you've got this." : `${names.join(", ")} — still to do today.`,
        url: items.length === 1 ? `/habits/${items[0].habit_id}` : "/today",
        tag: `reminder-${items[0].local_day}`,
      });
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(s.id);
      }
    }),
  );
  if (expired.length) await admin.from("push_subscriptions").delete().in("id", expired);

  return NextResponse.json({ sent, candidates: list.length, due: toSend.length, expired: expired.length });
}

export const GET = dispatch;
export const POST = dispatch;
