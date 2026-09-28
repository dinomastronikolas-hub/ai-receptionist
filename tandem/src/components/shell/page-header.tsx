"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  subtitle,
  back,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: string | true;
  action?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <header className={cn("pt-5 pb-5", className)}>
      {back && (
        <div className="mb-3 -ml-2">
          {typeof back === "string" ? (
            <Link href={back} className="inline-flex h-9 items-center gap-0.5 rounded-full pr-3 pl-1.5 text-[15px] font-semibold text-muted hover:text-fg">
              <ChevronLeft className="size-5" /> Back
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? router.back() : router.push("/today"))}
              className="inline-flex h-9 items-center gap-0.5 rounded-full pr-3 pl-1.5 text-[15px] font-semibold text-muted hover:text-fg"
            >
              <ChevronLeft className="size-5" /> Back
            </button>
          )}
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight text-balance">{title}</h1>
          {subtitle && <div className="mt-1 text-[15px] text-muted">{subtitle}</div>}
        </div>
        {action && <div className="shrink-0 pt-1">{action}</div>}
      </div>
    </header>
  );
}
