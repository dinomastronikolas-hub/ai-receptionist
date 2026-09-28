"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { friendlyError } from "@/lib/errors";
import { attempt } from "@/lib/attempt";
import { getSupabase } from "@/lib/supabase/client";
import { emailSchema, safeNext } from "@/lib/validation";
import { FormError, GoogleButton } from "../auth-ui";

const REASONS: Record<string, string> = {
  expired: "Your session expired. Please log in again.",
  "signed-out": "You've been signed out.",
  link: "That link is invalid or has expired. Please try again.",
  reset: "Password updated — log in with your new password.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const reason = REASONS[params.get("reason") ?? params.get("error") ?? ""];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight">Welcome back</h1>
      <p className="mt-1 mb-7 text-[15px] text-muted">Log in to check in with your crew.</p>
      {reason && <p className="mb-5 rounded-2xl bg-sunken px-4 py-3 text-[14px]">{reason}</p>}
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const parsed = emailSchema.safeParse(email);
          if (!parsed.success) return setError(parsed.error.issues[0].message);
          if (!password) return setError("Enter your password.");
          setBusy(true);
          const { error } = await attempt(() => getSupabase().auth.signInWithPassword({ email: parsed.data, password }));
          if (error) {
            setBusy(false);
            return setError(friendlyError(error));
          }
          router.replace(next);
          router.refresh();
        }}
      >
        <Field label="Email">
          {(id) => <Input id={id} type="email" autoComplete="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password">
          {(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <div className="-mt-1 text-right">
          <Link href="/forgot-password" className="text-[14px] font-semibold text-muted hover:text-fg">
            Forgot password?
          </Link>
        </div>
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Log in
        </Button>
      </form>
      <GoogleButton next={next} />
      <p className="mt-8 text-center text-[15px] text-muted">
        New here?{" "}
        <Link href={`/signup${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-fg underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
