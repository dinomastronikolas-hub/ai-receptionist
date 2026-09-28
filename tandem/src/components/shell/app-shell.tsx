"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { BarChart3, CalendarCheck2, Plus, UserRound, UsersRound } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { deviceTimeZone } from "@/lib/dates";
import { useUpdateProfile } from "@/lib/queries";
import { getSupabase } from "@/lib/supabase/client";
import { useMe } from "@/lib/use-me";
import { Logo } from "./logo";

const NAV = [
  { href: "/today", label: "Today", icon: CalendarCheck2 },
  { href: "/group", label: "Group", icon: UsersRound },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/profile", label: "Me", icon: UserRound },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/group") return pathname.startsWith("/group") || pathname.startsWith("/people");
  if (href === "/profile") return pathname.startsWith("/profile");
  if (href === "/progress") return pathname.startsWith("/progress") || pathname.startsWith("/habits");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function useSessionGuards() {
  const router = useRouter();
  const { userId, profile } = useMe();
  const updateProfile = useUpdateProfile(userId);
  const synced = useRef(false);

  // Keep the profile's time zone in step with the device so "today" is
  // always the user's local calendar day (e.g. after travelling).
  useEffect(() => {
    if (synced.current) return;
    const tz = deviceTimeZone();
    if (tz && tz !== profile.timezone) {
      synced.current = true;
      updateProfile.mutate({ timezone: tz });
    }
  }, [profile.timezone, updateProfile]);

  // Expired / revoked session → back to login.
  useEffect(() => {
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login?reason=signed-out");
    });
    return () => data.subscription.unsubscribe();
  }, [router]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useSessionGuards();

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
        <Link href="/today" className="mb-8 px-2">
          <Logo />
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold transition-colors",
                  active ? "bg-elevated text-fg shadow-card" : "text-muted hover:bg-sunken hover:text-fg",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/habits/new"
          className="mt-6 flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-fg hover:opacity-90"
        >
          <Plus className="size-4.5" /> New habit
        </Link>
      </aside>

      <main className="pt-safe mx-auto w-full max-w-xl flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] md:max-w-2xl md:px-8 md:pt-8 md:pb-16">
        {children}
      </main>

      {/* Mobile tab bar */}
      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto flex max-w-xl">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-15 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors",
                  active ? "text-fg" : "text-subtle",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-fg"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 1.9} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
