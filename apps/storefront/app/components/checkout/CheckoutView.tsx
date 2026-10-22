import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import {
  createAddress,
  getAddresses,
  getCart,
  getShippingFee,
  placeOrder,
  useAuthStore,
  type Address,
  type CreateAddressData,
} from "@ecommerce/api-client";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  buttonStyles,
  formatPrice,
} from "@ecommerce/ui";
import { siteConfig } from "../../config/site";
import { queryKeys } from "../../hooks/query-keys";
import { getApiFieldErrors, userMessageFor } from "../../lib/api-error";
import { multiplyMoney, sumMoney } from "../../lib/money";
import { useAnnounce } from "../common/Announcer";
import { PageContainer } from "../common/PageContainer";
import { PageHeading } from "../common/PageHeading";
import {
  CHECKOUT_ADD_ADDRESS_LABEL,
  CHECKOUT_ADDRESS_ERROR_FALLBACK,
  CHECKOUT_ADDRESS_LEGEND,
  CHECKOUT_COD_LABEL,
  CHECKOUT_COD_NOTE,
  CHECKOUT_EMPTY_DESCRIPTION,
  CHECKOUT_EMPTY_LINK,
  CHECKOUT_EMPTY_TITLE,
  CHECKOUT_ERROR_MESSAGE,
  CHECKOUT_ERROR_TITLE,
  CHECKOUT_HOLD_EXPIRED_BODY,
  CHECKOUT_HOLD_EXPIRED_LINK,
  CHECKOUT_HOLD_EXPIRED_TITLE,
  CHECKOUT_LOADING_LABEL,
  CHECKOUT_PAYMENT_LABEL,
  CHECKOUT_PLACED_ANNOUNCEMENT,
  CHECKOUT_PLACE_ERROR_FALLBACK,
  CHECKOUT_PLACE_ORDER_LABEL,
  CHECKOUT_RETRY_LABEL,
  CHECKOUT_SHIPPING_LABEL,
  CHECKOUT_SHIPPING_UNKNOWN,
  CHECKOUT_SUBTOTAL_LABEL,
  CHECKOUT_SUMMARY_LABEL,
  CHECKOUT_TITLE,
  CHECKOUT_TOTAL_EXCLUDES_SHIPPING,
  CHECKOUT_TOTAL_LABEL,
  CHECKOUT_TOTAL_NOTE,
  checkoutOrderPath,
} from "./checkout-copy";
import { AddressForm } from "./AddressForm";
import type { AddressFormValues } from "./address-form-validation";

/**
 * /checkout (TASK B4-2a). Loader-free like the rest of the storefront:
 *   - the cart is read through `queryKeys.cart` — the SAME cache entry the
 *     header badge and /cart use, so no duplicate request;
 *   - saved addresses come from `queryKeys.addresses`;
 *   - the flat shipping fee comes from `queryKeys.shippingFee` with
 *     staleTime 0, read live from the PUBLIC endpoint. It is NEVER hard-coded:
 *     the fee shown here is exactly what OrderService will store.
 *
 * Placing an order is an EXPLICIT confirm — nothing is auto-submitted, and a
 * double-click sends ONE request (the mutation guard below). This page is
 * reached only behind the require-auth guard, and a guest bounced to /login
 * returns here with no order request (see the flow test).
 */
export function CheckoutView() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const announce = useAnnounce();
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [formValues, setFormValues] = useState<AddressFormValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [placeError, setPlaceError] = useState<string | null>(null);

  const cartQuery = useQuery({
    queryKey: queryKeys.cart,
    queryFn: getCart,
    enabled: isSessionChecked && isAuthenticated,
  });

  const addressesQuery = useQuery({
    queryKey: queryKeys.addresses,
    queryFn: getAddresses,
    enabled: isSessionChecked && isAuthenticated,
  });

  const shippingQuery = useQuery({
    queryKey: queryKeys.shippingFee,
    queryFn: getShippingFee,
    // Read live: an admin fee change must show on the next checkout open.
    staleTime: 0,
  });

  const items = cartQuery.data?.cart.items ?? [];
  const addresses = addressesQuery.data?.addresses ?? [];

  // The default address is preselected; otherwise the first saved one. A
  // newly created address is selected explicitly (see the mutation below).
  // Derived directly (not memoised): `addresses` is a fresh array each render,
  // so a useMemo over it would recompute anyway and only trip exhaustive-deps.
  let effectiveSelectedId = selectedAddressId;
  if (effectiveSelectedId === null) {
    const preferred =
      addresses.find((address) => address.is_default) ?? addresses[0];
    effectiveSelectedId = preferred?.id ?? null;
  }

  const subtotal = sumMoney(
    items.map((item) =>
      item.product ? multiplyMoney(item.product.price, item.quantity) : "0.00"
    )
  );

  const shippingFee = shippingQuery.data?.shipping_fee ?? null;
  const total =
    shippingFee !== null ? sumMoney([subtotal, shippingFee]) : null;
  const shippingFailed = shippingQuery.isError;

  const expiredItems = items.filter((item) => item.hold_status === "expired");
  const emptyCart = !cartQuery.isPending && !cartQuery.isError && items.length === 0;

  // The address form opens automatically when there are none to choose from.
  const addressFormOpen = showAddressForm || (!addressesQuery.isPending && addresses.length === 0);

  const createAddressMutation = useMutation({
    mutationFn: (values: AddressFormValues) =>
      createAddress(toCreateAddressData(values)),
    onSuccess: (data) => {
      setFieldErrors({});
      setShowAddressForm(false);
      setFormValues(null);
      setSelectedAddressId(data.address.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.addresses });
    },
    onError: (error) => {
      const apiFieldErrors = getApiFieldErrors(error);
      if (Object.keys(apiFieldErrors).length > 0) {
        const flattened: Record<string, string> = {};
        for (const [field, messages] of Object.entries(apiFieldErrors)) {
          flattened[field] = messages[0];
        }
        setFieldErrors(flattened);
        return;
      }
      announce(userMessageFor(error, CHECKOUT_ADDRESS_ERROR_FALLBACK));
    },
  });

  // Synchronous in-flight guard for the place-order action. React Query's
  // `isPending` only flips on the next render, so two clicks dispatched in the
  // same tick would both pass an `isPending` check and fire TWO requests. A ref
  // is set before `mutate()` and cleared in both callbacks, so the second click
  // is dropped regardless of render timing.
  const placingRef = useRef(false);

  const placeOrderMutation = useMutation({
    mutationFn: (addressId: number) => placeOrder(addressId),
    onSuccess: (data) => {
      placingRef.current = false;
      setPlaceError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      announce(CHECKOUT_PLACED_ANNOUNCEMENT);
      navigate(checkoutOrderPath(data.order.id), { replace: true });
    },
    onError: (error) => {
      placingRef.current = false;
      const message = userMessageFor(error, CHECKOUT_PLACE_ERROR_FALLBACK);
      setPlaceError(message);
      announce(message);
      // The cart may be stale (a hold can expire server-side), so refetch.
      queryClient.invalidateQueries({ queryKey: queryKeys.cart });
    },
  });

  const placeBlocked =
    effectiveSelectedId === null ||
    placeOrderMutation.isPending ||
    emptyCart ||
    expiredItems.length > 0;

  return (
    <>
      <title>{`${CHECKOUT_TITLE} | ${siteConfig.name}`}</title>
      <PageContainer>
        <PageHeading>{CHECKOUT_TITLE}</PageHeading>

        {cartQuery.isPending ? (
          <LoadingSkeleton label={CHECKOUT_LOADING_LABEL} />
        ) : cartQuery.isError ? (
          <ErrorState
            title={CHECKOUT_ERROR_TITLE}
            message={CHECKOUT_ERROR_MESSAGE}
            retryLabel={CHECKOUT_RETRY_LABEL}
            onRetry={() => cartQuery.refetch()}
          />
        ) : emptyCart ? (
          <div className="flex flex-col items-center gap-[var(--space-3)]">
            <EmptyState
              title={CHECKOUT_EMPTY_TITLE}
              description={CHECKOUT_EMPTY_DESCRIPTION}
            />
            <Link to="/shop" className={buttonStyles({ variant: "primary" })}>
              {CHECKOUT_EMPTY_LINK}
            </Link>
          </div>
        ) : (
          <div className="grid gap-[var(--space-6)] lg:grid-cols-[1.6fr_1fr]">
            <div className="flex flex-col gap-[var(--space-6)]">
              <AddressSection
                addresses={addresses}
                isLoading={addressesQuery.isPending}
                hasError={addressesQuery.isError}
                onRetry={() => addressesQuery.refetch()}
                selectedId={effectiveSelectedId}
                onSelect={setSelectedAddressId}
                formOpen={addressFormOpen}
                onOpenForm={() => {
                  setShowAddressForm(true);
                  setFormValues(null);
                  setFieldErrors({});
                }}
                onCancelForm={() => {
                  setShowAddressForm(false);
                  setFormValues(null);
                  setFieldErrors({});
                }}
                values={formValues}
                onChangeValues={setFormValues}
                fieldErrors={fieldErrors}
                onClientErrors={setFieldErrors}
                onSubmit={(values) => createAddressMutation.mutate(values)}
                submitting={createAddressMutation.isPending}
              />

              <section
                aria-label={CHECKOUT_PAYMENT_LABEL}
                className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-[var(--space-4)]"
              >
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {CHECKOUT_PAYMENT_LABEL}
                </h2>
                <p className="text-sm text-[var(--color-text-primary)]">
                  {CHECKOUT_COD_LABEL}
                </p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {CHECKOUT_COD_NOTE}
                </p>
              </section>
            </div>

            <section
              aria-label={CHECKOUT_SUMMARY_LABEL}
              className="flex h-fit flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-[var(--space-4)]"
            >
              <ul className="flex flex-col gap-[var(--space-2)]">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-[var(--space-3)] text-sm"
                  >
                    <span className="text-[var(--color-text-primary)]">
                      {item.product?.name ?? "Product"}
                      <span className="text-[var(--color-text-secondary)]">
                        {` × ${item.quantity}`}
                      </span>
                    </span>
                    <span className="text-[var(--color-text-primary)]">
                      {item.product
                        ? formatPrice(
                            multiplyMoney(item.product.price, item.quantity)
                          )
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between border-t border-[var(--color-border-default)] pt-[var(--space-3)] text-sm">
                <span className="text-[var(--color-text-secondary)]">
                  {CHECKOUT_SUBTOTAL_LABEL}
                </span>
                <span
                  data-testid="checkout-subtotal"
                  className="font-semibold text-[var(--color-text-primary)]"
                >
                  {formatPrice(subtotal)}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">
                  {CHECKOUT_SHIPPING_LABEL}
                </span>
                {shippingFailed ? (
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {CHECKOUT_SHIPPING_UNKNOWN}
                  </span>
                ) : (
                  <span
                    data-testid="checkout-shipping"
                    className="text-[var(--color-text-primary)]"
                  >
                    {shippingFee !== null ? formatPrice(shippingFee) : ""}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-[var(--color-border-default)] pt-[var(--space-3)]">
                <span className="text-sm text-[var(--color-text-secondary)]">
                  {CHECKOUT_TOTAL_LABEL}
                </span>
                <span
                  data-testid="checkout-total"
                  className="text-base font-semibold text-[var(--color-text-primary)]"
                >
                  {total !== null ? formatPrice(total) : formatPrice(subtotal)}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {shippingFailed
                  ? CHECKOUT_TOTAL_EXCLUDES_SHIPPING
                  : CHECKOUT_TOTAL_NOTE}
              </p>

              {expiredItems.length > 0 && (
                <div
                  role="alert"
                  className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-status-warning)] p-[var(--space-3)]"
                >
                  <p className="text-sm font-medium text-[var(--color-status-warning)]">
                    {CHECKOUT_HOLD_EXPIRED_TITLE}
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {CHECKOUT_HOLD_EXPIRED_BODY}
                  </p>
                  <ul className="list-disc ps-4 text-xs text-[var(--color-text-secondary)]">
                    {expiredItems.map((item) => (
                      <li key={item.id}>
                        {item.product?.name ?? "Product"}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/cart"
                    className={buttonStyles({ variant: "secondary", size: "sm" })}
                  >
                    {CHECKOUT_HOLD_EXPIRED_LINK}
                  </Link>
                </div>
              )}

              {placeError && (
                <p
                  role="alert"
                  className="text-sm text-[var(--color-status-error)]"
                >
                  {placeError}
                </p>
              )}

              <Button
                type="button"
                variant="primary"
                disabled={placeBlocked}
                onClick={() => {
                  if (placingRef.current) return;
                  if (effectiveSelectedId === null) return;
                  placingRef.current = true;
                  placeOrderMutation.mutate(effectiveSelectedId);
                }}
              >
                {CHECKOUT_PLACE_ORDER_LABEL}
              </Button>
            </section>
          </div>
        )}
      </PageContainer>
    </>
  );
}

/** Maps the form's values onto the server's create-address payload. */
function toCreateAddressData(values: AddressFormValues): CreateAddressData {
  const data: CreateAddressData = {
    recipient_name: values.recipient_name.trim(),
    phone: values.phone.trim(),
    address_line_1: values.address_line_1.trim(),
    city: values.city.trim(),
  };
  if (values.address_line_2.trim()) data.address_line_2 = values.address_line_2.trim();
  if (values.postal_code.trim()) data.postal_code = values.postal_code.trim();
  if (values.label.trim()) data.label = values.label.trim();
  return data;
}

interface AddressSectionProps {
  addresses: Address[];
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  formOpen: boolean;
  onOpenForm: () => void;
  onCancelForm: () => void;
  values: AddressFormValues | null;
  onChangeValues: (values: AddressFormValues) => void;
  fieldErrors: Record<string, string>;
  onClientErrors: (errors: Record<string, string>) => void;
  onSubmit: (values: AddressFormValues) => void;
  submitting: boolean;
}

function AddressSection({
  addresses,
  isLoading,
  hasError,
  onRetry,
  selectedId,
  onSelect,
  formOpen,
  onOpenForm,
  onCancelForm,
  values,
  onChangeValues,
  fieldErrors,
  onClientErrors,
  onSubmit,
  submitting,
}: AddressSectionProps) {
  return (
    <section className="flex flex-col gap-[var(--space-3)]">
      <fieldset className="flex flex-col gap-[var(--space-2)]">
        <legend className="text-sm font-semibold text-[var(--color-text-primary)]">
          {CHECKOUT_ADDRESS_LEGEND}
        </legend>

        {isLoading ? (
          <LoadingSkeleton label="Loading addresses" />
        ) : hasError ? (
          <p className="text-sm text-[var(--color-status-error)]">
            We couldn't load your addresses.{" "}
            <button
              type="button"
              onClick={onRetry}
              className="font-medium underline"
            >
              Try again
            </button>
          </p>
        ) : (
          addresses.map((address) => (
            <label
              key={address.id}
              className="flex cursor-pointer items-start gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border-default)] p-[var(--space-3)]"
            >
              <input
                type="radio"
                name="delivery-address"
                value={address.id}
                checked={selectedId === address.id}
                onChange={() => onSelect(address.id)}
                className="mt-1"
              />
              <span className="flex flex-col text-sm">
                <span className="font-medium text-[var(--color-text-primary)]">
                  {address.recipient_name}
                </span>
                <span className="text-[var(--color-text-secondary)]">
                  {address.address_line_1}
                  {address.address_line_2 ? `, ${address.address_line_2}` : ""}
                  {`, ${address.city}`}
                  {address.postal_code ? ` ${address.postal_code}` : ""}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {address.phone}
                </span>
              </span>
            </label>
          ))
        )}
      </fieldset>

      {formOpen ? (
        <AddressForm
          values={values}
          onChange={onChangeValues}
          fieldErrors={fieldErrors}
          onClientErrors={onClientErrors}
          onSubmit={onSubmit}
          onCancel={onCancelForm}
          submitting={submitting}
        />
      ) : (
        <Button type="button" variant="secondary" onClick={onOpenForm}>
          {CHECKOUT_ADD_ADDRESS_LABEL}
        </Button>
      )}
    </section>
  );
}
