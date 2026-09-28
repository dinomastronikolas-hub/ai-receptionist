import { cn } from "@/lib/cn";

export function StatTile({ label, value, sub, accent, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: string; className?: string }) {
  return (
    <div className={cn("rounded-3xl bg-elevated p-4 shadow-card", className)}>
      <p className="text-[12px] font-semibold tracking-wide text-subtle uppercase">{label}</p>
      <p className="tabular mt-1 text-[26px] leading-none font-bold tracking-tight" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[12px] text-muted">{sub}</p>}
    </div>
  );
}
