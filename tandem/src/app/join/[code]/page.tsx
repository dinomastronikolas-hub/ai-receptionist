import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JoinButton } from "./join-button";

export const metadata = { title: "Join a group" };

interface Preview {
  group_id: string;
  name: string;
  emoji: string;
  member_count: number;
  is_member: boolean;
}

export default async function JoinCodePage({ params }: PageProps<"/join/[code]">) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  const supabase = await createSupabaseServerClient();
  const [{ data: claims }, { data: rows, error }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc("get_invite_preview", { p_code: code }),
  ]);
  const signedIn = Boolean(claims?.claims?.sub);
  const preview = (rows as Preview[] | null)?.[0];

  if (error || !preview) {
    return (
      <div className="text-center">
        <div className="mb-4 text-5xl">🔗</div>
        <h1 className="text-2xl font-bold tracking-tight">{error ? "Couldn't check this invite" : "Invite not found"}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {error
            ? "Something went wrong on our side. Please try again in a moment."
            : "This invite link is invalid, or the group owner created a new one. Ask your friend for a fresh link."}
        </p>
        <div className="mt-8 flex flex-col gap-2">
          <ButtonLink href="/join" variant="secondary">
            Enter a code
          </ButtonLink>
          <ButtonLink href={signedIn ? "/today" : "/"} variant="ghost">
            {signedIn ? "Go to Today" : "Home"}
          </ButtonLink>
        </div>
      </div>
    );
  }

  const next = `/join/${code}`;
  return (
    <div className="text-center">
      <div className="mx-auto mb-5 flex size-24 items-center justify-center rounded-[32px] bg-elevated text-5xl shadow-card">{preview.emoji}</div>
      <p className="text-[15px] font-medium text-muted">You&apos;re invited to join</p>
      <h1 className="mt-1 text-[30px] leading-tight font-bold tracking-tight">{preview.name}</h1>
      <p className="mt-2 text-[15px] text-muted">
        {preview.member_count} member{preview.member_count === 1 ? "" : "s"} · private group
      </p>
      <p className="mx-auto mt-6 max-w-xs text-[14px] leading-relaxed text-muted">
        Members see each other&apos;s shared habits, streaks and check-ins. Habits you mark private are never shown.
      </p>
      <div className="mt-8 flex flex-col gap-2.5">
        {preview.is_member ? (
          <ButtonLink href="/group" size="lg">
            You&apos;re already in — open group
          </ButtonLink>
        ) : signedIn ? (
          <JoinButton code={code} />
        ) : (
          <>
            <ButtonLink href={`/signup?next=${encodeURIComponent(next)}`} size="lg">
              Create an account to join
            </ButtonLink>
            <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} size="lg" variant="secondary">
              I already have an account
            </ButtonLink>
          </>
        )}
      </div>
      {signedIn && (
        <Link href="/today" className="mt-6 inline-block text-[14px] font-semibold text-muted hover:text-fg">
          Not now
        </Link>
      )}
    </div>
  );
}
