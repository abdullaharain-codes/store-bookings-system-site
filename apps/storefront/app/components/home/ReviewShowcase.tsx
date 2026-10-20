import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getReviewShowcase,
  type ReviewShowcaseItem,
} from "@ecommerce/api-client";
import { Carousel, ErrorState, LoadingSkeleton, Modal } from "@ecommerce/ui";
import { queryKeys } from "../../hooks/query-keys";

/**
 * Home "Customer Reviews" showcase (frontend-plan, TASK B2e-1; design.md §3.8):
 * admin-curated review SCREENSHOTS, one per client. The payload deliberately
 * carries no rating, author or quote (SRS §3.4 — the screenshot IS the
 * content), so this section must never invent any: no names, no avatars, no
 * "from N customers" numbers. The reference's fake stats ("1M+ Satisfied
 * Customers", "150+ Cities Covered") are PRD-forbidden and do not appear here.
 *
 * Rendering: the generic ui Carousel (aria-label "Customer reviews"), with the
 * items grouped into slides so the page shows up to THREE screenshots per view
 * on lg+, two from sm, one below (window.matchMedia; falls back to three when
 * matchMedia is unavailable). A single resulting slide disables the autoplay.
 * Lightbox is NOT Carousel's `enableLightbox` (that would re-render a whole
 * grouped slide in the modal): each screenshot is its own <button> that opens
 * the ui Modal directly with that one item's full-size image. The Modal brings
 * Esc / overlay / close-button / return-focus; none are reimplemented here.
 */
export function ReviewShowcase() {
  const [lightboxItem, setLightboxItem] = useState<ReviewShowcaseItem | null>(null);
  const perView = useSlidesPerView();

  const reviews = useQuery({
    queryKey: queryKeys.reviewShowcaseHome,
    // No page argument: the server applies its own default (page 1).
    queryFn: () => getReviewShowcase(),
  });

  if (reviews.isPending) {
    return (
      <div role="status" aria-label="Loading customer reviews">
        <div className="h-[var(--font-size-2xl)] w-72 max-w-full animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]" />
        <div className="mt-[var(--space-5)] grid grid-cols-1 gap-[var(--space-5)] sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <LoadingSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (reviews.isError) {
    return (
      <ErrorState
        title="Customer reviews unavailable"
        message="Customer reviews could not be loaded. Please try again."
        retryLabel="Try again"
        onRetry={() => reviews.refetch()}
      />
    );
  }

  const items = reviews.data?.review_showcase_items.data ?? [];
  if (items.length === 0) {
    return null;
  }

  const slides = partition(items, perView).map((group) => ({
    id: group.map((item) => item.id).join("-"),
    content: (
      <div className="grid grid-cols-1 gap-[var(--space-5)] sm:grid-cols-2 lg:grid-cols-3">
        {group.map((item) => (
          <ReviewCard
            key={item.id}
            item={item}
            onEnlarge={() => setLightboxItem(item)}
          />
        ))}
      </div>
    ),
  }));

  return (
    <>
      <section aria-labelledby="review-showcase-heading">
        <h2
          id="review-showcase-heading"
          className="font-[family-name:var(--font-family-display)] text-[length:var(--font-size-2xl)] font-semibold leading-tight text-[var(--color-text-primary)]"
        >
          What Our Customers Say
        </h2>
        <Carousel
          slides={slides}
          aria-label="Customer reviews"
          autoSlide={slides.length > 1}
        />
      </section>

      {/* Kept mounted with `isOpen` toggling rather than conditionally
          unmounted: Modal's own focus handling moves focus in on open and
          returns it to the triggering button on close. */}
      <Modal
        isOpen={lightboxItem !== null}
        onClose={() => setLightboxItem(null)}
        aria-label={
          lightboxItem
            ? `Customer review: ${altOf(lightboxItem)}`
            : "Customer review"
        }
      >
        {lightboxItem && (
          <div className="flex flex-col items-center gap-[var(--space-3)]">
            <img
              src={lightboxItem.asset.url}
              alt={altOf(lightboxItem)}
              width={lightboxItem.asset.width ?? undefined}
              height={lightboxItem.asset.height ?? undefined}
              loading="lazy"
              decoding="async"
              className="max-h-[80vh] w-auto max-w-full rounded-[var(--radius-md)] object-contain"
            />
            {lightboxItem.caption !== null && (
              <p className="text-sm text-[var(--color-text-secondary)]">
                {lightboxItem.caption}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function ReviewCard({
  item,
  onEnlarge,
}: {
  item: ReviewShowcaseItem;
  onEnlarge: () => void;
}) {
  const alt = altOf(item);
  return (
    <figure className="flex flex-col gap-[var(--space-3)]">
      <button
        type="button"
        aria-label={`Enlarge: ${alt}`}
        onClick={onEnlarge}
        className="block w-full rounded-[var(--radius-md)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)] focus-visible:ring-offset-2"
      >
        <img
          // The strip prefers the admin-provided thumbnail when present and
          // falls back to the full image otherwise; the lightbox always shows
          // the full path. `path` is the URL exactly as ProductCard/the hero
          // consume it — no URL is assembled by hand here.
          src={item.asset.thumbnail_url ?? item.asset.url}
          alt={alt}
          width={item.asset.width ?? undefined}
          height={item.asset.height ?? undefined}
          loading="lazy"
          decoding="async"
          className="aspect-[3/2] w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-muted)] object-cover"
        />
      </button>
      {item.caption !== null && (
        <figcaption className="text-sm text-[var(--color-text-secondary)]">
          {item.caption}
        </figcaption>
      )}
    </figure>
  );
}

/** Accessible name for a screenshot: the admin's alt text, else the caption,
 *  else a neutral generic (the alt/caption columns are both nullable). */
function altOf(item: ReviewShowcaseItem): string {
  return item.asset.alt_text ?? item.caption ?? "Customer review screenshot";
}

function partition<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

const SM_MIN = "(min-width: 640px)";
const LG_MIN = "(min-width: 1024px)";

/**
 * Screenshots per slide: three at lg+, two from sm, one below. MatchMedia is
 * window-only; when it is unavailable (or never fires) the default is three —
 * the desktop layout — which is also what the CSS grid (`sm:grid-cols-2
 * lg:grid-cols-3`) shows, so the groups and the grid always agree.
 */
function useSlidesPerView(): number {
  const [perView, setPerView] = useState(3);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const update = () => {
      if (window.matchMedia(LG_MIN).matches) {
        setPerView(3);
        return;
      }
      if (window.matchMedia(SM_MIN).matches) {
        setPerView(2);
        return;
      }
      setPerView(1);
    };
    update();
    const lg = window.matchMedia(LG_MIN);
    const sm = window.matchMedia(SM_MIN);
    lg.addEventListener("change", update);
    sm.addEventListener("change", update);
    return () => {
      lg.removeEventListener("change", update);
      sm.removeEventListener("change", update);
    };
  }, []);

  return perView;
}