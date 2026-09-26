import { type HTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

interface LoadingSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  lines?: number;
  items?: number;
  label?: string;
}

export const LoadingSkeleton = forwardRef<HTMLDivElement, LoadingSkeletonProps>(
  ({ lines = 3, items = 1, label, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role={label ? "status" : undefined}
        aria-label={label}
        className={clsx("flex flex-col gap-[var(--space-4)]", className)}
        {...props}
      >
        {Array.from({ length: items }, (_, i) => (
          <div
            key={i}
            aria-hidden="true"
            className={clsx(
              "flex w-full flex-col gap-[var(--space-2)]",
              "rounded-[var(--radius-md)] bg-[var(--color-surface-base)] p-[var(--space-4)]",
              "border border-[var(--color-border-default)]"
            )}
          >
            <div className="h-40 w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] animate-pulse" />
            {Array.from({ length: lines }, (_, l) => (
              <div
                key={l}
                className="h-3 w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] animate-pulse last:w-2/3"
              />
            ))}
          </div>
        ))}
      </div>
    );
  }
);

LoadingSkeleton.displayName = "LoadingSkeleton";