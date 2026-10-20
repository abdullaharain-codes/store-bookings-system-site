import { forwardRef, type TextareaHTMLAttributes } from "react";
import { clsx } from "clsx";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, rows = 4, className, id, ...props }, ref) => {
    const textareaId = id || `textarea-${label.toLowerCase().replace(/\s+/g, "-")}`;

    return (
      <div className="w-full">
        <label
          htmlFor={textareaId}
          className="block text-sm font-medium text-[var(--color-text-primary)]"
        >
          {label}
        </label>
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-describedby={error ? `${textareaId}-error` : undefined}
          aria-invalid={!!error}
          className={clsx(
            "mt-1 block w-full rounded-[var(--radius-sm)] border px-3 py-2 text-sm",
            "transition-colors duration-[var(--motion-duration-fast)]",
            "focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-accent)] focus:border-[var(--color-brand-accent)]",
            error
              ? "border-[var(--color-status-error)] focus:ring-[var(--color-status-error)]"
              : "border-[var(--color-border-default)]",
            "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]",
            "resize-y disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="mt-1 text-sm text-[var(--color-status-error)]" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";