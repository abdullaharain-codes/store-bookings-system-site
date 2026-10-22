import type { FormEvent } from "react";
import { Button, Input } from "@ecommerce/ui";
import {
  CHECKOUT_CANCEL_ADDRESS_LABEL,
  CHECKOUT_FIELD_LABELS,
  CHECKOUT_SAVE_ADDRESS_LABEL,
} from "./checkout-copy";
import {
  EMPTY_ADDRESS_FORM,
  validateAddressForm,
  type AddressFormValues,
} from "./address-form-validation";

/**
 * The inline "Add a new address" form (TASK B4-2a). Controlled by the parent
 * (CheckoutView) so a server 422 can attach messages to the matching fields
 * without losing what was typed. The field rules live in
 * address-form-validation.ts so this file exports only a component.
 */
interface AddressFormProps {
  values: AddressFormValues | null;
  onChange: (values: AddressFormValues) => void;
  fieldErrors: Record<string, string>;
  onClientErrors: (errors: Record<string, string>) => void;
  onSubmit: (values: AddressFormValues) => void;
  onCancel: () => void;
  submitting: boolean;
}

export function AddressForm({
  values,
  onChange,
  fieldErrors,
  onClientErrors,
  onSubmit,
  onCancel,
  submitting,
}: AddressFormProps) {
  const current = values ?? EMPTY_ADDRESS_FORM;

  function update(field: keyof AddressFormValues, value: string) {
    onChange({ ...current, [field]: value });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientErrors = validateAddressForm(current);
    onClientErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;
    onSubmit(current);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-[var(--space-4)]"
    >
      <div className="grid gap-[var(--space-3)] sm:grid-cols-2">
        <Input
          label={CHECKOUT_FIELD_LABELS.recipient_name}
          value={current.recipient_name}
          error={fieldErrors.recipient_name}
          onChange={(event) => update("recipient_name", event.target.value)}
        />
        <Input
          label={CHECKOUT_FIELD_LABELS.phone}
          value={current.phone}
          error={fieldErrors.phone}
          onChange={(event) => update("phone", event.target.value)}
        />
        <Input
          label={CHECKOUT_FIELD_LABELS.address_line_1}
          value={current.address_line_1}
          error={fieldErrors.address_line_1}
          onChange={(event) => update("address_line_1", event.target.value)}
        />
        <Input
          label={CHECKOUT_FIELD_LABELS.address_line_2}
          value={current.address_line_2}
          error={fieldErrors.address_line_2}
          onChange={(event) => update("address_line_2", event.target.value)}
        />
        <Input
          label={CHECKOUT_FIELD_LABELS.city}
          value={current.city}
          error={fieldErrors.city}
          onChange={(event) => update("city", event.target.value)}
        />
        <Input
          label={CHECKOUT_FIELD_LABELS.postal_code}
          value={current.postal_code}
          error={fieldErrors.postal_code}
          onChange={(event) => update("postal_code", event.target.value)}
        />
        <Input
          label={CHECKOUT_FIELD_LABELS.label}
          value={current.label}
          error={fieldErrors.label}
          onChange={(event) => update("label", event.target.value)}
        />
      </div>

      <div className="flex gap-[var(--space-2)]">
        <Button type="submit" variant="primary" disabled={submitting}>
          {CHECKOUT_SAVE_ADDRESS_LABEL}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {CHECKOUT_CANCEL_ADDRESS_LABEL}
        </Button>
      </div>
    </form>
  );
}
