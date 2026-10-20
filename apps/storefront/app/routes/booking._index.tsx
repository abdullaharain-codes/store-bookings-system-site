/**
 * Placeholder booking index (wizard start) — inside the booking layout's
 * <main id="main-content">. Step flow (service → slot → details → confirm)
 * arrives with the booking task.
 */
export function meta() {
  return [{ title: "Booking — TechFix" }];
}

export default function BookingIndex() {
  return (
    <>
      <h1>Booking</h1>
      <p>Booking wizard placeholder — step flow arrives with the booking task.</p>
    </>
  );
}