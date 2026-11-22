import { clsx } from "clsx";

/**
 * The Button's class composition, as a pure function (TASK B3-4 F4).
 * Button uses it internally, and a plain styled Link can reuse it for a CTA
 * that must look exactly like a button without wrapping one in markup.
 */
export type ButtonVariant = "primary" | "secondary" | "tertiary" | "accent" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonStylesOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-[var(--color-brand-accent)] text-white hover:bg-[var(--color-brand-accent)]/90 focus-visible:ring-[var(--color-brand-accent)]",
  secondary: "border border-[var(--color-border-default)] bg-white text-[var(--color-text-primary)] hover:bg-[var(--color-surface-muted)] focus-visible:ring-[var(--color-brand-accent)]",
  tertiary: "text-[var(--color-brand-accent)] hover:underline focus-visible:ring-[var(--color-brand-accent)]",
  accent: "bg-[var(--color-accent-cta)] text-white hover:bg-[var(--color-accent-cta)]/90 focus-visible:ring-[var(--color-accent-cta)]",
  danger: "bg-[var(--color-status-error)] text-white hover:bg-[var(--color-status-error)]/90 focus-visible:ring-[var(--color-status-error)]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

const base =
  "inline-flex items-center justify-center rounded-[var(--radius-sm)] font-medium " +
  "transition-colors duration-[var(--motion-duration-fast)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "min-h-[44px] min-w-[44px]";

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: ButtonStylesOptions = {}): string {
  return clsx(base, variantStyles[variant], sizeStyles[size], className);
}