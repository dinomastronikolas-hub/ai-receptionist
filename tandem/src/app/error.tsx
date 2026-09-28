"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl">{offline ? "📡" : "😵"}</div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{offline ? "You're offline" : "Something went wrong"}</h1>
      <p className="mt-2 max-w-xs text-[15px] text-muted">
        {offline ? "Reconnect and try again." : "Sorry about that. Try again — if it keeps happening, reload the app."}
      </p>
      <Button className="mt-8" onClick={reset}>
        Try again
      </Button>
      {!offline && (
        <a href="/status" className="mt-4 text-[14px] font-semibold text-muted underline-offset-4 hover:underline">
          Run a setup check
        </a>
      )}
      {error.digest && <p className="mt-6 font-mono text-[11px] text-subtle">Error ID: {error.digest}</p>}
    </div>
  );
}
