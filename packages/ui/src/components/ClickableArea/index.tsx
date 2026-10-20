import type { ReactNode } from "react";
import { clsx } from "clsx";

// ClickableArea turns a block of card content into one large click target.
// Nested-interactive contract: content that is itself interactive (a button,
// link, input, etc.) owns its own clicks — see INTERACTIVE_SELECTOR below. This
// is why card-level interactive siblings (e.g. ProductCard's wishlist/stock
// overlay chips) are positioned as siblings of the ClickableArea rather than
// nested inside it, and why a future nested CTA inside a carousel slide fires
// only its own handler, never the outer onActivate.

interface ClickableAreaProps {
  onActivate?: () => void;
  /**
   * Real destination for the main action. Optional and additive: with no href
   * the component behaves exactly as before (`href="#"`, or a plain div when
   * there is no handler at all).
   *
   * The two are complementary rather than alternatives. `packages/ui` cannot
   * depend on a router, so a bare `href` alone would turn every click into a full
   * document load inside the SPA. Passing BOTH keeps the destination in the DOM
   * for crawlers, middle-click and "open in new tab", while the click handler
   * below still calls preventDefault and hands the navigation to the router.
   */
  href?: string;
  children: ReactNode;
  className?: string;
}

// Interactive elements that own their own clicks. Matches ClickableArea's own
// anchor (`a`), so a click on the card's empty space resolves to the anchor
// itself (= event.currentTarget) and fires onActivate; a click on any nested
// interactive element resolves to that element and is left to its own handler.
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"]';

const FOCUS_RING_CLASSES =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)] focus-visible:ring-offset-2";

export function ClickableArea({ onActivate, href, children, className }: ClickableAreaProps) {
  // No handler and no destination: there is nothing to activate or follow, so
  // stay a plain container rather than emit a dead focusable link.
  if (!onActivate && !href) {
    return <div className={clsx("block", className)}>{children}</div>;
  }

  return (
    <a
      href={href ?? "#"}
      onClick={(event) => {
        // Modified clicks are the browser's, never ours. This is the entire
        // reason a real `href` is worth putting in the DOM: ctrl/cmd-click,
        // middle-click and shift-click must open the destination natively, and
        // swallowing them would make the link worse than the `href="#"`
        // placeholder it replaced.
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }

        const interactive = (event.target as Element).closest(INTERACTIVE_SELECTOR);
        if (interactive && interactive !== event.currentTarget) {
          // Click landed on a nested interactive element inside the content
          // (e.g. a future Hero Banner CTA or an Add to Cart button) — that
          // element's own handler owns this click; don't also fire the outer
          // onActivate.
          return;
        }

        // No handler means there is nothing to intercept: let the link follow
        // its href normally instead of killing navigation.
        if (!onActivate) {
          return;
        }

        event.preventDefault();
        onActivate();
      }}
      className={clsx(
        "block cursor-pointer rounded-[var(--radius-sm)]",
        FOCUS_RING_CLASSES,
        className
      )}
    >
      {children}
    </a>
  );
}