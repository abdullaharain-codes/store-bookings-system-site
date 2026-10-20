import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Tracks the user's prefers-reduced-motion setting.
 *
 * SSR/hydration: the first render always reports `false`, on the server and on
 * the client. The real value is applied in an effect immediately afterwards.
 * That ordering is deliberate — matching the server's markup on the first
 * client render is what prevents a hydration mismatch, and reading matchMedia
 * during render would produce exactly that: the server would emit the animated
 * markup while a reduced-motion client rendered the static strip. The cost is
 * one extra commit for reduced-motion users, mitigated because the CSS
 * `prefers-reduced-motion` safety net in styles/marquee.css suppresses the
 * animation during that same window, so no motion is ever painted. Inverting
 * this (assume reduced on first paint, correct after) would ship a visible
 * flash of duplicated decorative content to every non-reduced-motion user,
 * which is far more noticeable than the reduced-motion case this protects.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => setReduced(query.matches);

    sync();

    // Safari < 14 only has the deprecated addListener/removeListener pair.
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", sync);
      return () => query.removeEventListener("change", sync);
    }

    if (typeof query.addListener === "function") {
      query.addListener(sync);
      return () => query.removeListener(sync);
    }
    return undefined;
  }, []);

  return reduced;
}