import { Logo } from "@/components/shell/logo";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />
      <div className="mt-10 text-5xl">📡</div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">You&apos;re offline</h1>
      <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted">Tandem needs a connection to load. Reconnect and we&apos;ll pick up right where you left off.</p>
      <a href="/today" className="mt-8 inline-flex h-12 items-center rounded-full bg-primary px-6 font-semibold text-primary-fg">
        Try again
      </a>
    </div>
  );
}
