import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { SessionBootstrap } from "./components/SessionBootstrap";
import "./index.css";

const queryClient = new QueryClient();

/**
 * Root layout (React Router Framework Mode SPA shell). Per design.md §7
 * accessibility: a consistent <html lang="en"> and a skip-to-content link as
 * the first focusable element. Tokens from @ecommerce/ui arrive via the
 * index.css import. Meta/Links render the route meta functions; Scripts +
 * ScrollRestoration are required by Framework Mode.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <Meta />
        <Links />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-sm)] focus:bg-[var(--color-surface-muted)] focus:px-4 focus:py-2 focus:text-[var(--color-text-primary)]"
        >
          Skip to main content
        </a>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Renders null; starts the one session lookup so RequireAuth can tell
          "unknown" apart from "guest" instead of redirecting a signed-in user. */}
      <SessionBootstrap />
      <Outlet />
    </QueryClientProvider>
  );
}