import { type HTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          "rounded-[var(--radius-md)] bg-[var(--color-surface-base)] p-4",
          "shadow-[var(--shadow-1)]",
          interactive &&
            "transition-[box-shadow,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-easing-standard)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)]",
          className
        )}
        {...props}
      />
    );
  }
);

Card.displayName = "Card";
