import type { ReactNode } from "react";
import { clsx } from "clsx";

interface ClickableAreaProps {
  onActivate?: () => void;
  children: ReactNode;
  className?: string;
}

export function ClickableArea({ onActivate, children, className }: ClickableAreaProps) {
  if (!onActivate) {
    return <div className={clsx("block", className)}>{children}</div>;
  }

  return (
    <a
      href="#"
      onClick={(event) => {
        event.preventDefault();
        onActivate();
      }}
      className={clsx(
        "block cursor-pointer rounded-[var(--radius-sm)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)] focus-visible:ring-offset-2",
        className
      )}
    >
      {children}
    </a>
  );
}