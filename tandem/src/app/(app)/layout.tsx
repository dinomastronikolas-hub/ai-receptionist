import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SessionProvider } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_emoji, avatar_color, timezone, created_at")
    .eq("id", claims.sub)
    .maybeSingle<Profile>();

  if (error) throw new Error("We couldn't load your profile. Please try again.");
  if (!profile?.username) redirect("/onboarding");

  return (
    <SessionProvider value={{ userId: claims.sub, email: (claims.email as string | undefined) ?? null, initialProfile: profile }}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
