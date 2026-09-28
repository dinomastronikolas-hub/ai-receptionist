"use client";

import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { getSupabase } from "./supabase/client";
import { friendlyError } from "./errors";
import type { ISODate } from "./dates";
import { addDays, todayInTimeZone } from "./dates";
import type {
  Comment,
  FeedItem,
  Group,
  GroupMember,
  Habit,
  HabitInput,
  HistoryMap,
  Profile,
  Reaction,
  ReactionEmoji,
} from "./types";

// -----------------------------------------------------------------------------
// Keys
// -----------------------------------------------------------------------------

export const qk = {
  profile: (uid: string) => ["profile", uid] as const,
  habits: (uid: string) => ["habits", uid] as const,
  history: (uid: string) => ["history", uid] as const,
  groups: (uid: string) => ["groups", uid] as const,
  board: (gid: string) => ["board", gid] as const,
  feed: (gid: string) => ["feed", gid] as const,
  cheers: (uid: string) => ["cheers", uid] as const,
  person: (uid: string) => ["person", uid] as const,
  note: (habitId: string, day: string) => ["note", habitId, day] as const,
  pushSubs: (uid: string) => ["push-subs", uid] as const,
};

function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

// -----------------------------------------------------------------------------
// Fetchers
// -----------------------------------------------------------------------------

const HABIT_SELECT =
  "id, user_id, name, description, emoji, color, start_date, visibility, reminder_time, sort_order, archived_at, created_at, habit_schedules(effective_from, kind, weekdays, times_per_week, interval_days)";

const PROFILE_SELECT = "id, username, display_name, avatar_emoji, avatar_color, timezone, created_at";

export async function fetchProfile(uid: string): Promise<Profile | null> {
  const res = await getSupabase().from("profiles").select(PROFILE_SELECT).eq("id", uid).maybeSingle();
  return unwrap(res) as Profile | null;
}

async function fetchHabits(uid: string): Promise<Habit[]> {
  const res = await getSupabase()
    .from("habits")
    .select(HABIT_SELECT)
    .eq("user_id", uid)
    .order("sort_order")
    .order("created_at");
  return unwrap(res) as unknown as Habit[];
}

async function fetchHistory(uids: string[]): Promise<HistoryMap> {
  const res = await getSupabase().rpc("habit_history", { p_user_ids: uids });
  const rows = unwrap(res) as { habit_id: string; days: string[]; note_days: string[] }[];
  const map: HistoryMap = new Map();
  for (const r of rows ?? []) map.set(r.habit_id, { days: r.days ?? [], noteDays: new Set(r.note_days ?? []) });
  return map;
}

async function fetchGroups(): Promise<Group[]> {
  const res = await getSupabase()
    .from("groups")
    .select("id, name, emoji, invite_code, leaderboard_enabled, created_by, created_at")
    .order("created_at");
  return unwrap(res) as Group[];
}

export interface Board {
  members: GroupMember[];
  habits: Habit[];
  history: HistoryMap;
}

async function fetchBoard(gid: string): Promise<Board> {
  const sb = getSupabase();
  const memRes = await sb
    .from("group_members")
    .select(`user_id, role, joined_at, profile:profiles(${PROFILE_SELECT})`)
    .eq("group_id", gid)
    .order("joined_at");
  const members = (unwrap(memRes) as unknown as GroupMember[]).filter((m) => m.profile);
  const ids = members.map((m) => m.user_id);
  if (ids.length === 0) return { members, habits: [], history: new Map() };
  const [habitsRes, history] = await Promise.all([
    sb
      .from("habits")
      .select(HABIT_SELECT)
      .in("user_id", ids)
      .eq("visibility", "group")
      .is("archived_at", null)
      .order("sort_order"),
    fetchHistory(ids),
  ]);
  const habits = unwrap(habitsRes) as unknown as Habit[];
  return { members, habits, history };
}

async function fetchFeed(gid: string, memberIds: string[], sinceDay: ISODate): Promise<FeedItem[]> {
  if (memberIds.length === 0) return [];
  const res = await getSupabase()
    .from("habit_completions")
    .select(
      "id, habit_id, user_id, completed_on, note, created_at, habit:habits!inner(id, name, emoji, color, visibility), reactions(id, completion_id, user_id, emoji, created_at), comments(id, completion_id, user_id, body, created_at)",
    )
    .in("user_id", memberIds)
    .eq("habit.visibility", "group")
    .gte("completed_on", sinceDay)
    .order("created_at", { ascending: false })
    .limit(40);
  void gid;
  return unwrap(res) as unknown as FeedItem[];
}

export interface Cheer {
  kind: "reaction" | "comment";
  id: string;
  created_at: string;
  emoji?: ReactionEmoji;
  body?: string;
  from: Pick<Profile, "id" | "display_name" | "username" | "avatar_emoji" | "avatar_color">;
  habit: { name: string; emoji: string };
  completed_on: ISODate;
}

async function fetchCheers(uid: string): Promise<Cheer[]> {
  const sb = getSupabase();
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const sel = (extra: string) =>
    `id, created_at, user_id, ${extra}, from:profiles(id, display_name, username, avatar_emoji, avatar_color), completion:habit_completions!inner(id, user_id, completed_on, habit:habits(name, emoji))`;
  const [r, c] = await Promise.all([
    sb.from("reactions").select(sel("emoji")).eq("completion.user_id", uid).neq("user_id", uid)
      .gte("created_at", since).order("created_at", { ascending: false }).limit(20),
    sb.from("comments").select(sel("body")).eq("completion.user_id", uid).neq("user_id", uid)
      .gte("created_at", since).order("created_at", { ascending: false }).limit(10),
  ]);
  type Row = {
    id: string; created_at: string; emoji?: ReactionEmoji; body?: string;
    from: Cheer["from"] | null;
    completion: { completed_on: string; habit: { name: string; emoji: string } | null };
  };
  const toCheer = (kind: Cheer["kind"]) => (row: Row): Cheer | null =>
    row.from && row.completion?.habit
      ? { kind, id: row.id, created_at: row.created_at, emoji: row.emoji, body: row.body, from: row.from,
          habit: row.completion.habit, completed_on: row.completion.completed_on }
      : null;
  const all = [
    ...(unwrap(r) as unknown as Row[]).map(toCheer("reaction")),
    ...(unwrap(c) as unknown as Row[]).map(toCheer("comment")),
  ].filter((x): x is Cheer => x !== null);
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
}

export interface Person {
  profile: Profile;
  habits: Habit[];
  history: HistoryMap;
}

async function fetchPerson(uid: string, me: string): Promise<Person | null> {
  const sb = getSupabase();
  const profile = await fetchProfile(uid);
  if (!profile) return null;
  let q = sb.from("habits").select(HABIT_SELECT).eq("user_id", uid).is("archived_at", null).order("sort_order");
  if (uid !== me) q = q.eq("visibility", "group");
  const [habitsRes, history] = await Promise.all([q, fetchHistory([uid])]);
  return { profile, habits: unwrap(habitsRes) as unknown as Habit[], history };
}

// -----------------------------------------------------------------------------
// Query hooks
// -----------------------------------------------------------------------------

export function useProfile(uid: string, initial?: Profile) {
  return useQuery({
    queryKey: qk.profile(uid),
    queryFn: () => fetchProfile(uid),
    initialData: initial,
    staleTime: 60_000,
  });
}

export function useHabits(uid: string) {
  return useQuery({ queryKey: qk.habits(uid), queryFn: () => fetchHabits(uid) });
}

export function useHistory(uid: string) {
  return useQuery({ queryKey: qk.history(uid), queryFn: () => fetchHistory([uid]) });
}

export function useGroups(uid: string) {
  return useQuery({ queryKey: qk.groups(uid), queryFn: fetchGroups, staleTime: 60_000 });
}

export function useBoard(gid: string | null | undefined) {
  return useQuery({
    queryKey: qk.board(gid ?? "none"),
    queryFn: () => fetchBoard(gid!),
    enabled: Boolean(gid),
  });
}

export function useFeed(gid: string | null | undefined, memberIds: string[] | undefined, today: ISODate) {
  const since = addDays(today, -13);
  return useQuery({
    queryKey: [...qk.feed(gid ?? "none"), memberIds?.join(",") ?? ""],
    queryFn: () => fetchFeed(gid!, memberIds ?? [], since),
    enabled: Boolean(gid && memberIds && memberIds.length > 0),
  });
}

export function useCheers(uid: string) {
  return useQuery({ queryKey: qk.cheers(uid), queryFn: () => fetchCheers(uid), staleTime: 60_000 });
}

export function usePerson(uid: string, me: string) {
  return useQuery({ queryKey: qk.person(uid), queryFn: () => fetchPerson(uid, me) });
}

export function useNote(habitId: string, day: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.note(habitId, day),
    enabled,
    queryFn: async () => {
      const res = await getSupabase()
        .from("habit_completions")
        .select("note")
        .eq("habit_id", habitId)
        .eq("completed_on", day)
        .maybeSingle();
      return (unwrap(res) as { note: string | null } | null)?.note ?? null;
    },
  });
}

// -----------------------------------------------------------------------------
// Selected group (per device)
// -----------------------------------------------------------------------------

const GROUP_KEY = "tandem.selectedGroup";
const groupListeners = new Set<() => void>();

function readSelectedGroup(): string | null {
  try {
    return localStorage.getItem(GROUP_KEY);
  } catch {
    return null;
  }
}

export function setSelectedGroup(id: string) {
  try {
    localStorage.setItem(GROUP_KEY, id);
  } catch {
    /* storage unavailable: selection just won't persist */
  }
  groupListeners.forEach((l) => l());
}

/** The group shown on the Group tab / "Friends today" — persisted per device. */
export function useSelectedGroup(uid: string): { group: Group | null; groups: Group[]; isLoading: boolean; error: unknown } {
  const { data: groups = [], isLoading, error } = useGroups(uid);
  const stored = useSyncExternalStore(
    (cb) => {
      groupListeners.add(cb);
      return () => groupListeners.delete(cb);
    },
    readSelectedGroup,
    () => null,
  );
  const group = groups.find((g) => g.id === stored) ?? groups[0] ?? null;
  return { group, groups, isLoading, error };
}

// -----------------------------------------------------------------------------
// "Today" that rolls over at local midnight
// -----------------------------------------------------------------------------

export function useToday(tz: string): ISODate {
  const [today, setToday] = useState(() => todayInTimeZone(tz));
  useEffect(() => {
    const check = () => setToday(todayInTimeZone(tz));
    check();
    const id = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [tz]);
  return today;
}

// -----------------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------------

function cloneHistory(map: HistoryMap | undefined): HistoryMap {
  const next: HistoryMap = new Map();
  map?.forEach((v, k) => next.set(k, { days: [...v.days], noteDays: new Set(v.noteDays) }));
  return next;
}

function invalidateSocial(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["board"] });
  qc.invalidateQueries({ queryKey: ["feed"] });
  qc.invalidateQueries({ queryKey: ["person"] });
}

export interface ToggleVars {
  habitId: string;
  day: ISODate;
  done: boolean;
}

/** Check / uncheck a habit for a day, optimistically. */
export function useToggleCompletion(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["toggle"],
    mutationFn: async ({ habitId, day, done }: ToggleVars) => {
      const sb = getSupabase();
      if (done) {
        const res = await sb
          .from("habit_completions")
          .upsert({ habit_id: habitId, completed_on: day }, { onConflict: "habit_id,completed_on", ignoreDuplicates: true });
        if (res.error) throw res.error;
      } else {
        const res = await sb.from("habit_completions").delete().eq("habit_id", habitId).eq("completed_on", day);
        if (res.error) throw res.error;
      }
    },
    onMutate: async ({ habitId, day, done }) => {
      await qc.cancelQueries({ queryKey: qk.history(uid) });
      const previous = qc.getQueryData<HistoryMap>(qk.history(uid));
      const next = cloneHistory(previous);
      const h = next.get(habitId) ?? { days: [], noteDays: new Set<string>() };
      const set = new Set(h.days);
      if (done) set.add(day);
      else {
        set.delete(day);
        h.noteDays.delete(day);
      }
      h.days = [...set].sort();
      next.set(habitId, h);
      qc.setQueryData(qk.history(uid), next);
      if (!done) qc.setQueryData(qk.note(habitId, day), null);
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.history(uid), ctx.previous);
      toast.error(friendlyError(err, "Couldn't save that check-in. Please try again."));
    },
    onSettled: () => {
      // Only resync once the last in-flight toggle settles, to avoid flicker.
      if (qc.isMutating({ mutationKey: ["toggle"] }) <= 1) {
        qc.invalidateQueries({ queryKey: qk.history(uid) });
        invalidateSocial(qc);
      }
    },
  });
}

/** Save a note for a day; completes the habit for that day if needed. */
export function useSaveNote(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ habitId, day, note }: { habitId: string; day: ISODate; note: string }) => {
      const sb = getSupabase();
      const clean = note.trim() || null;
      const upd = await sb
        .from("habit_completions")
        .update({ note: clean })
        .eq("habit_id", habitId)
        .eq("completed_on", day)
        .select("id");
      if (upd.error) throw upd.error;
      if ((upd.data ?? []).length === 0) {
        const ins = await sb.from("habit_completions").insert({ habit_id: habitId, completed_on: day, note: clean });
        if (ins.error) throw ins.error;
      }
      return clean;
    },
    onSuccess: (clean, { habitId, day }) => {
      qc.setQueryData(qk.note(habitId, day), clean);
      qc.setQueryData<HistoryMap>(qk.history(uid), (prev) => {
        const next = cloneHistory(prev);
        const h = next.get(habitId) ?? { days: [], noteDays: new Set<string>() };
        if (!h.days.includes(day)) h.days = [...h.days, day].sort();
        if (clean) h.noteDays.add(day);
        else h.noteDays.delete(day);
        next.set(habitId, h);
        return next;
      });
      invalidateSocial(qc);
    },
  });
}

export function useSaveHabit(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string | null; input: HabitInput }) => {
      const res = await getSupabase().rpc("save_habit", {
        p_id: id,
        p_name: input.name.trim(),
        p_description: input.description.trim() || null,
        p_emoji: input.emoji,
        p_color: input.color,
        p_start_date: input.start_date,
        p_visibility: input.visibility,
        p_reminder_time: input.reminder_time || null,
        p_kind: input.kind,
        p_weekdays: input.kind === "weekdays" ? input.weekdays : null,
        p_times_per_week: input.kind === "times_per_week" ? input.times_per_week : null,
        p_interval_days: input.kind === "interval" ? input.interval_days : null,
      });
      return unwrap(res) as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.habits(uid) });
      qc.invalidateQueries({ queryKey: qk.history(uid) });
      invalidateSocial(qc);
    },
  });
}

export function useUpdateHabit(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Habit, "archived_at" | "visibility">> }) => {
      const res = await getSupabase().from("habits").update(patch).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.habits(uid) });
      invalidateSocial(qc);
    },
  });
}

export function useDeleteHabit(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await getSupabase().from("habits").delete().eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: (_d, id) => {
      qc.setQueryData<Habit[]>(qk.habits(uid), (prev) => prev?.filter((h) => h.id !== id));
      qc.invalidateQueries({ queryKey: qk.habits(uid) });
      invalidateSocial(qc);
    },
  });
}

export function useReorderHabits(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await getSupabase().rpc("reorder_habits", { p_ids: ids });
      if (res.error) throw res.error;
    },
    onMutate: (ids) => {
      const prev = qc.getQueryData<Habit[]>(qk.habits(uid));
      if (prev) {
        const order = new Map(ids.map((id, i) => [id, i]));
        qc.setQueryData(
          qk.habits(uid),
          prev.map((h) => (order.has(h.id) ? { ...h, sort_order: order.get(h.id)! } : h)).sort((a, b) => a.sort_order - b.sort_order),
        );
      }
      return { prev };
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.habits(uid), ctx.prev);
      toast.error(friendlyError(err, "Couldn't save the new order."));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.habits(uid) });
      invalidateSocial(qc);
    },
  });
}

export function useUpdateProfile(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<Profile, "username" | "display_name" | "avatar_emoji" | "avatar_color" | "timezone">>) => {
      const res = await getSupabase().from("profiles").update(patch).eq("id", uid).select(PROFILE_SELECT).single();
      return unwrap(res) as Profile;
    },
    onSuccess: (profile) => {
      qc.setQueryData(qk.profile(uid), profile);
      invalidateSocial(qc);
    },
  });
}

// ---- Groups ----------------------------------------------------------------

export function useCreateGroup(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, emoji }: { name: string; emoji: string }) => {
      const res = await getSupabase().rpc("create_group", { p_name: name.trim(), p_emoji: emoji });
      return unwrap(res) as Group;
    },
    onSuccess: (group) => {
      setSelectedGroup(group.id);
      qc.invalidateQueries({ queryKey: qk.groups(uid) });
    },
  });
}

export function useJoinGroup(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await getSupabase().rpc("join_group", { p_code: code });
      return unwrap(res) as string;
    },
    onSuccess: (gid) => {
      setSelectedGroup(gid);
      qc.invalidateQueries({ queryKey: qk.groups(uid) });
      invalidateSocial(qc);
    },
  });
}

export function useUpdateGroup(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Group, "name" | "emoji" | "leaderboard_enabled">> }) => {
      const res = await getSupabase().from("groups").update(patch).eq("id", id).select("id");
      if (res.error) throw res.error;
      if (!res.data?.length) throw new Error("not_group_owner");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.groups(uid) }),
  });
}

export function useRegenerateInvite(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (gid: string) => unwrap(await getSupabase().rpc("regenerate_invite_code", { p_group: gid })) as string,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.groups(uid) }),
  });
}

export function useRemoveMember(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ gid, userId }: { gid: string; userId: string }) => {
      const res = await getSupabase().from("group_members").delete().eq("group_id", gid).eq("user_id", userId).select("user_id");
      if (res.error) throw res.error;
      if (!res.data?.length) throw new Error("not_group_owner");
    },
    onSuccess: (_d, { gid, userId }) => {
      if (userId === uid) qc.removeQueries({ queryKey: qk.board(gid) });
      qc.invalidateQueries({ queryKey: qk.groups(uid) });
      invalidateSocial(qc);
    },
  });
}

export function useDeleteGroup(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (gid: string) => {
      const res = await getSupabase().from("groups").delete().eq("id", gid).select("id");
      if (res.error) throw res.error;
      if (!res.data?.length) throw new Error("not_group_owner");
    },
    onSuccess: (_d, gid) => {
      qc.removeQueries({ queryKey: qk.board(gid) });
      qc.invalidateQueries({ queryKey: qk.groups(uid) });
    },
  });
}

// ---- Reactions & comments --------------------------------------------------

function patchFeed(qc: QueryClient, completionId: string, fn: (item: FeedItem) => FeedItem) {
  qc.setQueriesData<FeedItem[]>({ queryKey: ["feed"] }, (prev) =>
    prev?.map((item) => (item.id === completionId ? fn(item) : item)),
  );
}

export function useToggleReaction(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ completionId, emoji, on }: { completionId: string; emoji: ReactionEmoji; on: boolean }) => {
      const sb = getSupabase();
      const res = on
        ? await sb.from("reactions").upsert({ completion_id: completionId, emoji }, { onConflict: "completion_id,user_id,emoji", ignoreDuplicates: true })
        : await sb.from("reactions").delete().eq("completion_id", completionId).eq("user_id", uid).eq("emoji", emoji);
      if (res.error) throw res.error;
    },
    onMutate: async ({ completionId, emoji, on }) => {
      await qc.cancelQueries({ queryKey: ["feed"] });
      const snapshot = qc.getQueriesData<FeedItem[]>({ queryKey: ["feed"] });
      patchFeed(qc, completionId, (item) => ({
        ...item,
        reactions: on
          ? [...item.reactions, { id: `tmp-${emoji}`, completion_id: completionId, user_id: uid, emoji, created_at: new Date().toISOString() } as Reaction]
          : item.reactions.filter((r) => !(r.user_id === uid && r.emoji === emoji)),
      }));
      return { snapshot };
    },
    onError: (err, _v, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(friendlyError(err, "Couldn't send that reaction."));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["feed"] }),
  });
}

export function useAddComment(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ completionId, body }: { completionId: string; body: string }) => {
      const res = await getSupabase()
        .from("comments")
        .insert({ completion_id: completionId, body: body.trim() })
        .select("id, completion_id, user_id, body, created_at")
        .single();
      return unwrap(res) as Comment;
    },
    onSuccess: (comment) => {
      patchFeed(qc, comment.completion_id, (item) => ({ ...item, comments: [...item.comments, comment] }));
      qc.invalidateQueries({ queryKey: ["feed"] });
      void uid;
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; completionId: string }) => {
      const res = await getSupabase().from("comments").delete().eq("id", id).select("id");
      if (res.error) throw res.error;
      if (!res.data?.length) throw new Error("You can only delete your own comments.");
    },
    onSuccess: (_d, { id, completionId }) => {
      patchFeed(qc, completionId, (item) => ({ ...item, comments: item.comments.filter((c) => c.id !== id) }));
    },
  });
}

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

export function useMemberMap(members: GroupMember[] | undefined) {
  return useMemo(() => new Map((members ?? []).map((m) => [m.user_id, m.profile])), [members]);
}
