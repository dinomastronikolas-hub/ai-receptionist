import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** false during SSR/hydration, true afterwards — without a setState-in-effect. */
export function useIsClient(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
