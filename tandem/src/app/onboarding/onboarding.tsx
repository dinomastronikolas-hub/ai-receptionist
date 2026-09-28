"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/shell/logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { deviceTimeZone } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { displayNameSchema, usernameSchema } from "@/lib/validation";

export function Onboarding({ userId, profile, next }: { userId: string; profile: Profile | null; next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"profile" | "group">(profile?.username ? "group" : "profile");
  const [name, setName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState("");
  const [errors, setErrors] = useState<{ name?: string; username?: string }>({});
  const [busy, setBusy] = useState(false);

  const finish = (to: string) => {
    router.replace(to);
    router.refresh();
  };

  if (step === "profile") {
    return (
      <Shell>
        <h1 className="text-[28px] font-bold tracking-tight">Pick a username</h1>
        <p className="mt-1 mb-7 text-[15px] text-muted">This is how friends find you in your group.</p>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = displayNameSchema.safeParse(name);
            const u = usernameSchema.safeParse(username);
            const errs = { name: n.success ? undefined : n.error.issues[0].message, username: u.success ? undefined : u.error.issues[0].message };
            setErrors(errs);
            if (!n.success || !u.success) return;
            setBusy(true);
            const { error } = await getSupabase()
              .from("profiles")
              .update({ display_name: n.data, username: u.data, timezone: deviceTimeZone() })
              .eq("id", userId);
            setBusy(false);
            if (error) return setErrors({ username: error.code === "23505" ? "That username is taken — try another." : friendlyError(error) });
            if (next.startsWith("/join/")) return finish(next);
            setStep("group");
          }}
        >
          <Field label="Your name" error={errors.name}>
            {(id) => <Input id={id} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Username" error={errors.username} hint="3–20 letters, numbers or _">
            {(id) => <Input id={id} autoCapitalize="none" autoCorrect="off" maxLength={20} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))} />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Continue
          </Button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-[28px] font-bold tracking-tight">Find your crew</h1>
      <p className="mt-1 mb-7 text-[15px] text-muted">Tandem works best with friends. Start a private group or join one.</p>
      <div className="space-y-3">
        <ButtonLink href="/groups/new" size="lg" className="w-full">
          Create a group
        </ButtonLink>
        <ButtonLink href="/join" size="lg" variant="secondary" className="w-full">
          I have an invite code
        </ButtonLink>
        <button
          type="button"
          onClick={() => {
            toast("You can create or join a group any time from the Group tab.");
            finish(next || "/today");
          }}
          className="h-12 w-full rounded-full font-semibold text-muted hover:text-fg"
        >
          Skip for now
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col items-center px-5">
      <div className="mt-10 mb-10">
        <Logo />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
