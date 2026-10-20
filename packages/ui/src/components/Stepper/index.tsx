import { clsx } from "clsx";

interface Step {
  id: string;
  label: string;
}

interface StepperProps {
  steps: Step[];
  currentStepIndex: number;
  completedStepIndices?: number[];
  onStepClick?: (index: number) => void;
  disableBackNav?: boolean;
  className?: string;
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export const Stepper = ({
  steps,
  currentStepIndex,
  completedStepIndices,
  onStepClick,
  disableBackNav = false,
  className,
}: StepperProps) => {
  if (steps.length === 0) {
    return null;
  }

  const clampedCurrent = Math.min(Math.max(Math.floor(currentStepIndex), 0), steps.length - 1);
  const isCompleted = (index: number) =>
    completedStepIndices
      ? completedStepIndices.includes(index)
      : index < clampedCurrent;

  return (
    <nav aria-label="Booking progress" className={className}>
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const completed = isCompleted(index);
          const current = index === clampedCurrent;

          const circle = (
            <span
              className={clsx(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[length:var(--font-size-sm)] font-semibold",
                completed || current
                  ? "bg-[var(--color-brand-accent)] text-white"
                  : "border border-[var(--color-border-default)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)]"
              )}
            >
              {completed && !current ? <CheckIcon /> : index + 1}
            </span>
          );

          const label = (
            <span
              className={clsx(
                "text-[length:var(--font-size-label-caps)] uppercase tracking-[var(--letter-spacing-label-caps)]",
                current
                  ? "font-semibold text-[var(--color-brand-accent)]"
                  : completed
                    ? "font-medium text-[var(--color-text-primary)]"
                    : "font-medium text-[var(--color-text-muted)]"
              )}
            >
              {step.label}
            </span>
          );

          return (
            <li
              key={step.id}
              className={clsx(
                "flex items-center",
                !isLast && "flex-1"
              )}
            >
              {completed ? (
                <button
                  type="button"
                  disabled={disableBackNav || !onStepClick}
                  aria-label={`Step ${index + 1} of ${steps.length}: ${step.label}, completed`}
                  onClick={() => onStepClick?.(index)}
                  className={clsx(
                    "flex flex-col items-center gap-[var(--space-2)] rounded-lg",
                    "transition-colors duration-[var(--motion-duration-fast)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]",
                    disableBackNav
                      ? "cursor-not-allowed opacity-60"
                      : "hover:text-[var(--color-brand-accent)]"
                  )}
                >
                  {circle}
                  {label}
                </button>
              ) : (
                <div
                  className="flex flex-col items-center gap-[var(--space-2)]"
                  {...(current ? { "aria-current": "step" as const } : {})}
                >
                  {circle}
                  {label}
                </div>
              )}

              {!isLast && (
                <div
                  aria-hidden="true"
                  className={clsx(
                    "mx-[var(--space-2)] h-1.5 flex-1 rounded-full",
                    completed
                      ? "bg-[var(--color-brand-accent)]"
                      : "bg-[var(--color-border-default)]"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};