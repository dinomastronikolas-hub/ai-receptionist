"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabaseConfigured } from "./env";

let client: SupabaseClient | undefined;

const REQUEST_TIMEOUT_MS = 20_000;

/** fetch that gives up after REQUEST_TIMEOUT_MS so a stalled network never leaves a spinner running forever. */
const fetchWithTimeout: typeof fetch = (input, init) => {
  if (init?.signal || typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") {
    return fetch(input, init);
  }
  return fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
};

/**
 * Browser Supabase client (singleton). Uses the public key; RLS does the rest.
 * If the deployment is missing its Supabase settings, requests fail fast and
 * `friendlyError` explains the misconfiguration instead of the UI hanging.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      supabaseConfigured() ? SUPABASE_URL : "https://supabase-not-configured.invalid",
      supabaseConfigured() ? SUPABASE_PUBLISHABLE_KEY : "missing-publishable-key",
      { global: { fetch: fetchWithTimeout } },
    );
  }
  return client;
}
