import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAddress,
  deleteAddress,
  getAddresses,
  setDefaultAddress,
  updateAddress,
  type Address,
  type CreateAddressData,
  type UpdateAddressData,
} from "@ecommerce/api-client";
import { Badge, Button, EmptyState, ErrorState, LoadingSkeleton, Modal } from "@ecommerce/ui";
import { siteConfig } from "../../config/site";
import { queryKeys } from "../../hooks/query-keys";
import { getApiErrorMessage, getApiFieldErrors, userMessageFor } from "../../lib/api-error";
import { handleExpiredSession } from "../../lib/handle-expired-session";
import { useAnnounce } from "../common/Announcer";
import { AddressForm } from "../checkout/AddressForm";
import {
  EMPTY_ADDRESS_FORM,
  type AddressFormValues,
} from "../checkout/address-form-validation";
import {
  ADDRESSES_ADD_LABEL,
  ADDRESSES_ADDED_ANNOUNCEMENT,
  ADDRESSES_DEFAULT_BADGE,
  ADDRESSES_DEFAULT_ERROR_FALLBACK,
  ADDRESSES_DEFAULT_UPDATED_ANNOUNCEMENT,
  ADDRESSES_DELETE_CANCEL_LABEL,
  ADDRESSES_DELETE_CONFIRM_LABEL,
  ADDRESSES_DELETE_DIALOG_BODY,
  ADDRESSES_DELETE_DIALOG_TITLE,
  ADDRESSES_DELETE_ERROR_FALLBACK,
  ADDRESSES_DELETE_LABEL,
  ADDRESSES_DELETED_ANNOUNCEMENT,
  ADDRESSES_EDIT_LABEL,
  ADDRESSES_EMPTY_DESCRIPTION,
  ADDRESSES_EMPTY_TITLE,
  ADDRESSES_ERROR_MESSAGE,
  ADDRESSES_ERROR_TITLE,
  ADDRESSES_LOADING_LABEL,
  ADDRESSES_RETRY_LABEL,
  ADDRESSES_SAVE_ERROR_FALLBACK,
  ADDRESSES_SET_DEFAULT_LABEL,
  ADDRESSES_TITLE,
  ADDRESSES_UPDATED_ANNOUNCEMENT,
} from "./addresses-copy";

function toCreateData(values: AddressFormValues): CreateAddressData {
  return {
    recipient_name: values.recipient_name,
    phone: values.phone,
    address_line_1: values.address_line_1,
    ...(values.address_line_2 ? { address_line_2: values.address_line_2 } : {}),
    city: values.city,
    ...(values.postal_code ? { postal_code: values.postal_code } : {}),
    ...(values.label ? { label: values.label } : {}),
  };
}

function toUpdateData(values: AddressFormValues): UpdateAddressData {
  return {
    recipient_name: values.recipient_name,
    phone: values.phone,
    address_line_1: values.address_line_1,
    ...(values.address_line_2 ? { address_line_2: values.address_line_2 } : {}),
    city: values.city,
    ...(values.postal_code ? { postal_code: values.postal_code } : {}),
    ...(values.label ? { label: values.label } : {}),
  };
}

function toFormValues(address: Address): AddressFormValues {
  return {
    recipient_name: address.recipient_name,
    phone: address.phone,
    address_line_1: address.address_line_1,
    address_line_2: address.address_line_2 ?? "",
    city: address.city,
    postal_code: address.postal_code ?? "",
    label: address.label ?? "",
  };
}

function flattenFieldErrors(error: unknown): Record<string, string> {
  const apiFieldErrors = getApiFieldErrors(error);
  const flattened: Record<string, string> = {};
  for (const [field, messages] of Object.entries(apiFieldErrors)) {
    if (messages[0]) flattened[field] = messages[0];
  }
  return flattened;
}

export default function AddressesView() {
  const queryClient = useQueryClient();
  const announce = useAnnounce();

  const [showAddForm, setShowAddForm] = useState(false);
  const [addValues, setAddValues] = useState<AddressFormValues | null>(null);
  const [addFieldErrors, setAddFieldErrors] = useState<Record<string, string>>({});

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<AddressFormValues | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});

  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const addSubmittingRef = useRef(false);
  const deleteSubmittingRef = useRef(false);

  const addressesQuery = useQuery({
    queryKey: queryKeys.addresses,
    queryFn: getAddresses,
  });

  const invalidateAddresses = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.addresses });

  const createMutation = useMutation({
    mutationFn: (values: AddressFormValues) => createAddress(toCreateData(values)),
    onSuccess: async () => {
      addSubmittingRef.current = false;
      setAddFieldErrors({});
      setAddValues(null);
      setShowAddForm(false);
      setActionError(null);
      announce(ADDRESSES_ADDED_ANNOUNCEMENT);
      await invalidateAddresses();
    },
    onError: (error) => {
      addSubmittingRef.current = false;
      const fieldErrors = flattenFieldErrors(error);
      if (Object.keys(fieldErrors).length > 0) {
        setAddFieldErrors(fieldErrors);
        return;
      }
      const message = userMessageFor(error, ADDRESSES_SAVE_ERROR_FALLBACK);
      setActionError(message);
      announce(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: AddressFormValues }) =>
      updateAddress(id, toUpdateData(values)),
    onSuccess: async () => {
      setEditFieldErrors({});
      setEditValues(null);
      setEditingId(null);
      setActionError(null);
      announce(ADDRESSES_UPDATED_ANNOUNCEMENT);
      await invalidateAddresses();
    },
    onError: (error) => {
      const fieldErrors = flattenFieldErrors(error);
      if (Object.keys(fieldErrors).length > 0) {
        setEditFieldErrors(fieldErrors);
        return;
      }
      const message = userMessageFor(error, ADDRESSES_SAVE_ERROR_FALLBACK);
      setActionError(message);
      announce(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAddress(id),
    onSuccess: async () => {
      deleteSubmittingRef.current = false;
      setDeleteTarget(null);
      setActionError(null);
      announce(ADDRESSES_DELETED_ANNOUNCEMENT);
      await invalidateAddresses();
    },
    onError: async (error) => {
      deleteSubmittingRef.current = false;
      setDeleteTarget(null);
      const serverMessage = getApiErrorMessage(error);
      const message = serverMessage || userMessageFor(error, ADDRESSES_DELETE_ERROR_FALLBACK);
      setActionError(message);
      announce(message);
      await invalidateAddresses();
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => setDefaultAddress(id),
    onSuccess: async () => {
      setActionError(null);
      announce(ADDRESSES_DEFAULT_UPDATED_ANNOUNCEMENT);
      await invalidateAddresses();
    },
    onError: (error) => {
      const message = userMessageFor(error, ADDRESSES_DEFAULT_ERROR_FALLBACK);
      setActionError(message);
      announce(message);
    },
  });

  if (addressesQuery.isLoading) {
    return (
      <>
        <title>{`${ADDRESSES_TITLE} | ${siteConfig.name}`}</title>
        <h1 className="sr-only">{ADDRESSES_TITLE}</h1>
        <LoadingSkeleton label={ADDRESSES_LOADING_LABEL} items={3} />
      </>
    );
  }

  if (addressesQuery.isError) {
    const status = (addressesQuery.error as { response?: { status?: number } } | null)?.response?.status;
    if (status === 401) {
      handleExpiredSession();
    }
    return (
      <>
        <title>{`${ADDRESSES_TITLE} | ${siteConfig.name}`}</title>
        <h1>{ADDRESSES_TITLE}</h1>
        <ErrorState
          title={ADDRESSES_ERROR_TITLE}
          message={ADDRESSES_ERROR_MESSAGE}
          retryLabel={ADDRESSES_RETRY_LABEL}
          onRetry={() => {
            void addressesQuery.refetch();
          }}
        />
      </>
    );
  }

  const addresses = addressesQuery.data?.addresses ?? [];

  function openAddForm() {
    setActionError(null);
    setAddFieldErrors({});
    setAddValues(EMPTY_ADDRESS_FORM);
    setShowAddForm(true);
  }

  function closeAddForm() {
    setShowAddForm(false);
    setAddValues(null);
    setAddFieldErrors({});
  }

  function submitAdd(values: AddressFormValues) {
    if (addSubmittingRef.current) return;
    addSubmittingRef.current = true;
    setActionError(null);
    createMutation.mutate(values);
  }

  function openEdit(address: Address) {
    setActionError(null);
    setEditingId(address.id);
    setEditValues(toFormValues(address));
    setEditFieldErrors({});
  }

  function closeEdit() {
    setEditingId(null);
    setEditValues(null);
    setEditFieldErrors({});
  }

  function submitEdit(values: AddressFormValues) {
    if (editingId === null) return;
    setActionError(null);
    updateMutation.mutate({ id: editingId, values });
  }

  function confirmDelete(address: Address) {
    setActionError(null);
    setDeleteTarget(address);
  }

  function performDelete() {
    if (!deleteTarget) return;
    if (deleteSubmittingRef.current) return;
    deleteSubmittingRef.current = true;
    deleteMutation.mutate(deleteTarget.id);
  }

  return (
    <>
      <title>{`${ADDRESSES_TITLE} | ${siteConfig.name}`}</title>
      <h1>{ADDRESSES_TITLE}</h1>

      {actionError ? (
        <p role="alert" className="mt-[var(--space-3)] text-sm text-[var(--color-status-error)]">
          {actionError}
        </p>
      ) : null}

      {addresses.length > 0 || showAddForm ? (
        <div className="mt-[var(--space-4)]">
          <Button type="button" variant="primary" onClick={openAddForm}>
            {ADDRESSES_ADD_LABEL}
          </Button>
        </div>
      ) : null}

      {showAddForm ? (
        <div className="mt-[var(--space-4)]">
          <AddressForm
            values={addValues}
            onChange={setAddValues}
            fieldErrors={addFieldErrors}
            onClientErrors={setAddFieldErrors}
            onSubmit={submitAdd}
            onCancel={closeAddForm}
            submitting={createMutation.isPending}
          />
        </div>
      ) : null}

      {addresses.length === 0 && !showAddForm ? (
        <div className="mt-[var(--space-4)]">
          <EmptyState
            title={ADDRESSES_EMPTY_TITLE}
            description={ADDRESSES_EMPTY_DESCRIPTION}
            actionLabel={ADDRESSES_ADD_LABEL}
            onAction={openAddForm}
          />
        </div>
      ) : null}

      {addresses.length > 0 ? (
        <ul className="mt-[var(--space-4)] flex flex-col gap-[var(--space-4)]">
          {addresses.map((address) => {
            const isEditing = editingId === address.id;
            return (
              <li
                key={address.id}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-[var(--space-4)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-[var(--space-3)]">
                  <div className="flex flex-col gap-[var(--space-1)]">
                    <div className="flex items-center gap-[var(--space-2)]">
                      {address.label ? <span className="font-medium">{address.label}</span> : null}
                      {address.is_default ? (
                        <Badge variant="default">{ADDRESSES_DEFAULT_BADGE}</Badge>
                      ) : null}
                    </div>
                    <p>{address.recipient_name}</p>
                    <p>{address.phone}</p>
                    <p>{address.address_line_1}</p>
                    {address.address_line_2 ? <p>{address.address_line_2}</p> : null}
                    <p>{address.city}</p>
                    {address.postal_code ? <p>{address.postal_code}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-[var(--space-2)]">
                    {!address.is_default ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setDefaultMutation.mutate(address.id)}
                        disabled={setDefaultMutation.isPending}
                      >
                        {ADDRESSES_SET_DEFAULT_LABEL}
                      </Button>
                    ) : null}
                    <Button type="button" variant="secondary" onClick={() => openEdit(address)}>
                      {ADDRESSES_EDIT_LABEL}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => confirmDelete(address)}>
                      {ADDRESSES_DELETE_LABEL}
                    </Button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-[var(--space-4)]">
                    <AddressForm
                      values={editValues}
                      onChange={setEditValues}
                      fieldErrors={editFieldErrors}
                      onClientErrors={setEditFieldErrors}
                      onSubmit={submitEdit}
                      onCancel={closeEdit}
                      submitting={updateMutation.isPending}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => {
          if (!deleteMutation.isPending) setDeleteTarget(null);
        }}
        aria-label={ADDRESSES_DELETE_DIALOG_TITLE}
      >
        <div className="flex flex-col gap-[var(--space-4)]">
          <h2 className="text-[length:var(--font-size-lg)] font-semibold text-[var(--color-text-primary)]">
            {ADDRESSES_DELETE_DIALOG_TITLE}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {ADDRESSES_DELETE_DIALOG_BODY}
          </p>
          <div className="flex gap-[var(--space-2)]">
            <Button
              type="button"
              variant="primary"
              className="!bg-[var(--color-status-error)] hover:!bg-[var(--color-status-error)]/90 focus-visible:!ring-[var(--color-status-error)]"
              onClick={performDelete}
              disabled={deleteMutation.isPending}
            >
              {ADDRESSES_DELETE_CONFIRM_LABEL}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              {ADDRESSES_DELETE_CANCEL_LABEL}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
