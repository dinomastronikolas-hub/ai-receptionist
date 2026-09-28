import Link from "next/link";
import { Logo } from "@/components/shell/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col items-center px-5">
      <Link href="/" className="mt-10 mb-10">
        <Logo />
      </Link>
      <div className="w-full max-w-sm flex-1">{children}</div>
      <p className="py-6 text-center text-[12px] text-subtle">Private by default. Your friends only see what you share.</p>
    </div>
  );
}
