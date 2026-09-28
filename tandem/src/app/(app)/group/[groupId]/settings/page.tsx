"use client";

import { useRouter } from "next/navigation";
import { LogOut, RefreshCw, Trash2, UserMinus, UserPlus } from "lucide-react";
import { use, useState } from "react";
import { toast } from "sonner";
import { InviteSheet, formatInviteCode } from "@/components/group/invite-sheet";
import { PageHeader } from "@/components/shell/page-header";
import { Avatar, displayName } from "@/components/ui/avatar";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { ConfirmSheet } from "@/components/ui/sheet";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { friendlyError } from "@/lib/errors";
import { useBoard, useDeleteGroup, useGroups, useRegenerateInvite, useRemoveMember, useUpdateGroup } from "@/lib/queries";
import { useMe } from "@/lib/use-me";
import type { GroupMember } from "@/lib/types";
import { groupNameSchema } from "@/lib/validation";

export default function GroupSettingsPage({ params }: PageProps<"/group/[groupId]/settings">) {
  const { groupId } = use(params);
  const router = useRouter();
  const { userId } = useMe();
  const { data: groups, isLoading } = useGroups(userId);
  const group = groups?.find((g) => g.id === groupId);
  const { data: board } = useBoard(group ? groupId : null);
  const update = useUpdateGroup(userId);
  const regen = useRegenerateInvite(userId);
  const remove = useRemoveMember(userId);
  const del = useDeleteGroup(userId);
  const [name, setName] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "leave" | "delete" | "regen" | { remove: GroupMember }>(null);

  if (isLoading) return <PageSkeleton />;
  if (!group) {
    return (
      <>
        <PageHeader back="/group" title="Group not found" />
        <EmptyState emoji="🫥" title="This group isn't available" body="It may have been deleted, or you're no longer a member." action={<ButtonLink href="/group">Back to groups</ButtonLink>} />
      </>
    );
  }

  const me = board?.members.find((m) => m.user_id === userId);
  const isOwner = me?.role === "owner";
  const onError = (e: unknown) => toast.error(friendlyError(e));

  return (
    <div className="space-y-7">
      <PageHeader back="/group" title="Group settings" subtitle={`${group.emoji} ${group.name}`} />

      {isOwner && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = groupNameSchema.safeParse(name ?? group.name);
            if (!parsed.success) return toast.error(parsed.error.issues[0].message);
            update.mutate({ id: group.id, patch: { name: parsed.data } }, { onSuccess: () => { toast.success("Saved"); setName(null); }, onError });
          }}
        >
          <Field label="Name">
            {(id) => <Input id={id} maxLength={50} value={name ?? group.name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          {name !== null && name !== group.name && (
            <Button type="submit" loading={update.isPending}>
              Save name
            </Button>
          )}
        </form>
      )}

      <section>
        <SectionTitle>Invite</SectionTitle>
        <Card className="p-4">
          <p className="text-[13px] font-semibold text-subtle">Invite code</p>
          <p className="font-mono text-2xl font-bold tracking-[0.12em]">{formatInviteCode(group.invite_code)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" /> Share invite
            </Button>
            {isOwner && (
              <Button size="sm" variant="secondary" onClick={() => setConfirm("regen")}>
                <RefreshCw className="size-4" /> New code
              </Button>
            )}
          </div>
        </Card>
      </section>

      {isOwner && (
        <section>
          <SectionTitle>Features</SectionTitle>
          <Card className="flex items-center gap-3 p-4">
            <div className="flex-1">
              <p className="font-semibold">Leaderboard</p>
              <p className="text-[13px] text-muted">A friendly weekly ranking by consistency.</p>
            </div>
            <Switch
              label="Leaderboard"
              checked={group.leaderboard_enabled}
              disabled={update.isPending}
              onChange={(on) => update.mutate({ id: group.id, patch: { leaderboard_enabled: on } }, { onError })}
            />
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Members</SectionTitle>
        <Card className="divide-y divide-line">
          {board?.members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar profile={m.profile} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {displayName(m.profile)}
                  {m.user_id === userId && <span className="font-normal text-muted"> (you)</span>}
                </p>
                <p className="text-[13px] text-muted">
                  @{m.profile.username} · {m.role === "owner" ? "Owner" : "Member"}
                </p>
              </div>
              {isOwner && m.user_id !== userId && (
                <button type="button" aria-label={`Remove ${displayName(m.profile)}`} onClick={() => setConfirm({ remove: m })} className={buttonClass("ghost", "icon", "text-muted hover:text-danger")}>
                  <UserMinus className="size-4.5" />
                </button>
              )}
            </div>
          ))}
        </Card>
      </section>

      <section className="space-y-2.5">
        <button type="button" onClick={() => setConfirm("leave")} className={buttonClass("secondary", "md", "w-full")}>
          <LogOut className="size-4" /> Leave group
        </button>
        {isOwner && (
          <button type="button" onClick={() => setConfirm("delete")} className={buttonClass("secondary", "md", "w-full text-danger")}>
            <Trash2 className="size-4" /> Delete group
          </button>
        )}
      </section>

      <InviteSheet group={group} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <ConfirmSheet
        open={confirm === "regen"}
        onClose={() => setConfirm(null)}
        title="Create a new invite code?"
        body="The old link and code will stop working immediately. Existing members stay in the group."
        confirmLabel="New code"
        danger={false}
        loading={regen.isPending}
        onConfirm={() => regen.mutate(group.id, { onSuccess: () => { toast.success("New invite code ready"); setConfirm(null); }, onError })}
      />
      <ConfirmSheet
        open={confirm === "leave"}
        onClose={() => setConfirm(null)}
        title={`Leave ${group.name}?`}
        body={
          isOwner
            ? "You're the owner — ownership passes to the longest-standing member. If you're the last member, the group is deleted."
            : "You'll stop seeing each other's habits. You can rejoin later with an invite."
        }
        confirmLabel="Leave"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate({ gid: group.id, userId }, { onSuccess: () => { toast.success(`You left ${group.name}`); router.replace("/group"); }, onError })
        }
      />
      <ConfirmSheet
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title={`Delete ${group.name}?`}
        body="The group is removed for everyone. Members keep their own habits and history."
        confirmLabel="Delete group"
        loading={del.isPending}
        onConfirm={() => del.mutate(group.id, { onSuccess: () => { toast.success("Group deleted"); router.replace("/group"); }, onError })}
      />
      <ConfirmSheet
        open={typeof confirm === "object" && confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm && typeof confirm === "object" ? `Remove ${displayName(confirm.remove.profile)}?` : ""}
        body="They'll lose access to the group. They can only come back with a new invite."
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => {
          if (confirm && typeof confirm === "object") {
            remove.mutate({ gid: group.id, userId: confirm.remove.user_id }, { onSuccess: () => { toast.success("Member removed"); setConfirm(null); }, onError });
          }
        }}
      />
    </div>
  );
}
