import { cn } from "@/lib/cn";

export function EmptyState({
  emoji,
  title,
  body,
  action,
  className,
}: {
  emoji: string;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-3xl border border-dashed border-line-strong px-6 py-10 text-center", className)}>
      <div className="mb-3 text-4xl" aria-hidden>
        {emoji}
      </div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      {body && <p className="mt-1.5 max-w-xs text-[15px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
