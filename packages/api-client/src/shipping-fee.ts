/**
 * Typed wrapper around the public shipping-fee read (BE5, D2).
 *
 * Response shape mirrors App\Http\Controllers\Api\V1\ShippingFeeController
 * exactly — verified against the controller rather than guessed:
 * - GET /shipping-fee -> { shipping_fee: "200.00" }   (exactly one field;
 *   the fee is the same flat value OrderService stores as order.shipping_fee,
 *   read through the same service, so checkout can show it before placing an
 *   order and the two can never disagree.)
 */
import apiClient from "./api-client";

// ─── Envelope type ──────────────────────────────────────────────────────────

export interface ShippingFeeResponse {
  /**
   * The platform-wide flat shipping fee as a 2-decimal money string (e.g.
   * "200.00") — the SAME format and value as `order.shipping_fee`, so the
   * checkout preview matches the order that follows.
   */
  shipping_fee: string;
}

// ─── Endpoint wrapper ───────────────────────────────────────────────────────

/**
 * The public flat shipping fee (D2). No auth; the response carries exactly one
 * field. Read live, so an admin changing the setting shows up on the next call.
 */
export async function getShippingFee(): Promise<ShippingFeeResponse> {
  const { data } = await apiClient.get<ShippingFeeResponse>("/shipping-fee");
  return data;
}
