"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight">Join a group</h1>
      <p className="mt-1 mb-7 text-[15px] text-muted">Paste the invite link or type the 10-character code a friend sent you.</p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fromLink = code.match(/\/join\/([A-Za-z0-9-]+)/)?.[1];
          const clean = (fromLink ?? code).toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (clean.length < 6) return setError("That code looks too short.");
          router.push(`/join/${clean}`);
        }}
      >
        <Field label="Invite code or link" error={error}>
          {(id) => (
            <Input
              id={id}
              autoFocus
              autoCapitalize="characters"
              autoCorrect="off"
              placeholder="ABCDE-FGH23"
              className="font-mono tracking-wider"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full">
          Continue
        </Button>
      </form>
      <p className="mt-8 text-center text-[15px] text-muted">
        Want your own?{" "}
        <Link href="/groups/new" className="font-semibold text-fg underline-offset-4 hover:underline">
          Create a group
        </Link>
      </p>
    </>
  );
}
