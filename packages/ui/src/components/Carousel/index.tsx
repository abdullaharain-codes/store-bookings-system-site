import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { clsx } from "clsx";
import { ClickableArea } from "../ClickableArea";
import { Modal } from "../Modal";

interface CarouselSlide {
  id: string | number;
  content: ReactNode;
  /**
   * Real destination for this slide. Honoured only on the ACTIVE slide, and only
   * when the carousel was given an `onSlideClick` — see the render below.
   */
  href?: string;
  alt?: string;
}

interface CarouselProps {
  slides: CarouselSlide[];
  autoPlayInterval?: number;
  /**
   * Whether the carousel advances on its own. Default true (every existing
   * call site keeps its behaviour). Set false for rows of readable content
   * that must not move under the reader — WCAG 2.2.2 — such as the Featured
   * Products grid. Manual controls are unaffected either way.
   */
  autoSlide?: boolean;
  /** When true, clicking a slide opens it in a lightbox modal (Review Showcase,
   *  design.md §3.8). When false, clicking a slide fires onSlideClick — the Hero
   *  Banner navigation path (design.md §3.7). */
  enableLightbox?: boolean;
  onSlideClick?: (slide: CarouselSlide) => void;
  className?: string;
  "aria-label"?: string;
}

export function Carousel({
  slides,
  autoPlayInterval = 6000,
  autoSlide = true,
  enableLightbox = false,
  onSlideClick,
  className,
  "aria-label": ariaLabel,
}: CarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const touchStartX = useRef(0);

  const total = slides.length;

  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex((index + total) % total);
    },
    [total]
  );

  const next = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);
  const prev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);

  // Auto-slide is disabled under prefers-reduced-motion (design.md §2.5/§3.7),
  // and paused on hover, on focus, during active touch/drag, and while the
  // lightbox is open — manual controls stay fully functional (design.md §4.143).
  // `autoSlide={false}` opts out of the timer entirely (WCAG 2.2.2).
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (
      !autoSlide ||
      isPaused ||
      isDragging ||
      lightboxIndex !== null ||
      total <= 1 ||
      prefersReducedMotion
    ) {
      return;
    }
    const timer = setInterval(next, autoPlayInterval);
    return () => clearInterval(timer);
  }, [
    autoSlide,
    isPaused,
    isDragging,
    lightboxIndex,
    next,
    autoPlayInterval,
    total,
    prefersReducedMotion,
  ]);

  if (total === 0) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? next() : prev();
    }
    setIsDragging(false);
  };

  const handleSlideClick = (slide: CarouselSlide, index: number) => {
    if (enableLightbox) {
      setLightboxIndex(index);
    } else {
      onSlideClick?.(slide);
    }
  };

  return (
    <div
      className={clsx("relative overflow-hidden", className)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
    >
      {/* Slides — the active slide is wrapped in ClickableArea so the whole slide
          is one click target; only the active slide is rendered as a focusable
          anchor so translated off-screen slides don't join the tab order.

          The wrapper anchor is only emitted when there IS an outer navigation
          path (`onSlideClick`, or lightbox mode). A carousel whose slides are
          already links (the Featured products carousel, ProductCards with `href`)
          must NOT be wrapped, or its slide content would be nested inside a
          second anchor — invalid HTML, and the inner link would win every click.
          `slide.href` rides along on the wrapper so the destination is in the
          DOM for crawlers while the click handler still routes it in-app. */}
      <div
        className="flex transition-transform duration-[var(--motion-duration-base)] ease-[var(--motion-easing-standard)]"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            className="min-w-full shrink-0"
            role="group"
            aria-roledescription="slide"
            aria-label={`Slide ${i + 1} of ${total}`}
          >
            {i === currentIndex && (onSlideClick || enableLightbox) ? (
              <ClickableArea
                onActivate={() => handleSlideClick(slide, i)}
                href={enableLightbox ? undefined : slide.href}
                className="w-full"
              >
                {slide.content}
              </ClickableArea>
            ) : (
              <div className="w-full">{slide.content}</div>
            )}
          </div>
        ))}
      </div>

      {/* Prev/Next controls — always visible, keyboard-operable (design.md §3.7) */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-[var(--color-surface-base)]/80 p-2 shadow-[var(--shadow-1)] hover:bg-[var(--color-surface-base)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]"
            aria-label="Previous slide"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-[var(--color-surface-base)]/80 p-2 shadow-[var(--shadow-1)] hover:bg-[var(--color-surface-base)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]"
            aria-label="Next slide"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Position dots — keyboard-operable; announce "Slide N of M" (design.md §3.7) */}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Slide ${i + 1} of ${total}`}
                aria-current={i === currentIndex ? "true" : undefined}
                className={clsx(
                  "h-2 w-2 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]",
                  i === currentIndex
                    ? "bg-[var(--color-brand-accent)]"
                    : "bg-[var(--color-surface-base)]/50 hover:bg-[var(--color-surface-base)]/80"
                )}
              />
            ))}
          </div>
        </>
      )}

      {/* Lightbox (enableLightbox mode, design.md §3.8) — Modal used as-is; Modal's
          own focus-trap hardening is a separate task. */}
      {lightboxIndex !== null && (
        <Modal isOpen onClose={() => setLightboxIndex(null)} aria-label="Enlarged image">
          {slides[lightboxIndex].content}
        </Modal>
      )}
    </div>
  );
}