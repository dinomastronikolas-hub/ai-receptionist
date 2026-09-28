"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";

export function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "");
}

export const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";

export function GoogleButton({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!GOOGLE_ENABLED) return null;
  return (
    <>
      <div className="my-6 flex items-center gap-3 text-[12px] font-semibold text-subtle uppercase">
        <span className="h-px flex-1 bg-line-strong" /> or <span className="h-px flex-1 bg-line-strong" />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const { error } = await getSupabase().auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
          });
          if (error) {
            setError(friendlyError(error));
            setBusy(false);
          }
        }}
        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-line-strong bg-elevated font-semibold hover:bg-sunken disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.3 0-6-2.74-6-6.1s2.7-6.1 6-6.1c1.9 0 3.16.8 3.88 1.5l2.64-2.55C16.9 3.4 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.54 0 9.2-3.9 9.2-9.38 0-.63-.07-1.1-.16-1.6H12z" />
        </svg>
        Continue with Google
      </button>
      {error && <p className="mt-2 text-center text-[13px] text-danger">{error}</p>}
    </>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-[14px] font-medium text-danger">
      {children}
    </p>
  );
}
