import Link from "next/link";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Logo } from "@/components/shell/logo";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

export const metadata = { title: "Setup check" };

interface Check {
  label: string;
  ok: boolean | null; // null = skipped
  detail: string;
  fix?: string;
}

const RERUN_SQL = "Run supabase/migrations/20260928000000_init.sql again in Supabase → SQL Editor (the whole file).";

function describe(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return "";
  return [err.code, err.message].filter(Boolean).join(": ");
}

/**
 * Setup diagnostics: confirms the deployment can reach Supabase and that the
 * database migration is fully applied. Shows no user data beyond your own
 * sign-in state.
 */
export default async function StatusPage() {
  await connection();
  const checks: Check[] = [];

  const hasUrl = SUPABASE_URL.startsWith("https://") || SUPABASE_URL.startsWith("http://");
  checks.push({
    label: "NEXT_PUBLIC_SUPABASE_URL",
    ok: hasUrl,
    detail: hasUrl ? SUPABASE_URL : SUPABASE_URL ? `Doesn't look like a URL: "${SUPABASE_URL.slice(0, 40)}"` : "Missing",
    fix: hasUrl ? undefined : "Add it in Vercel → Settings → Environment Variables, then Redeploy.",
  });
  checks.push({
    label: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ok: SUPABASE_PUBLISHABLE_KEY.length > 20,
    detail: SUPABASE_PUBLISHABLE_KEY ? `${SUPABASE_PUBLISHABLE_KEY.slice(0, 16)}… (${SUPABASE_PUBLISHABLE_KEY.length} chars)` : "Missing",
    fix: SUPABASE_PUBLISHABLE_KEY.length > 20 ? undefined : "Add it in Vercel → Settings → Environment Variables, then Redeploy.",
  });

  if (hasUrl && SUPABASE_PUBLISHABLE_KEY) {
    const cookieStore = await cookies();
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
    });

    // Reachability + database functions (callable without signing in).
    try {
      const { error } = await supabase.rpc("username_available", { p_username: "status_check" });
      checks.push({
        label: "Database functions",
        ok: !error,
        detail: error ? describe(error) : "Connected; setup functions are installed",
        fix: error
          ? /Invalid API key|JWT|apikey/i.test(error.message ?? "")
            ? "The publishable key doesn't match this Supabase project. Copy it again from Project Settings → API Keys."
            : RERUN_SQL
          : undefined,
      });
    } catch (e) {
      checks.push({ label: "Reach Supabase", ok: false, detail: String(e), fix: "Check the Supabase URL in Vercel, then Redeploy." });
    }

    const { data: claims, error: authError } = await supabase.auth.getClaims();
    const uid = claims?.claims?.sub;
    checks.push({
      label: "Signed in",
      ok: uid ? true : null,
      detail: uid ? `Yes (${String(claims?.claims?.email ?? uid)})` : authError ? describe(authError) : "Not signed in — log in, then reopen this page for more checks",
    });

    if (uid) {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("username, display_name, timezone")
        .eq("id", uid)
        .maybeSingle();
      checks.push({
        label: "Your profile",
        ok: !error && Boolean(profile),
        detail: error
          ? describe(error)
          : profile
            ? `username: ${profile.username ?? "(not set yet)"} · time zone: ${profile.timezone}`
            : "No profile row for your account",
        fix: error || !profile ? RERUN_SQL : undefined,
      });

      const { error: histErr } = await supabase.rpc("habit_history", { p_user_ids: [uid] });
      checks.push({
        label: "Habit history",
        ok: !histErr,
        detail: histErr ? describe(histErr) : "OK",
        fix: histErr ? RERUN_SQL : undefined,
      });

      const { error: groupsErr } = await supabase.from("groups").select("id").limit(1);
      checks.push({
        label: "Groups",
        ok: !groupsErr,
        detail: groupsErr ? describe(groupsErr) : "OK",
        fix: groupsErr ? RERUN_SQL : undefined,
      });
    }
  }

  const allGood = checks.every((c) => c.ok !== false);

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-10">
      <Logo />
      <h1 className="mt-8 text-2xl font-bold tracking-tight">Setup check</h1>
      <p className="mt-1 text-[15px] text-muted">{allGood ? "Everything looks good ✅" : "Something needs fixing — see the red items below."}</p>
      <ul className="mt-6 space-y-3">
        {checks.map((c) => (
          <li key={c.label} className="rounded-2xl bg-elevated p-4 shadow-card">
            <p className="font-semibold">
              {c.ok === true ? "✅" : c.ok === false ? "❌" : "➖"} {c.label}
            </p>
            <p className="mt-1 text-[14px] break-words text-muted">{c.detail}</p>
            {c.fix && <p className="mt-2 text-[14px] font-medium text-danger">{c.fix}</p>}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex gap-3">
        <Link href="/today" className="inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-primary-fg">
          Open the app
        </Link>
        <Link href="/login" className="inline-flex h-11 items-center rounded-full bg-sunken px-5 font-semibold">
          Log in
        </Link>
      </div>
    </div>
  );
}
