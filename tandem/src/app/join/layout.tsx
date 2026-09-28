import Link from "next/link";
import { Logo } from "@/components/shell/logo";

export default function JoinLayout({ children }: LayoutProps<"/join">) {
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col items-center px-5">
      <Link href="/" className="mt-10 mb-10">
        <Logo />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
