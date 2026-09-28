"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { friendlyError } from "@/lib/errors";
import { attempt } from "@/lib/attempt";
import { getSupabase } from "@/lib/supabase/client";
import { passwordSchema } from "@/lib/validation";
import { FormError } from "../auth-ui";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSupabase()
      .auth.getUser()
      .then(({ data }) => setHasSession(Boolean(data.user)));
  }, []);

  if (hasSession === false) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Link expired</h1>
        <p className="mt-2 text-[15px] text-muted">This reset link is invalid or has already been used.</p>
        <Link href="/forgot-password" className="mt-6 inline-block font-semibold underline-offset-4 hover:underline">
          Send a new link
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-1 mb-7 text-[15px] text-muted">Make it at least 8 characters.</p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const parsed = passwordSchema.safeParse(password);
          if (!parsed.success) return setError(parsed.error.issues[0].message);
          if (password !== confirm) return setError("Passwords don't match.");
          setBusy(true);
          const { error } = await attempt(() => getSupabase().auth.updateUser({ password }));
          setBusy(false);
          if (error) return setError(friendlyError(error));
          router.replace("/today");
          router.refresh();
        }}
      >
        <Field label="New password">
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label="Confirm password">
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={hasSession === null}>
          Update password
        </Button>
      </form>
    </>
  );
}
