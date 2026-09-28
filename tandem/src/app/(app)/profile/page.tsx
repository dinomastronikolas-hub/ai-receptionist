"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronRight, Download, Globe, ListChecks, LogOut, Moon, Trash2, UsersRound } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Avatar, displayName } from "@/components/ui/avatar";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { ConfirmSheet, Sheet } from "@/components/ui/sheet";
import { COLORS, COLOR_NAMES } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/errors";
import { currentPushSubscription, disablePush, enablePush, isIOS, isStandalone, pushSupport } from "@/lib/push";
import { useGroups, useUpdateProfile } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { clearPageCache } from "@/lib/pwa";
import { getSupabase } from "@/lib/supabase/client";
import { useIsClient } from "@/lib/use-is-client";
import { useMe } from "@/lib/use-me";
import type { ColorName } from "@/lib/types";
import { displayNameSchema, usernameSchema } from "@/lib/validation";

const AVATARS = ["🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐸", "🐢", "🦉", "🐙", "🦄", "🐝", "🌵", "🍄", "⚡", "🌊"];

function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userId, profile } = useMe();
  const update = useUpdateProfile(userId);
  const [name, setName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username ?? "");
  const [emoji, setEmoji] = useState<string | null>(profile.avatar_emoji);
  const [color, setColor] = useState<ColorName>(profile.avatar_color);
  const [errors, setErrors] = useState<{ name?: string; username?: string }>({});

  return (
    <Sheet open={open} onClose={onClose} title="Edit profile">
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = displayNameSchema.safeParse(name);
          const u = usernameSchema.safeParse(username);
          const errs = { name: n.success ? undefined : n.error.issues[0].message, username: u.success ? undefined : u.error.issues[0].message };
          setErrors(errs);
          if (!n.success || !u.success) return;
          if (u.data !== profile.username) {
            const { data: ok } = await getSupabase().rpc("username_available", { p_username: u.data });
            if (!ok) return setErrors({ username: "That username is taken — try another." });
          }
          update.mutate(
            { display_name: n.data, username: u.data, avatar_emoji: emoji, avatar_color: color },
            { onSuccess: () => { toast.success("Profile updated"); onClose(); }, onError: (err) => toast.error(friendlyError(err)) },
          );
        }}
      >
        <div className="flex justify-center">
          <Avatar profile={{ display_name: name, username, avatar_emoji: emoji, avatar_color: color }} size={72} />
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          {AVATARS.map((a) => (
            <button key={a} type="button" aria-pressed={emoji === a} onClick={() => setEmoji(emoji === a ? null : a)} className={cn("flex aspect-square items-center justify-center rounded-xl text-xl", emoji === a ? "bg-sunken ring-2 ring-fg" : "hover:bg-sunken")}>
              {a}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Avatar color">
          {COLOR_NAMES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={COLORS[c].label} onClick={() => setColor(c)} className={cn("size-8 rounded-full", color === c && "ring-[3px] ring-offset-2 ring-offset-[var(--bg-elevated)]")} style={{ background: COLORS[c].hex, ["--tw-ring-color" as string]: COLORS[c].hex }} />
          ))}
        </div>
        <Field label="Display name" error={errors.name}>
          {(id) => <Input id={id} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Username" error={errors.username} hint="Letters, numbers and _ only.">
          {(id) => <Input id={id} maxLength={20} autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={update.isPending}>
          Save
        </Button>
      </form>
    </Sheet>
  );
}

function NotificationsRow() {
  const client = useIsClient();
  const qc = useQueryClient();
  const { userId } = useMe();
  const { data: sub, isLoading } = useQuery({ queryKey: ["push-sub", userId], queryFn: currentPushSubscription, enabled: client });
  const [busy, setBusy] = useState(false);
  const support = client ? pushSupport() : null;

  const reason =
    !support ? null
    : support.ok ? null
    : support.reason === "not-configured" ? "Reminders need push keys on the server — see the README. Your reminder times are saved."
    : support.reason === "ios-needs-install" ? "On iPhone, add Tandem to your Home Screen first, then enable notifications from the installed app."
    : support.reason === "denied" ? "Notifications are blocked for this site. Allow them in your browser or system settings."
    : "This browser doesn't support push notifications.";

  const toggle = async () => {
    setBusy(true);
    try {
      if (sub) {
        await disablePush();
        toast.success("Reminders turned off on this device");
      } else {
        await enablePush();
        toast.success("Reminders on! You'll get a nudge at each habit's reminder time.");
      }
      await qc.invalidateQueries({ queryKey: ["push-sub", userId] });
    } catch (e) {
      const msg = (e as Error).message;
      toast.error(msg === "denied" ? "Permission wasn't granted." : friendlyError(e, "Couldn't change notification settings."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <Bell className="mt-0.5 size-5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Reminders on this device</p>
        <p className="text-[13px] leading-snug text-muted">{reason ?? (sub ? "On — set a time on any habit." : "Get a nudge when a habit isn't done by its reminder time.")}</p>
      </div>
      {support?.ok && (
        <Button size="sm" variant={sub ? "secondary" : "primary"} loading={busy || isLoading} onClick={toggle}>
          {sub ? "Turn off" : "Turn on"}
        </Button>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { email } = useSession();
  const { userId, profile } = useMe();
  const { data: groups } = useGroups(userId);
  const { theme, setTheme } = useTheme();
  const client = useIsClient();
  const [editing, setEditing] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await disablePush().catch(() => {}); // don't send this user's reminders to the next person on this device
    await getSupabase().auth.signOut();
    await clearPageCache().catch(() => {});
    qc.clear();
    router.replace("/login");
  };

  return (
    <div className="space-y-7">
      <PageHeader title="Me" />

      <Card className="flex items-center gap-4 p-4">
        <Avatar profile={profile} size={60} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold tracking-tight">{displayName(profile)}</p>
          <p className="truncate text-[14px] text-muted">
            @{profile.username} {email && `· ${email}`}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </Card>

      <section>
        <SectionTitle>Your stuff</SectionTitle>
        <Card className="divide-y divide-line">
          <Link href="/habits" className="flex items-center gap-3 px-4 py-3.5 hover:bg-sunken/50">
            <ListChecks className="size-5 text-muted" />
            <span className="flex-1 font-semibold">Manage habits</span>
            <ChevronRight className="size-4 text-subtle" />
          </Link>
          {groups?.map((g) => (
            <Link key={g.id} href={`/group/${g.id}/settings`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-sunken/50">
              <span className="w-5 text-center" aria-hidden>{g.emoji}</span>
              <span className="flex-1 truncate font-semibold">{g.name}</span>
              <ChevronRight className="size-4 text-subtle" />
            </Link>
          ))}
          <Link href="/join" className="flex items-center gap-3 px-4 py-3.5 hover:bg-sunken/50">
            <UsersRound className="size-5 text-muted" />
            <span className="flex-1 font-semibold">Create or join a group</span>
            <ChevronRight className="size-4 text-subtle" />
          </Link>
        </Card>
      </section>

      <section>
        <SectionTitle>Settings</SectionTitle>
        <Card className="divide-y divide-line">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Moon className="size-5 shrink-0 text-muted" />
            <span className="flex-1 font-semibold">Appearance</span>
            {client && (
              <Segmented
                size="sm"
                value={(theme as "system" | "light" | "dark") ?? "system"}
                onChange={setTheme}
                options={[
                  { value: "system", label: "Auto" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            )}
          </div>
          <NotificationsRow />
          <div className="flex items-start gap-3 px-4 py-3.5">
            <Globe className="mt-0.5 size-5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Time zone</p>
              <p className="text-[13px] text-muted">
                {profile.timezone.replace(/_/g, " ")} — follows this device, so “today” is always your local day.
              </p>
            </div>
          </div>
          {client && !isStandalone() && (
            <button type="button" onClick={() => setInstallOpen(true)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-sunken/50">
              <Download className="size-5 text-muted" />
              <span className="flex-1 font-semibold">Install the app</span>
              <ChevronRight className="size-4 text-subtle" />
            </button>
          )}
        </Card>
      </section>

      <section className="space-y-2.5">
        <button type="button" onClick={signOut} disabled={signingOut} className={buttonClass("secondary", "md", "w-full")}>
          <LogOut className="size-4" /> {signingOut ? "Signing out…" : "Sign out"}
        </button>
        <button type="button" onClick={() => setConfirmDelete(true)} className={buttonClass("ghost", "md", "w-full text-danger")}>
          <Trash2 className="size-4" /> Delete account
        </button>
      </section>

      <EditProfileSheet key={String(editing)} open={editing} onClose={() => setEditing(false)} />

      <Sheet open={installOpen} onClose={() => setInstallOpen(false)} title="Install Tandem">
        {client && isIOS() ? (
          <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
            <li>Open this page in <b>Safari</b>.</li>
            <li>Tap the <b>Share</b> button (square with an arrow).</li>
            <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            <li>Open Tandem from your Home Screen — it runs full-screen like a native app.</li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
            <li>
              <b>Android (Chrome):</b> tap the ⋮ menu → <b>Install app</b> / <b>Add to Home screen</b>.
            </li>
            <li>
              <b>Desktop (Chrome/Edge):</b> click the install icon at the right of the address bar.
            </li>
          </ol>
        )}
      </Sheet>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete your account?"
        body="This permanently deletes your profile, habits, history, reactions and comments, and removes you from every group. This can't be undone."
        confirmLabel="Delete everything"
        loading={deleting}
        onConfirm={async () => {
          setDeleting(true);
          await disablePush().catch(() => {});
          const { error } = await getSupabase().rpc("delete_my_account");
          if (error) {
            setDeleting(false);
            toast.error(friendlyError(error));
            return;
          }
          await getSupabase().auth.signOut().catch(() => {});
          await clearPageCache().catch(() => {});
          qc.clear();
          router.replace("/");
          router.refresh();
        }}
      />
    </div>
  );
}
