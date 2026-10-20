import { forwardRef, type SelectHTMLAttributes } from "react";
import { clsx } from "clsx";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, placeholder, className, id, ...props }, ref) => {
    const selectId = id || `select-${label.toLowerCase().replace(/\s+/g, "-")}`;

    const controlledValue = props.value;
    const resolvesToOption =
      controlledValue === undefined ||
      options.some((option) => option.value === controlledValue) ||
      (placeholder !== undefined && controlledValue === "");

    if (
      import.meta.env.DEV &&
      controlledValue !== undefined &&
      !resolvesToOption
    ) {
      console.warn(
        `[Select] controlled \`value\` prop (${JSON.stringify(
          controlledValue
        )}) for label="${label}" matches no rendered option, so React may drop the change event. ` +
          "Pass a value that matches an option, or use the `placeholder` empty-value option."
      );
    }

    return (
      <div className="w-full">
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-[var(--color-text-primary)]"
        >
          {label}
        </label>
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-describedby={error ? `${selectId}-error` : undefined}
            aria-invalid={!!error}
            className={clsx(
              "mt-1 block w-full appearance-none rounded-[var(--radius-sm)] border px-3 py-2 pr-10 text-sm",
              "transition-colors duration-[var(--motion-duration-fast)]",
              "focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-accent)] focus:border-[var(--color-brand-accent)]",
              error
                ? "border-[var(--color-status-error)] focus:ring-[var(--color-status-error)]"
                : "border-[var(--color-border-default)]",
              "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
        {error && (
          <p id={`${selectId}-error`} className="mt-1 text-sm text-[var(--color-status-error)]" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";