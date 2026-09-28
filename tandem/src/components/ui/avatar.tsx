import { alpha, colorHex } from "@/lib/colors";
import { cn } from "@/lib/cn";
import type { Profile } from "@/lib/types";

export function displayName(p: Pick<Profile, "display_name" | "username"> | null | undefined): string {
  return p?.display_name?.trim() || p?.username || "Someone";
}

export function Avatar({
  profile,
  size = 40,
  className,
}: {
  profile: Pick<Profile, "display_name" | "username" | "avatar_emoji" | "avatar_color"> | null | undefined;
  size?: number;
  className?: string;
}) {
  const hex = colorHex(profile?.avatar_color);
  const name = displayName(profile);
  return (
    <div
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold", className)}
      style={{ width: size, height: size, background: alpha(hex, 0.18), color: hex, fontSize: size * 0.45 }}
    >
      {profile?.avatar_emoji || name.slice(0, 1).toUpperCase()}
    </div>
  );
}
