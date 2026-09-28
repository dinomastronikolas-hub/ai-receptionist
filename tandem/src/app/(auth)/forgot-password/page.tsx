"use client";

import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { friendlyError } from "@/lib/errors";
import { attempt } from "@/lib/attempt";
import { getSupabase } from "@/lib/supabase/client";
import { emailSchema } from "@/lib/validation";
import { FormError, siteOrigin } from "../auth-ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto mb-4 size-12 text-brand" />
        <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">If an account exists for {email}, a reset link is on its way.</p>
        <Link href="/login" className="mt-8 inline-block font-semibold underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight">Reset password</h1>
      <p className="mt-1 mb-7 text-[15px] text-muted">We&apos;ll email you a link to choose a new one.</p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const parsed = emailSchema.safeParse(email);
          if (!parsed.success) return setError(parsed.error.issues[0].message);
          setBusy(true);
          const { error } = await attempt(() =>
            getSupabase().auth.resetPasswordForEmail(parsed.data, {
              redirectTo: `${siteOrigin()}/auth/callback?next=/reset-password`,
            }),
          );
          setBusy(false);
          if (error && !/not found/i.test((error as Error).message ?? "")) return setError(friendlyError(error));
          setSent(true);
        }}
      >
        <Field label="Email">
          {(id) => <Input id={id} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Send reset link
        </Button>
      </form>
      <p className="mt-8 text-center text-[15px] text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-fg underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
