import { Outlet } from "react-router";
import { AnnouncerProvider } from "../components/common/Announcer";
import { SiteFooter } from "../components/SiteFooter";
import { SiteAnnouncement, SiteHeader } from "../components/SiteHeader";

/**
 * Pathless layout that owns the page frame for every public and guarded
 * storefront route.
 *
 * The single `<main id="main-content">` here IS the skip-to-content target set
 * up in app/root.tsx; `tabIndex={-1}` makes it programmatically focusable so
 * activating that link actually moves focus, which it cannot do for a plain
 * non-interactive element.
 *
 * It deliberately applies no horizontal padding or max width: each route already
 * owns its container, and a wrapper constraint would double up at every level.
 * The flex column is only there to keep the footer at the bottom of a short
 * page — and it doubles as the tall scroll container that lets the header's
 * `position: sticky` actually travel.
 *
 * The promo strip is a sibling of the header rather than a child, so scrolling
 * carries it away while the header bar stays pinned.
 *
 * /login and /register are intentionally absent from this layout. The reference
 * prototypes render both as chromeless auth screens with no header, nav or
 * footer, so they keep their own <main>.
 */
export default function SiteLayout() {
  return (
    <AnnouncerProvider>
      <div className="flex min-h-screen flex-col">
        <SiteAnnouncement />
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="flex-1">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </AnnouncerProvider>
  );
}
