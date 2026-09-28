/**
 * Public Supabase settings (safe for the browser).
 *
 * The project URL and *publishable* key are public by design — they ship in
 * every browser bundle, and Row Level Security protects the data — so this
 * deployment's values are committed as defaults. Environment variables
 * (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) still take
 * precedence, e.g. for local development against another project.
 * Never put the secret / service-role key here.
 *
 * Values are trimmed and the URL's trailing slash removed, so a stray space or
 * newline pasted into the hosting dashboard can't break every request.
 */
export const DEFAULT_SUPABASE_URL = "https://fmczxtffyyeipkwkcgbq.supabase.co";
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_OVylm58fKzrnSPM7xVwCCA_zV67xOKy";

function pick(...values: Array<string | undefined>): string {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return "";
}

export const SUPABASE_URL = pick(process.env.NEXT_PUBLIC_SUPABASE_URL, DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
export const SUPABASE_PUBLISHABLE_KEY = pick(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_PUBLISHABLE_KEY,
);

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
