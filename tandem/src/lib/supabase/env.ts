/**
 * Public Supabase settings (safe for the browser). Values are trimmed and the
 * URL's trailing slash removed, so a stray space or newline pasted into the
 * hosting dashboard can't break every request.
 */
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
export const SUPABASE_PUBLISHABLE_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ""
).trim();

export function supabaseConfigured(): boolean {
  return /^https?:\/\//.test(SUPABASE_URL) && SUPABASE_PUBLISHABLE_KEY.length > 0;
}

export const MISSING_CONFIG_MESSAGE =
  "The app isn't connected to its database yet: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are missing or invalid in the hosting settings. Open /status for details.";

export function assertSupabaseEnv() {
  if (!supabaseConfigured()) {
    throw new Error(
      "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see README).",
    );
  }
}
