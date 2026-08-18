import { type HTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          "rounded-[var(--radius-md)] bg-[var(--color-surface-base)] p-4",
          "shadow-[var(--shadow-1)]",
          className
        )}
        {...props}
      />
    );
  }
);

Card.displayName = "Card";
