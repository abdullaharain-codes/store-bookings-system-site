import { type HTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ title, description, actionLabel, onAction, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          "flex w-full flex-col items-center justify-center gap-[var(--space-3)] text-center",
          "px-[var(--space-6)] py-[var(--space-7)]",
          className
        )}
        {...props}
      >
        <h2 className="text-[var(--font-size-lg)] font-[var(--font-weight-medium)] text-[var(--color-text-primary)]">
          {title}
        </h2>
        {description && (
          <p className="max-w-[40ch] text-sm text-[var(--color-text-secondary)]">
            {description}
          </p>
        )}
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className={clsx(
              "mt-[var(--space-2)] inline-flex min-h-[44px] min-w-[44px] items-center justify-center",
              "rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium",
              "bg-[var(--color-brand-accent)] text-white",
              "transition-colors duration-[var(--motion-duration-fast)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-brand-accent)]"
            )}
          >
            {actionLabel}
          </button>
        )}
      </div>
    );
  }
);

EmptyState.displayName = "EmptyState";