"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { Group } from "@/lib/types";

export function formatInviteCode(code: string) {
  return code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

export function inviteUrl(code: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin.replace(/\/$/, "")}/join/${code}`;
}

export function InviteSheet({ group, open, onClose }: { group: Group; open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(group.invite_code);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — long-press the link to copy it instead.");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Invite friends">
      <p className="text-[15px] leading-relaxed text-muted">
        Anyone with this link can join <b className="text-fg">{group.emoji} {group.name}</b> and see everyone&apos;s shared habits. Only send it to people you trust.
      </p>
      <div className="mt-5 rounded-3xl bg-sunken p-5 text-center">
        <p className="text-[12px] font-semibold tracking-wide text-subtle uppercase">Invite code</p>
        <p className="mt-1 font-mono text-[28px] font-bold tracking-[0.12em] select-all">{formatInviteCode(group.invite_code)}</p>
        <p className="mt-2 text-[13px] break-all text-muted select-all">{url}</p>
      </div>
      <div className="mt-5 grid gap-2.5">
        {canShare && (
          <Button
            size="lg"
            onClick={() =>
              navigator.share({ title: `Join ${group.name} on Tandem`, text: `Join my accountability group “${group.name}” on Tandem`, url }).catch(() => {})
            }
          >
            <Share2 className="size-4.5" /> Share invite
          </Button>
        )}
        <Button size="lg" variant={canShare ? "secondary" : "primary"} onClick={copy}>
          {copied ? <Check className="size-4.5" /> : <Copy className="size-4.5" />} {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </Sheet>
  );
}
