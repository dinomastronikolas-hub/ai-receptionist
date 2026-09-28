"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";
import { isAuthError } from "@/lib/errors";
import { OfflineBanner } from "./offline-banner";
import { ServiceWorkerRegistration } from "./sw-register";

function handleAuthExpiry(error: unknown) {
  if (isAuthError(error) && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    // Full reload on purpose: drops every cached query from the expired session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?reason=expired&next=${encodeURIComponent(window.location.pathname)}`);
  }
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-center"
      offset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      toastOptions={{ className: "!rounded-2xl !font-sans" }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handleAuthExpiry }),
        mutationCache: new MutationCache({ onError: handleAuthExpiry }),
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            gcTime: 30 * 60_000,
            retry: (count, err) => !isAuthError(err) && count < 2,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        {children}
        <OfflineBanner />
        <ThemedToaster />
        <ServiceWorkerRegistration />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
