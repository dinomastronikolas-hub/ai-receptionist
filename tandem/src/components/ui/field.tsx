import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "block w-full rounded-2xl border border-line-strong bg-elevated px-4 h-12 text-[16px] text-fg placeholder:text-subtle outline-none transition focus:border-brand focus:ring-4 focus:ring-[var(--ring)]/30 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(inputClass, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(inputClass, "h-auto min-h-24 py-3 resize-none", className)} {...props} />;
  },
);

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block px-1 text-[13px] font-semibold text-muted">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="px-1 text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="px-1 text-[13px] text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
