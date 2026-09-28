import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl">🧭</div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-2 text-[15px] text-muted">That page doesn&apos;t exist or you don&apos;t have access to it.</p>
      <ButtonLink href="/today" className="mt-8">
        Go to Today
      </ButtonLink>
    </div>
  );
}
