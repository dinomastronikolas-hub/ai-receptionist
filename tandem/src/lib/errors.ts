/**
 * Turn Supabase / Postgres / network errors into short, friendly messages.
 * Custom RPC errors raise a machine-readable message (e.g. `invalid_invite`).
 */
const MESSAGES: Record<string, string> = {
  invalid_invite: "That invite code doesn't match any group. Double-check it or ask for a fresh link.",
  group_full: "This group is full (50 members max).",
  too_many_groups: "You're already in 20 groups — leave one to join another.",
  not_group_owner: "Only the group owner can do that.",
  not_authenticated: "Your session has expired. Please log in again.",
  habit_not_found: "That habit no longer exists.",
  before_start_date: "That day is before this habit started.",
  future_date: "You can't check off a day that hasn't happened yet.",
  start_after_first_completion: "The start date can't be after your first check-in.",
  invalid_timezone: "That time zone isn't valid.",
  completion_immutable: "Check-ins can't be moved to another day.",
};

interface MaybeError {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
  details?: string;
}

export function isOfflineError(err: unknown): boolean {
  const e = err as MaybeError | undefined;
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = e?.message ?? "";
  return /Failed to fetch|NetworkError|Load failed|network/i.test(msg) || e?.name === "AuthRetryableFetchError";
}

export function isAuthError(err: unknown): boolean {
  const e = err as MaybeError | undefined;
  return e?.code === "PGRST301" || e?.code === "PGRST303" || /JWT expired|invalid JWT|not_authenticated/i.test(e?.message ?? "");
}

export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!err) return fallback;
  const e = err as MaybeError;
  const msg = e.message ?? "";
  for (const key of Object.keys(MESSAGES)) {
    if (msg.includes(key)) return MESSAGES[key];
  }
  if (isOfflineError(err)) return "You're offline. Check your connection and try again.";
  if (isAuthError(err)) return MESSAGES.not_authenticated;
  if (e.code === "23505") {
    if (/username/.test(msg)) return "That username is taken — try another.";
    return "That already exists.";
  }
  if (e.code === "23514") return "Some of those values aren't allowed. Please check the form.";
  if (e.code === "42501") return "You don't have permission to do that.";
  // Supabase Auth messages are already user-facing.
  if (/Invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (/Email not confirmed/i.test(msg)) return "Please confirm your email first — check your inbox.";
  if (/User already registered/i.test(msg)) return "An account with that email already exists. Try logging in.";
  if (/Password should be/i.test(msg)) return msg;
  if (/rate limit/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  return fallback;
}
