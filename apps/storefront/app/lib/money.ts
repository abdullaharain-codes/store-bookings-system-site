/**
 * Integer money arithmetic for the cart's ESTIMATED line totals and subtotal
 * (TASK B4-1c).
 *
 * Every value is a 2-decimal money string ("450000.00"). These helpers convert
 * to integer minor units (cents), do the arithmetic there, and convert back, so
 * 0.1 + 0.2 can never become 0.30000000000000004. The server remains the
 * authority: the total it computes at checkout wins over anything shown here.
 */

/** A non-negative amount with at most two decimal places, e.g. "200" / "149.99". */
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

function toMinorUnits(value: string): number {
  if (typeof value !== "string" || !MONEY_PATTERN.test(value)) {
    throw new Error(`Invalid money value: ${JSON.stringify(value)}`);
  }
  const [units, fraction = ""] = value.split(".");
  const padded = (fraction + "00").slice(0, 2);
  return Number(units) * 100 + Number(padded);
}

function fromMinorUnits(minor: number): string {
  const units = Math.floor(minor / 100);
  const fraction = minor % 100;
  return `${units}.${String(fraction).padStart(2, "0")}`;
}

/** The exact cost of `quantity` units at `price`, as a money string. */
export function multiplyMoney(price: string, quantity: number): string {
  const minor = toMinorUnits(price);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error(`Invalid quantity: ${JSON.stringify(quantity)}`);
  }
  return fromMinorUnits(minor * quantity);
}

/** The exact sum of money strings, as a money string ("0.00" when empty). */
export function sumMoney(values: string[]): string {
  return fromMinorUnits(values.reduce((total, value) => total + toMinorUnits(value), 0));
}
