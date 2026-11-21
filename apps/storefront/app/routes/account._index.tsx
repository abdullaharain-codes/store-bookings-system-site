import { Link } from "react-router";
import { buttonStyles } from "@ecommerce/ui";

/**
 * Account hub (TASK B4-3a, updated B4-3b).
 *
 * Replaces the old placeholder with the small hub the account area needs now.
 * Links only to destinations that already work or are added in this task:
 * Orders, Wishlist, Profile, Saved addresses.
 */
export default function AccountIndex() {
  return (
    <>
      <title>My account — TechFix</title>
      <h1>My account</h1>
      <ul className="mt-[var(--space-4)] flex flex-col gap-[var(--space-3)]">
        <li>
          <Link
            to="/account/orders"
            className={buttonStyles({ variant: "secondary" })}
          >
            Orders
          </Link>
        </li>
        <li>
          <Link
            to="/wishlist"
            className={buttonStyles({ variant: "secondary" })}
          >
            Wishlist
          </Link>
        </li>
        <li>
          <Link
            to="/account/profile"
            className={buttonStyles({ variant: "secondary" })}
          >
            Profile
          </Link>
        </li>
        <li>
          <Link
            to="/account/addresses"
            className={buttonStyles({ variant: "secondary" })}
          >
            Saved addresses
          </Link>
        </li>
      </ul>
    </>
  );
}
