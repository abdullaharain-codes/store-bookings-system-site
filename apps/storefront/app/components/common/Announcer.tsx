import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

type AnnounceFn = (message: string) => void;

/** null means "no provider" — useAnnounce() then returns a safe no-op. */
const AnnouncerContext = createContext<AnnounceFn | null>(null);

const NOOP: AnnounceFn = () => {};

/**
 * One polite live region for the whole site (TASK B4-1c).
 *
 * The region is ALWAYS mounted, even when it is empty: a screen reader only
 * announces content inserted into a live region that already exists, so
 * conditionally rendering it (only when a message is present) would swallow the
 * very first announcement. `announce()` clears the text and then sets the new
 * text on the next tick, so announcing the same string twice in a row still
 * fires a fresh update (an unchanged node is ignored).
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback<AnnounceFn>((next) => {
    setMessage("");
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setMessage(next);
    }, 0);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}

/** The site's announce() function, or a no-op when rendered outside the provider. */
export function useAnnounce(): AnnounceFn {
  return useContext(AnnouncerContext) ?? NOOP;
}
