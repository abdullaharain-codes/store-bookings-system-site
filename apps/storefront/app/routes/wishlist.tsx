/**
 * Placeholder wishlist route (CSR — per-user surface, excluded from prerender).
 * Wishlist wiring arrives in a later task.
 */
export function meta() {
  return [
    { title: "Wishlist — TechFix" },
    { name: "description", content: "Products you've saved for later." },
  ];
}

export default function Wishlist() {
  return <h1>Wishlist</h1>;
}