"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/errors";
import { setSelectedGroup } from "@/lib/queries";
import { getSupabase } from "@/lib/supabase/client";

export function JoinButton({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        size="lg"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const { data, error } = await getSupabase().rpc("join_group", { p_code: code });
          if (error) {
            setBusy(false);
            return setError(friendlyError(error));
          }
          setSelectedGroup(data as string);
          toast.success("You're in! Say hi to the crew 👋");
          router.replace("/group");
          router.refresh();
        }}
      >
        Join group
      </Button>
      {error && (
        <p role="alert" className="text-[14px] font-medium text-danger">
          {error}
        </p>
      )}
    </>
  );
}
