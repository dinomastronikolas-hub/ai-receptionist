"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/errors";
import { useCreateGroup } from "@/lib/queries";
import { useMe } from "@/lib/use-me";
import { groupNameSchema } from "@/lib/validation";

const GROUP_EMOJIS = ["🔥", "☀️", "💪", "🏃", "📚", "🧘", "🌱", "🚀", "🎯", "🦄", "🐺", "🏔️"];

export default function NewGroupPage() {
  const router = useRouter();
  const { userId } = useMe();
  const create = useCreateGroup(userId);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🔥");
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <PageHeader back title="New group" subtitle="A private space for you and your friends." />
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = groupNameSchema.safeParse(name);
          if (!parsed.success) return setError(parsed.error.issues[0].message);
          create.mutate(
            { name: parsed.data, emoji },
            {
              onSuccess: () => {
                toast.success("Group created — now invite your friends!");
                router.push("/group?invite=1");
              },
              onError: (err) => setError(friendlyError(err)),
            },
          );
        }}
      >
        <Field label="Group name" error={error}>
          {(id) => <Input id={id} autoFocus maxLength={50} placeholder="e.g. Morning Crew" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} />}
        </Field>
        <div className="space-y-2">
          <p className="px-1 text-[13px] font-semibold text-muted">Icon</p>
          <div className="grid grid-cols-6 gap-2">
            {GROUP_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={emoji === e}
                onClick={() => setEmoji(e)}
                className={cn("flex aspect-square items-center justify-center rounded-2xl text-2xl transition active:scale-90", emoji === e ? "bg-elevated shadow-card ring-2 ring-fg" : "bg-sunken")}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={create.isPending}>
          Create group
        </Button>
      </form>
    </>
  );
}
