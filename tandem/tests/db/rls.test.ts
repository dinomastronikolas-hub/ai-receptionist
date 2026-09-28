/**
 * Database security tests. These run the real migration against a throwaway
 * PostgreSQL database (with a small Supabase shim for `auth.uid()` and the
 * anon/authenticated roles) and act as different users to prove that Row
 * Level Security, column privileges and RPCs enforce the privacy rules.
 *
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:db
 *
 * The URL must point at a server where the user may CREATE DATABASE.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const root = join(__dirname, "..", "..");
const shim = readFileSync(join(root, "supabase/tests/supabase-shim.sql"), "utf8");
const migration = readFileSync(join(root, "supabase/migrations/20260928000000_init.sql"), "utf8");

const dbName = `tandem_rls_${Date.now()}`;
let admin: Client;
let db: Client;

const A = randomUUID(); // group owner
const B = randomUUID(); // group member
const C = randomUUID(); // outsider

type Role = "anon" | "authenticated" | "service_role";

/** Run `fn` inside a transaction as the given user; commits on success. */
async function as<T>(uid: string | null, fn: (q: Client["query"]) => Promise<T>, role: Role = "authenticated"): Promise<T> {
  await db.query("begin");
  try {
    await db.query(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      uid ? JSON.stringify({ sub: uid, role }) : "",
    ]);
    const result = await fn(db.query.bind(db) as Client["query"]);
    await db.query("commit");
    return result;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function rows<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = [], role: Role = "authenticated") {
  return as(uid, async (q) => (await q(sql, params)).rows as T[], role);
}

async function expectError(p: Promise<unknown>, pattern: RegExp) {
  await expect(p).rejects.toThrow(pattern);
}

async function createUser(id: string, username: string, tz = "UTC") {
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [id, `${username}.${id.slice(0, 8)}@test.dev`, JSON.stringify({ username, display_name: username, timezone: tz })],
  );
}

async function saveHabit(uid: string, name: string, visibility: "group" | "private", extra: Partial<{ kind: string; weekdays: number[]; start: string; id: string }> = {}) {
  const r = await rows<{ id: string }>(
    uid,
    `select public.save_habit($1, $2, null, '✅', 'emerald', $3::date, $4, null, $5, $6::smallint[], null, null) as id`,
    [extra.id ?? null, name, extra.start ?? "2026-01-01", visibility, extra.kind ?? "daily", extra.weekdays ?? null],
  );
  return r[0].id;
}

let groupId: string;
let inviteCode: string;
let publicHabit: string;
let privateHabit: string;
let publicCompletion: string;
let privateCompletion: string;

const describeDb = ADMIN_URL ? describe : describe.skip;

describeDb("row level security", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    const url = new URL(ADMIN_URL!);
    url.pathname = `/${dbName}`;
    db = new Client({ connectionString: url.toString() });
    await db.connect();
    await db.query(shim);
    await db.query(migration);

    await createUser(A, "alice");
    await createUser(B, "bob");
    await createUser(C, "carol");
  });

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`drop database if exists ${dbName} with (force)`);
      await admin.end();
    }
  });

  it("creates a profile for every new auth user", async () => {
    const r = await rows<{ username: string }>(A, "select username from public.profiles where id = $1", [A]);
    expect(r).toEqual([{ username: "alice" }]);
  });

  it("does not let a duplicate username through at sign-up", async () => {
    const dup = randomUUID();
    await createUser(dup, "alice");
    const r = await db.query("select username from public.profiles where id = $1", [dup]);
    expect(r.rows[0].username).toBeNull(); // picked during onboarding instead
    await db.query("delete from auth.users where id = $1", [dup]);
  });

  it("rejects duplicate usernames on update", async () => {
    await expectError(rows(B, "update public.profiles set username = 'alice' where id = $1", [B]), /duplicate key/);
  });

  it("reports username availability to anonymous visitors", async () => {
    const r = await rows<{ ok: boolean }>(null, "select public.username_available('alice') as ok", [], "anon");
    expect(r[0].ok).toBe(false);
    const r2 = await rows<{ ok: boolean }>(null, "select public.username_available('zed_99') as ok", [], "anon");
    expect(r2[0].ok).toBe(true);
  });

  it("gives anonymous users no table access", async () => {
    await expectError(rows(null, "select * from public.habits", [], "anon"), /permission denied/);
    await expectError(rows(null, "select * from public.profiles", [], "anon"), /permission denied/);
  });

  it("creates a group with the caller as owner", async () => {
    const r = await rows<{ id: string; invite_code: string }>(A, "select * from public.create_group('Crew', '🔥')");
    groupId = r[0].id;
    inviteCode = r[0].invite_code;
    expect(inviteCode).toMatch(/^[A-Z2-9]{10}$/);
    const members = await rows<{ user_id: string; role: string }>(A, "select user_id, role from public.group_members where group_id = $1", [groupId]);
    expect(members).toEqual([{ user_id: A, role: "owner" }]);
  });

  it("cannot insert group memberships directly (must use an invite)", async () => {
    await expectError(
      rows(C, "insert into public.group_members (group_id, user_id) values ($1, $2)", [groupId, C]),
      /permission denied/,
    );
  });

  it("rejects an invalid invite code", async () => {
    await expectError(rows(B, "select public.join_group('NOPE000000')"), /invalid_invite/);
  });

  it("shows an invite preview and joins with a valid code (case/dash-insensitive)", async () => {
    const preview = await rows<{ name: string; member_count: number }>(null, "select * from public.get_invite_preview($1)", [inviteCode.toLowerCase()], "anon");
    expect(preview[0]).toMatchObject({ name: "Crew", member_count: 1 });
    const pretty = `${inviteCode.slice(0, 5)}-${inviteCode.slice(5)}`.toLowerCase();
    const r = await rows<{ join_group: string }>(B, "select public.join_group($1)", [pretty]);
    expect(r[0].join_group).toBe(groupId);
    // idempotent
    await rows(B, "select public.join_group($1)", [inviteCode]);
    const count = await rows<{ n: number }>(A, "select count(*)::int as n from public.group_members where group_id = $1", [groupId]);
    expect(count[0].n).toBe(2);
  });

  it("hides groups and members from non-members", async () => {
    expect(await rows(C, "select * from public.groups where id = $1", [groupId])).toHaveLength(0);
    expect(await rows(C, "select * from public.group_members where group_id = $1", [groupId])).toHaveLength(0);
  });

  it("only lets group-mates see each other's profiles", async () => {
    expect(await rows(B, "select id from public.profiles where id = $1", [A])).toHaveLength(1);
    expect(await rows(C, "select id from public.profiles where id = $1", [A])).toHaveLength(0);
  });

  it("creates habits with a versioned schedule", async () => {
    publicHabit = await saveHabit(A, "Gym", "group", { kind: "weekdays", weekdays: [5, 1, 3, 3] });
    privateHabit = await saveHabit(A, "Journal", "private");
    const s = await rows<{ kind: string; weekdays: number[] }>(A, "select kind, weekdays from public.habit_schedules where habit_id = $1", [publicHabit]);
    expect(s).toEqual([{ kind: "weekdays", weekdays: [1, 3, 5] }]);
  });

  it("shows group-mates only public habits", async () => {
    const seenByB = await rows<{ name: string }>(B, "select name from public.habits where user_id = $1 order by name", [A]);
    expect(seenByB.map((h) => h.name)).toEqual(["Gym"]);
    const seenByA = await rows<{ name: string }>(A, "select name from public.habits where user_id = $1 order by name", [A]);
    expect(seenByA.map((h) => h.name)).toEqual(["Gym", "Journal"]);
    expect(await rows(C, "select * from public.habits where user_id = $1", [A])).toHaveLength(0);
    expect(await rows(B, "select * from public.habit_schedules where habit_id = $1", [privateHabit])).toHaveLength(0);
  });

  it("records completions and prevents duplicates for the same day", async () => {
    const r = await rows<{ id: string }>(A, "insert into public.habit_completions (habit_id, completed_on, note) values ($1, public.user_today($2), ' Leg day ') returning id", [publicHabit, A]);
    publicCompletion = r[0].id;
    const p = await rows<{ id: string }>(A, "insert into public.habit_completions (habit_id, completed_on) values ($1, public.user_today($2)) returning id", [privateHabit, A]);
    privateCompletion = p[0].id;
    await expectError(
      rows(A, "insert into public.habit_completions (habit_id, completed_on) values ($1, public.user_today($2))", [publicHabit, A]),
      /duplicate key/,
    );
    const upsert = await rows(A, "insert into public.habit_completions (habit_id, completed_on) values ($1, public.user_today($2)) on conflict (habit_id, completed_on) do nothing returning id", [publicHabit, A]);
    expect(upsert).toHaveLength(0);
    const note = await rows<{ note: string }>(A, "select note from public.habit_completions where id = $1", [publicCompletion]);
    expect(note[0].note).toBe("Leg day");
  });

  it("rejects completions in the future or before the start date", async () => {
    await expectError(
      rows(A, "insert into public.habit_completions (habit_id, completed_on) values ($1, public.user_today($2) + 2)", [publicHabit, A]),
      /future_date/,
    );
    await expectError(
      rows(A, "insert into public.habit_completions (habit_id, completed_on) values ($1, '2025-12-31')", [publicHabit]),
      /before_start_date/,
    );
  });

  it("uses the owner's time zone for 'today'", async () => {
    const kiri = randomUUID();
    await createUser(kiri, "kiri", "Pacific/Kiritimati"); // UTC+14
    const h = await saveHabit(kiri, "Swim", "private", { start: "2020-01-01" });
    const local = await rows<{ d: string }>(kiri, "select to_char((now() at time zone 'Pacific/Kiritimati')::date, 'YYYY-MM-DD') as d");
    const today = await rows<{ d: string }>(kiri, "select to_char(public.user_today($1), 'YYYY-MM-DD') as d", [kiri]);
    expect(today[0].d).toBe(local[0].d);
    await rows(kiri, "insert into public.habit_completions (habit_id, completed_on) values ($1, public.user_today($2))", [h, kiri]);
  });

  it("does not let other users write someone else's habits or completions", async () => {
    await expectError(
      rows(B, "insert into public.habit_completions (habit_id, user_id, completed_on) values ($1, $2, '2026-02-01')", [publicHabit, A]),
      /row-level security/,
    );
    await expectError(
      rows(B, "insert into public.habit_completions (habit_id, completed_on) values ($1, '2026-02-01')", [publicHabit]),
      /habit_not_found|row-level security/,
    );
    const upd = await as(B, async (q) => (await q("update public.habits set name = 'hacked' where id = $1", [publicHabit])).rowCount);
    expect(upd).toBe(0);
    const del = await as(B, async (q) => (await q("delete from public.habit_completions where id = $1", [publicCompletion])).rowCount);
    expect(del).toBe(0);
    const note = await as(B, async (q) => (await q("update public.habit_completions set note = 'x' where id = $1", [publicCompletion])).rowCount);
    expect(note).toBe(0);
    await expectError(rows(B, "insert into public.habits (user_id, name, start_date) values ($1, 'x', '2026-01-01')", [A]), /row-level security/);
    await expectError(rows(B, "select public.save_habit($1, 'x', null, '✅', 'emerald', '2026-01-01', 'group', null, 'daily', null, null, null)", [publicHabit]), /habit_not_found/);
  });

  it("does not allow moving a completion to another day or habit", async () => {
    await expectError(
      rows(A, "update public.habit_completions set completed_on = '2026-02-02' where id = $1", [publicCompletion]),
      /permission denied/,
    );
  });

  it("hides private-habit completions and history from group-mates", async () => {
    expect(await rows(B, "select * from public.habit_completions where id = $1", [privateCompletion])).toHaveLength(0);
    expect(await rows(B, "select * from public.habit_completions where id = $1", [publicCompletion])).toHaveLength(1);
    const hist = await rows<{ habit_id: string }>(B, "select habit_id from public.habit_history($1)", [[A]]);
    expect(hist.map((h) => h.habit_id)).toEqual([publicHabit]);
    const own = await rows<{ habit_id: string }>(A, "select habit_id from public.habit_history($1)", [[A]]);
    expect(own).toHaveLength(2);
    expect(await rows(C, "select * from public.habit_history($1)", [[A]])).toHaveLength(0);
  });

  it("allows reactions and comments only on visible completions", async () => {
    await rows(B, "insert into public.reactions (completion_id, emoji) values ($1, '🔥')", [publicCompletion]);
    await expectError(rows(B, "insert into public.reactions (completion_id, emoji) values ($1, '🔥')", [publicCompletion]), /duplicate key/);
    await expectError(rows(B, "insert into public.reactions (completion_id, emoji) values ($1, '💩')", [publicCompletion]), /check constraint/);
    await expectError(rows(B, "insert into public.reactions (completion_id, emoji) values ($1, '👏')", [privateCompletion]), /row-level security/);
    await expectError(rows(C, "insert into public.reactions (completion_id, emoji) values ($1, '👏')", [publicCompletion]), /row-level security/);
    await expectError(rows(B, "insert into public.reactions (completion_id, user_id, emoji) values ($1, $2, '👏')", [publicCompletion, A]), /row-level security/);

    const c = await rows<{ id: string }>(B, "insert into public.comments (completion_id, body) values ($1, 'Nice!') returning id", [publicCompletion]);
    expect(await rows(C, "select * from public.comments")).toHaveLength(0);
    // The completion's owner may remove comments on their completion.
    const del = await as(A, async (q) => (await q("delete from public.comments where id = $1", [c[0].id])).rowCount);
    expect(del).toBe(1);
  });

  it("only lets owners change group settings and rotate the invite code", async () => {
    const upd = await as(B, async (q) => (await q("update public.groups set name = 'Mine now' where id = $1", [groupId])).rowCount);
    expect(upd).toBe(0);
    await expectError(rows(B, "select public.regenerate_invite_code($1)", [groupId]), /not_group_owner/);
    await expectError(rows(A, "update public.groups set invite_code = 'AAAAAAAAAA' where id = $1", [groupId]), /permission denied/);
    const r = await rows<{ code: string }>(A, "select public.regenerate_invite_code($1) as code", [groupId]);
    expect(r[0].code).not.toBe(inviteCode);
    await expectError(rows(C, "select public.join_group($1)", [inviteCode]), /invalid_invite/);
    inviteCode = r[0].code;
  });

  it("stops sharing once someone leaves the group", async () => {
    await rows(C, "select public.join_group($1)", [inviteCode]);
    expect(await rows(C, "select * from public.habits where user_id = $1", [A])).toHaveLength(1);
    await rows(C, "delete from public.group_members where group_id = $1 and user_id = $2", [groupId, C]);
    expect(await rows(C, "select * from public.habits where user_id = $1", [A])).toHaveLength(0);
    expect(await rows(C, "select * from public.habit_completions where id = $1", [publicCompletion])).toHaveLength(0);
  });

  it("members cannot remove other members; owners can", async () => {
    await rows(C, "select public.join_group($1)", [inviteCode]);
    const byB = await as(B, async (q) => (await q("delete from public.group_members where group_id = $1 and user_id = $2", [groupId, C])).rowCount);
    expect(byB).toBe(0);
    const byA = await as(A, async (q) => (await q("delete from public.group_members where group_id = $1 and user_id = $2", [groupId, C])).rowCount);
    expect(byA).toBe(1);
  });

  it("versions schedule edits instead of rewriting history", async () => {
    await saveHabit(A, "Gym", "group", { id: publicHabit, kind: "daily" });
    const s = await rows<{ kind: string }>(A, "select kind from public.habit_schedules where habit_id = $1 order by effective_from", [publicHabit]);
    expect(s.map((x) => x.kind)).toEqual(["weekdays", "daily"]);
    // Editing again the same day replaces today's version rather than stacking.
    await saveHabit(A, "Gym", "group", { id: publicHabit, kind: "weekdays", weekdays: [2] });
    const s2 = await rows<{ kind: string }>(A, "select kind from public.habit_schedules where habit_id = $1 order by effective_from", [publicHabit]);
    expect(s2.map((x) => x.kind)).toEqual(["weekdays", "weekdays"]);
  });

  it("refuses a start date after the first completion", async () => {
    await expectError(saveHabit(A, "Gym", "group", { id: publicHabit, start: "2099-01-01" }), /start_after_first_completion/);
  });

  it("hands ownership to the next member when the owner leaves, and deletes empty groups", async () => {
    await rows(A, "delete from public.group_members where group_id = $1 and user_id = $2", [groupId, A]);
    const m = await rows<{ user_id: string; role: string }>(B, "select user_id, role from public.group_members where group_id = $1", [groupId]);
    expect(m).toEqual([{ user_id: B, role: "owner" }]);
    // A and B no longer share a group → B can't see A's habits any more.
    expect(await rows(B, "select * from public.habits where user_id = $1", [A])).toHaveLength(0);
    await rows(B, "delete from public.group_members where group_id = $1 and user_id = $2", [groupId, B]);
    const g = await db.query("select count(*)::int as n from public.groups where id = $1", [groupId]);
    expect(g.rows[0].n).toBe(0);
  });

  it("isolates push subscriptions", async () => {
    await rows(A, "insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/1', 'k', 'a')");
    expect(await rows(B, "select * from public.push_subscriptions")).toHaveLength(0);
    await expectError(rows(B, "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/2', 'k', 'a')", [A]), /row-level security/);
    await expectError(rows(A, "select * from public.reminder_deliveries"), /permission denied/);
  });

  it("deletes an account and all of its data", async () => {
    await rows(A, "select public.delete_my_account()");
    const left = await db.query("select (select count(*) from public.habits where user_id = $1)::int as h, (select count(*) from auth.users where id = $1)::int as u", [A]);
    expect(left.rows[0]).toEqual({ h: 0, u: 0 });
  });

  it("seed data loads cleanly", async () => {
    await db.query(readFileSync(join(root, "supabase/seed.sql"), "utf8"));
    const r = await db.query("select count(*)::int as n from public.habit_completions");
    expect(r.rows[0].n).toBeGreaterThan(500);
  });
});
