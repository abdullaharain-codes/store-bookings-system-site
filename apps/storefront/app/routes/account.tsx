import { Outlet } from "react-router";

/**
 * Account area (protected per PRD A5.2) — layout shell.
 *
 * Auth: this route is mounted inside the require-auth pathless layout in
 * routes.ts, so the guard and its session check are handled there and not
 * repeated per route. Per-user surfaces stay pure CSR and are excluded from
 * prerender().
 *
 * No <main> here: the page frame, including the skip-to-content target, is
 * owned by routes/site-layout.tsx.
 */
export default function AccountLayout() {
  return <Outlet />;
}