/**
 * The new-address form's values and validation (TASK B4-2a).
 *
 * Kept OUT of AddressForm.tsx: a component file that also exports plain
 * functions and constants breaks React Fast Refresh (the repo's oxlint
 * `react(only-export-components)` rule). AddressForm imports these; the tests
 * import the validator directly.
 *
 * The rules below are a direct mirror of the server's StoreAddressRequest —
 * recipient_name 255, phone 20, address_line_1 255, address_line_2 nullable
 * 255, city 100, postal_code nullable 20, label nullable 50. The server stays
 * authoritative; this only saves a round-trip on the obvious cases.
 */
import {
  CHECKOUT_FIELD_LABELS,
  CHECKOUT_FIELD_MAX,
  CHECKOUT_FIELD_REQUIRED,
  checkoutLengthError,
} from "./checkout-copy";

export interface AddressFormValues {
  recipient_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  postal_code: string;
  label: string;
}

/** An empty form's starting values. */
export const EMPTY_ADDRESS_FORM: AddressFormValues = {
  recipient_name: "",
  phone: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  postal_code: "",
  label: "",
};

/**
 * Client-side validation mirroring the server's rules exactly. Returns a map of
 * field -> first error message; an empty map means "submit it".
 */
export function validateAddressForm(
  values: AddressFormValues
): Record<string, string> {
  const errors: Record<string, string> = {};

  const required: Array<keyof AddressFormValues> = [
    "recipient_name",
    "phone",
    "address_line_1",
    "city",
  ];
  for (const field of required) {
    if (!values[field].trim()) {
      errors[field] =
        CHECKOUT_FIELD_REQUIRED[field as keyof typeof CHECKOUT_FIELD_REQUIRED];
    }
  }

  const optional: Array<keyof AddressFormValues> = [
    "address_line_2",
    "postal_code",
    "label",
  ];
  const allFields: Array<keyof AddressFormValues> = [...required, ...optional];
  for (const field of allFields) {
    const value = values[field];
    if (value.length > CHECKOUT_FIELD_MAX[field]) {
      errors[field] = checkoutLengthError(field, CHECKOUT_FIELD_LABELS[field]);
    }
  }

  return errors;
}
