import {
  Children,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";
import { clsx } from "clsx";
import { useReducedMotion } from "../../hooks/useReducedMotion";

// One class string for both copies, so they can never drift apart. `gap-` spaces
// the items; `pr-` adds the trailing period-closing space that makes the loop
// arithmetic exact (see styles/marquee.css). `grow` + `min-w-[200%]` on the track
// stretch a short list across at least two container widths so the -50%
// translation always has copy B to reveal.
const COPY_CLASSES = "flex grow shrink-0 items-center justify-around gap-[var(--space-6)] pr-[var(--space-6)]";

export interface MarqueeProps {
  /** Items rendered in the band.
   *
   *  ⚠ children are rendered TWICE — once as real content, once as an
   *  aria-hidden + inert decoration copy — so the loop needs no JS measurement.
   *  Two consequences for whatever you pass in:
   *
   *  1. **No `id` attributes.** Duplicate ids in the document are invalid HTML,
   *     break `aria-labelledby`/`aria-describedby`/`<label for>` resolution, and
   *     silently retarget at the decoration copy. Use a React `key` or a data
   *     attribute for identity instead.
   *  2. **No mount side effects.** A duplicated item mounts twice, so analytics
   *     beacons, impression tracking, subscriptions or `useEffect` fetches will
   *     each fire twice. If an item needs to be counted or measured, do it in
   *     the parent, not inside the item.
   *
   *  The page owns loading/empty/error states and its own item markup
   *  (rules.md §4 — Marquee takes no data, it only lays out what it is given). */
  children: ReactNode;
  /** Required. A moving band with no accessible name is an unlabelled region to
   *  screen readers, so this is deliberately not optional. */
  ariaLabel: string;
  /** Seconds for one full traversal. Clamped to 10..120; non-finite falls back
   *  to the default. */
  durationSeconds?: number;
  direction?: "left" | "right";
  /** Renders the WCAG 2.2.2 pause/resume control (design.md §2.5, §4). */
  pauseControl?: boolean;
}

const DEFAULT_DURATION_SECONDS = 40;
const MIN_DURATION_SECONDS = 10;
const MAX_DURATION_SECONDS = 120;

function clampDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_DURATION_SECONDS;
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, seconds));
}

/**
 * Marquee — a continuous scrolling band for logo/category rows (design.md
 * §3.4/§3.5). Deliberately NOT a Carousel: Carousel is a discrete, paged,
 * user-driven component for the Hero Banner and Review Showcase (design.md
 * §3.7/§3.8, rules.md §4) and must keep owning those two. A band has no
 * positions, no prev/next and no lightbox — it just repeats a row.
 *
 * Motion is a CSS transform animation only (no JS loop, no per-frame layout
 * reads), so the pause state is expressed as a data attribute and consumed by
 * styles/marquee.css via `animation-play-state`. React state is the source of
 * truth so hover/focus pausing is assertable in jsdom.
 *
 * LOOP GEOMETRY: the track translates by -50%, which only equals one loop
 * period if the track carries no gap and each copy's trailing padding closes
 * the period exactly. See styles/marquee.css for the arithmetic — do not add a
 * gap to the track or change the copies' spacing without re-deriving it.
 *
 * CALLER CONTRACT: children are rendered twice. Item markup must not contain
 * `id` attributes (duplicate ids are invalid) and must not run side effects on
 * mount (they would fire twice). See MarqueeProps.children.
 */
export function Marquee({
  children,
  ariaLabel,
  durationSeconds = DEFAULT_DURATION_SECONDS,
  direction = "left",
  pauseControl = true,
}: MarqueeProps) {
  const prefersReducedMotion = useReducedMotion();
  const regionRef = useRef<HTMLDivElement>(null);
  const pauseButtonRef = useRef<HTMLButtonElement>(null);

  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [pausedByUser, setPausedByUser] = useState(false);

  const itemCount = Children.count(children);
  if (itemCount === 0) return null;

  const reduced = prefersReducedMotion;

  // Under reduced motion nothing moves, so "paused" is meaningless: every
  // pause affordance is dropped along with the animation.
  const isPaused = !reduced && (pointerInside || focusInside || pausedByUser);

  // Focus moving between two items inside the band fires blur with a
  // relatedTarget that is still contained by the region. Checking containment
  // (rather than toggling on every blur) is what stops the band flickering
  // back to "running" for a frame in the middle of a keyboard traversal.
  const focusStayedInside = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    return next instanceof Node && regionRef.current?.contains(next) === true;
  };

  // The comparison target is the pause button, a descendant of the div the
  // handler is declared on, so TypeScript narrows event.target to HTMLDivElement
  // and rejects the comparison. Widening back to EventTarget is the honest type
  // here — a descendant target really can be the button.
  const focusIsPauseButton = (event: FocusEvent<HTMLDivElement>) =>
    (event.target as EventTarget | null) === pauseButtonRef.current;

  return (
    <div
      ref={regionRef}
      role="region"
      aria-label={ariaLabel}
      data-paused={reduced ? undefined : isPaused}
      data-direction={direction}
      data-reduced-motion={reduced ? "true" : undefined}
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => setPointerInside(false)}
      onFocus={(event) => {
        // The pause button is a control, not band content. Focus resting on it
        // must not count as "focus is inside the band", otherwise pressing
        // Resume re-pauses on the spot: the click moves focus to the button,
        // focusInside flips back to true, and the band can never restart while
        // the button holds focus.
        if (focusIsPauseButton(event)) {
          setFocusInside(false);
          return;
        }
        if (!focusStayedInside(event)) setFocusInside(true);
      }}
      onBlur={(event) => {
        // Moving focus onto the button clears the content-focus flag; the
        // button's own blur then has nothing left to clear.
        if (focusIsPauseButton(event)) {
          setFocusInside(false);
          return;
        }
        if (!focusStayedInside(event)) setFocusInside(false);
      }}
      className={clsx(
        "group/marquee relative w-full",
        reduced
          ? // Static strip: no transform, no duplicate, user-scrollable. The
            // focusable region is the keyboard affordance — design.md §4
            // ("every interactive element reachable via Tab alone").
            "overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)] focus-visible:ring-offset-2"
          : "overflow-hidden"
      )}
      {...(reduced ? { tabIndex: 0 } : {})}
    >
      {reduced ? (
        <div className="flex w-max items-center gap-[var(--space-6)]">
          {children}
        </div>
      ) : (
        <div
          data-marquee-track
          // No gap on the track, and min-w-[200%] so a short list still yields a
          // track at least twice the container width. All spacing lives inside
          // the copies so -50% equals exactly one loop period (marquee.css).
          className="flex w-max min-w-[200%] items-center motion-reduce:animate-none"
          style={{
            animationDuration: `${clampDuration(durationSeconds)}s`,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
          }}
        >
          {/* Copy A — the real, focusable content. */}
          <div data-marquee-copy="primary" className={COPY_CLASSES}>
            {children}
          </div>
          {/* Copy B — decoration only. aria-hidden keeps it out of the
              accessibility tree; inert additionally removes it from the tab
              order and the a11y tree in supporting browsers, so a link in the
              duplicate is neither focusable nor announced. Belt and braces
              because aria-hidden alone does not stop keyboard focus. */}
          <div
            inert
            data-marquee-copy="decorative"
            aria-hidden="true"
            className={COPY_CLASSES}
          >
            {children}
          </div>
        </div>
      )}

      {!reduced && pauseControl && (
        <button
          ref={pauseButtonRef}
          type="button"
          onClick={() => setPausedByUser((value) => !value)}
          aria-pressed={pausedByUser}
          aria-label={pausedByUser ? "Resume scrolling" : "Pause scrolling"}
          className={clsx(
            // 44x44 touch target (design.md §3.1).
            "absolute right-[var(--space-3)] top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full",
            "border border-[var(--color-border-default)] bg-[var(--color-surface-base)] text-[var(--color-text-primary)] shadow-[var(--shadow-1)]",
            "transition-colors duration-[var(--motion-duration-fast)] ease-[var(--motion-easing-standard)]",
            "hover:bg-[var(--color-surface-muted)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)] focus-visible:ring-offset-2",
            "motion-reduce:transition-none"
          )}
        >
          {pausedByUser ? (
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}