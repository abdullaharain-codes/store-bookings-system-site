import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

/**
 * Storefront route tree — full planned structure wired as placeholders.
 *
 * The site shell (routes/site-layout.tsx) is a pathless layout wrapping every
 * route except /login and /register: the reference prototypes render those two
 * as chromeless auth screens with no header, nav or footer, which is the
 * documented exception to "wrap everything". They therefore keep their own
 * <main id="main-content"> and the shell owns exactly one for every other page.
 *
 * Public SEO routes (/…, /shop, /services) are prerendered per
 * react-router.config.ts; dynamic slug routes join prerender once real data
 * exists (frontend-plan.md). Auth-gated / per-user surfaces (/cart, /wishlist,
 * /account/*) sit behind the require-auth layout and stay pure CSR, so they are
 * never prerendered. /booking is per-user but intentionally not route-guarded
 * (see the note in booking.tsx).
 *
 * Dynamic detail routes (/product/:slug etc.) carry a clientLoader +
 * HydrateFallback per route (frontend-plan.md gotcha (c)) so post-deploy
 * deep-links and new slugs render cleanly through the SPA fallback shell.
 *
 * Wired structure:
 *
 *   (pathless)             routes/site-layout.tsx     site shell
 *     ├─ /                 routes/_index.tsx         home
 *     ├─ /shop             routes/shop.tsx           shop layout
 *     │   ├─ (index)        routes/shop._index.tsx    all products
 *     │   ├─ /shop/category/:slug routes/shop.category.$slug.tsx
 *     │   └─ /shop/brand/:slug  routes/shop.brand.$slug.tsx
 *     ├─ /product/:slug    routes/product.$slug.tsx
 *     ├─ /services         routes/services.tsx
 *     ├─ /service/:slug    routes/service.$slug.tsx
 *     ├─ /require-auth     routes/require-auth.tsx   pathless session guard
 *     │   ├─ /cart         routes/cart.tsx           guarded, CSR
 *     │   ├─ /checkout     routes/checkout.tsx       guarded, CSR placeholder
 *     │   ├─ /wishlist     routes/wishlist.tsx       guarded, CSR
 *     │   └─ /account      routes/account.tsx        guarded layout (CSR)
 *     │       └─ (index)    routes/account._index.tsx dashboard
 *     └─ /booking          routes/booking.tsx        wizard (CSR, NOT guarded)
 *         └─ (index)        routes/booking._index.tsx wizard start
 *   /login                  routes/login.tsx          chromeless
 *   /register               routes/register.tsx       chromeless
 *
 * Still to come in later tasks:
 *   - /account children: overview/orders/addresses/bookings/profile
 *   - /booking/:serviceId steps and the booking confirm-step auth gate
 *   - legal pages for the reference footer's link column
 */
export default [
  layout("routes/site-layout.tsx", [
    index("routes/_index.tsx"),
    route("shop", "routes/shop.tsx", [
      index("routes/shop._index.tsx"),
      route("category/:slug", "routes/shop.category.$slug.tsx"),
      route("brand/:slug", "routes/shop.brand.$slug.tsx"),
    ]),
    route("product/:slug", "routes/product.$slug.tsx"),
    route("services", "routes/services.tsx"),
    route("service/:slug", "routes/service.$slug.tsx"),
    layout("routes/require-auth.tsx", [
      route("cart", "routes/cart.tsx"),
      route("checkout", "routes/checkout.tsx"),
      route("wishlist", "routes/wishlist.tsx"),
      route("account", "routes/account.tsx", [
        index("routes/account._index.tsx"),
        route("orders/:id", "routes/account.orders.$id.tsx"),
      ]),
    ]),
    route("booking", "routes/booking.tsx", [
      index("routes/booking._index.tsx"),
    ]),
  ]),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
] satisfies RouteConfig;