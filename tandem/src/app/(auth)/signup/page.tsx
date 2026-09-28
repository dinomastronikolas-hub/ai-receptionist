"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { deviceTimeZone } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { attempt } from "@/lib/attempt";
import { getSupabase } from "@/lib/supabase/client";
import { displayNameSchema, emailSchema, passwordSchema, safeNext, usernameSchema } from "@/lib/validation";
import { FormError, GoogleButton, siteOrigin } from "../auth-ui";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

function useUsernameAvailability(username: string): Availability {
  const [state, setState] = useState<{ for: string; value: Availability }>({ for: "", value: "idle" });
  useEffect(() => {
    const parsed = usernameSchema.safeParse(username);
    if (!username || !parsed.success) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await getSupabase().rpc("username_available", { p_username: parsed.data });
      if (!cancelled) setState({ for: username, value: error ? "idle" : data ? "available" : "taken" });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username]);
  if (!username) return "idle";
  if (!usernameSchema.safeParse(username).success) return "invalid";
  return state.for === username ? state.value : "checking";
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"), "");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const availability = useUsernameAvailability(username);

  if (sentTo) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto mb-4 size-12 text-brand" />
        <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          We sent a confirmation link to <b className="text-fg">{sentTo}</b>. Open it on this device to finish creating your account.
        </p>
        <Link href="/login" className="mt-8 inline-block font-semibold underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  const afterSignup = next.startsWith("/join/") ? next : `/onboarding?step=group${next ? `&next=${encodeURIComponent(next)}` : ""}`;

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight">Create your account</h1>
      <p className="mt-1 mb-7 text-[15px] text-muted">Free, private, and built for doing it together.</p>
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const n = displayNameSchema.safeParse(name);
          const u = usernameSchema.safeParse(username);
          const em = emailSchema.safeParse(email);
          const pw = passwordSchema.safeParse(password);
          const errs = {
            name: n.success ? undefined : n.error.issues[0].message,
            username: u.success ? (availability === "taken" ? "That username is taken" : undefined) : u.error.issues[0].message,
            email: em.success ? undefined : em.error.issues[0].message,
            password: pw.success ? undefined : pw.error.issues[0].message,
          };
          setErrors(errs);
          if (Object.values(errs).some(Boolean) || !n.success || !u.success || !em.success) return;
          setBusy(true);
          const { data, error } = await attempt(() =>
            getSupabase().auth.signUp({
              email: em.data,
              password,
              options: {
                data: { username: u.data, display_name: n.data, timezone: deviceTimeZone() },
                emailRedirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent(afterSignup)}`,
              },
            }),
          );
          setBusy(false);
          if (error) return setError(friendlyError(error));
          // With email confirmation on, Supabase returns a user with no identities for an existing email.
          if (data?.user && data.user.identities?.length === 0) return setError("An account with that email already exists. Try logging in.");
          if (data?.session) {
            router.replace(afterSignup);
            router.refresh();
          } else {
            setSentTo(em.data);
          }
        }}
      >
        <Field label="Your name" error={errors.name}>
          {(id) => <Input id={id} autoComplete="given-name" maxLength={40} placeholder="Alex" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field
          label="Username"
          error={errors.username ?? (availability === "taken" ? "That username is taken" : undefined)}
          hint={availability === "available" ? "✓ Available" : availability === "checking" ? "Checking…" : "3–20 letters, numbers or _"}
        >
          {(id) => (
            <Input id={id} autoCapitalize="none" autoCorrect="off" maxLength={20} placeholder="alex" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))} />
          )}
        </Field>
        <Field label="Email" error={errors.email}>
          {(id) => <Input id={id} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters.">
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Create account
        </Button>
      </form>
      <GoogleButton next={afterSignup} />
      <p className="mt-8 text-center text-[15px] text-muted">
        Already have an account?{" "}
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-fg underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
