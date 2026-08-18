import { type HTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)]",
  success: "bg-[var(--color-status-success)]/10 text-[var(--color-status-success)]",
  warning: "bg-[var(--color-status-warning)]/10 text-[var(--color-status-warning)]",
  error: "bg-[var(--color-status-error)]/10 text-[var(--color-status-error)]",
  info: "bg-[var(--color-status-info)]/10 text-[var(--color-status-info)]",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "default", className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={clsx(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
          variantStyles[variant],
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";
