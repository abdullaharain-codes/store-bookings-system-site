import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { clsx } from "clsx";

interface CarouselSlide {
  id: string | number;
  content: ReactNode;
  href?: string;
  alt?: string;
}

interface CarouselProps {
  slides: CarouselSlide[];
  autoPlayInterval?: number;
  onSlideClick?: (slide: CarouselSlide) => void;
  className?: string;
  "aria-label"?: string;
}

export function Carousel({
  slides,
  autoPlayInterval = 6000,
  onSlideClick,
  className,
  "aria-label": ariaLabel,
}: CarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const total = slides.length;

  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex((index + total) % total);
    },
    [total]
  );

  const next = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);
  const prev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);

  // Reduced motion
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Auto-slide (respects prefers-reduced-motion per design.md §2.5)
  useEffect(() => {
    if (isPaused || isDragging || total <= 1 || prefersReducedMotion) return;
    const timer = setInterval(next, autoPlayInterval);
    return () => clearInterval(timer);
  }, [isPaused, isDragging, next, autoPlayInterval, total, prefersReducedMotion]);

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

  return (
    <div
      ref={containerRef}
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
      {/* Slides */}
      <div className="flex transition-transform duration-[var(--motion-duration-base)] ease-[var(--motion-easing-standard)]"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {slides.map((slide) => (
          <div
            key={slide.id}
            className="min-w-full shrink-0"
            role="group"
            aria-roledescription="slide"
            aria-label={`Slide ${slides.indexOf(slide) + 1} of ${total}`}
          >
            <button
              type="button"
              className="w-full cursor-pointer"
              onClick={() => onSlideClick?.(slide)}
            >
              {slide.content}
            </button>
          </div>
        ))}
      </div>

      {/* Prev/Next controls */}
      {total > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-[var(--color-surface-base)]/80 p-2 shadow-[var(--shadow-1)] hover:bg-[var(--color-surface-base)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]"
            aria-label="Previous slide"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-[var(--color-surface-base)]/80 p-2 shadow-[var(--shadow-1)] hover:bg-[var(--color-surface-base)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]"
            aria-label="Next slide"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Dots */}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2" role="tablist">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                role="tab"
                aria-selected={i === currentIndex}
                aria-label={`Go to slide ${i + 1}`}
                className={clsx(
                  "h-2 w-2 rounded-full transition-colors",
                  i === currentIndex
                    ? "bg-[var(--color-brand-accent)]"
                    : "bg-[var(--color-surface-base)]/50 hover:bg-[var(--color-surface-base)]/80"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
