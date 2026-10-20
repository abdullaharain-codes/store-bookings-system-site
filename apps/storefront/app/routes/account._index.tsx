/**
 * Placeholder account index (overview) — inside the account layout's
 * <main id="main-content">. Subpages (orders, addresses, bookings, profile)
 * arrive with the auth task.
 */
export function meta() {
  return [{ title: "Account — TechFix" }];
}

export default function AccountIndex() {
  return (
    <>
      <h1>Account</h1>
      <p>
        Account overview placeholder — orders, addresses, bookings and profile
        subpages arrive with the auth-gating task.
      </p>
    </>
  );
}