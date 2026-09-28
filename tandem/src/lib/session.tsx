"use client";

import { createContext, useContext } from "react";
import type { Profile } from "./types";

interface Session {
  userId: string;
  email: string | null;
  initialProfile: Profile;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ value, children }: { value: Session; children: React.ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside the signed-in app");
  return s;
}
