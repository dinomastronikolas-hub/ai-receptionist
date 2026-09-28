"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, assertSupabaseEnv } from "./env";

let client: SupabaseClient | undefined;

/** Browser Supabase client (singleton). Uses the public key; RLS does the rest. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    assertSupabaseEnv();
    client = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return client;
}
