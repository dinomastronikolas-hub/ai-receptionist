import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { safeNext } from "@/lib/validation";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/login?next=/onboarding");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_emoji, avatar_color, timezone, created_at")
    .eq("id", uid)
    .maybeSingle<Profile>();
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, "");
  const step = typeof sp.step === "string" ? sp.step : null;
  if (profile?.username && step !== "group") redirect(next || "/today");
  return <Onboarding userId={uid} profile={profile} next={next} />;
}
