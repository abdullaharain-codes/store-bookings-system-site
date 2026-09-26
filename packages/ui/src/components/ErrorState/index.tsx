import { type HTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(
  ({ title, message, retryLabel, onRetry, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="alert"
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
        <p className="max-w-[40ch] text-sm text-[var(--color-text-secondary)]">
          {message}
        </p>
        {retryLabel && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={clsx(
              "mt-[var(--space-2)] inline-flex min-h-[44px] min-w-[44px] items-center justify-center",
              "rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium",
              "border border-[var(--color-border-default)] bg-[var(--color-surface-base)] text-[var(--color-text-primary)]",
              "transition-colors duration-[var(--motion-duration-fast)]",
              "hover:bg-[var(--color-surface-muted)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-brand-accent)]"
            )}
          >
            {retryLabel}
          </button>
        )}
      </div>
    );
  }
);

ErrorState.displayName = "ErrorState";