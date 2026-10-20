import { Outlet } from "react-router";

/**
 * Booking wizard (protected per PRD A5.4) — layout shell.
 *
 * Auth: the wizard is deliberately NOT behind the require-auth layout. Guests
 * can start a booking and only need a session at the confirm step, so gating
 * the route would block the browse-first flow. The confirm-step gate is decided
 * in B9; the multi-step flow itself is still a dedicated future task, so the
 * shell is public for now to keep the URL shape from 404ing. This route stays
 * pure CSR and is excluded from prerender().
 *
 * No <main> here: the page frame, including the skip-to-content target, is
 * owned by routes/site-layout.tsx.
 */
export default function BookingLayout() {
  return <Outlet />;
}