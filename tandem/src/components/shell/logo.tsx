import { cn } from "@/lib/cn";

/** Wordmark with a tiny contribution-grid glyph. */
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  const cells = [0.35, 1, 0.6, 1, 0.8, 0.35, 1, 1, 0.6];
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="grid size-7 grid-cols-3 gap-[2.5px] rounded-[9px] bg-primary p-[5px]" aria-hidden>
        {cells.map((o, i) => (
          <span key={i} className="rounded-[1.5px] bg-brand" style={{ opacity: o }} />
        ))}
      </span>
      {!compact && <span className="text-[19px] font-bold tracking-tight">Tandem</span>}
    </span>
  );
}
