"use client";

import { onlineManager } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

export function useOnline() {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}

export function OfflineBanner() {
  const online = useOnline();
  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          role="status"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="pt-safe fixed inset-x-0 top-0 z-[60] flex justify-center px-4"
        >
          <div className="mt-2 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg shadow-float">
            <WifiOff className="size-4" />
            Offline — check-ins will sync when you reconnect
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
