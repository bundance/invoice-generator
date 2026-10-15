import { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";

import type { Client } from "../../../domain/clients/client.ts";
import {
  changeInvoiceDraftCurrency,
  createInvoiceDraft,
  emptyInvoiceDraftInput,
  type InvoiceDraft,
  type InvoiceDraftInput,
  invoiceDraftInputsAreEqual,
  parseInvoiceDraftInput,
} from "../../../domain/invoices/invoice-draft.ts";
import type { IssuedInvoice } from "../../../domain/invoices/issued-invoice.ts";
import { useAutosave, type AutosavePolicy } from "../../hooks/use-autosave.ts";
import { createInvoicePeriodDefaults } from "./invoice-period-defaults.ts";

type UseInvoiceDraftFormOptions = Readonly<{
  clients: readonly Client[];
  initialDraft: InvoiceDraft | null;
  invoices: readonly IssuedInvoice[];
  onDraftChanged: (draft: InvoiceDraft | null) => void;
}>;

export function useInvoiceDraftForm({
  clients,
  initialDraft,
  invoices,
  onDraftChanged,
}: UseInvoiceDraftFormOptions) {
  const freshDraft = createFreshDraft(clients);
  const initialInput = initialDraft ?? freshDraft;
  const { control, getValues, register, reset, setValue, subscribe } = useForm<InvoiceDraftInput>({
    defaultValues: initialInput,
  });
  const autosavePolicy = useMemo(
    () => createInvoiceDraftAutosavePolicy(window.invoiceApp, onDraftChanged, getValues, reset),
    [getValues, onDraftChanged, reset],
  );
  const autosave = useAutosave({
    initialInput,
    initialSavedValue: initialDraft,
    initialStatus: initialDraft ? "saved" : "not-saved",
    policy: autosavePolicy,
  });
  const {
    cancel: cancelAutosave,
    markError: markAutosaveError,
    queue: queueAutosave,
    reset: resetAutosave,
    retry,
    saveNow,
    status: saveStatus,
  } = autosave;
  const periodDefaults = createInvoicePeriodDefaults({
    getValues,
    invoices,
    onDraftChanged: queueAutosave,
    setValue,
  });

  useEffect(
    () =>
      subscribe({
        formState: { isDirty: true, values: true },
        callback: ({ isDirty, name, type, values }) => {
          if (isUserFormChange(isDirty, name, type)) queueAutosave(values);
        },
      }),
    [queueAutosave, subscribe],
  );

  const selectClient = useCallback(
    (client: Client): void => {
      const nextDraft = createInvoiceDraft(client);
      reset(nextDraft);
      queueAutosave(nextDraft);
    },
    [queueAutosave, reset],
  );

  const initializeForFirstClient = useCallback(
    (client: Client): void => {
      if (!invoiceDraftInputsAreEqual(emptyInvoiceDraftInput, getValues())) return;
      const nextDraft = createInvoiceDraft(client);
      resetAutosave(nextDraft, null, "not-saved");
      reset(nextDraft);
    },
    [getValues, reset, resetAutosave],
  );

  const changeCurrency = useCallback(
    (currencyCode: string): void => {
      const nextDraft = changeInvoiceDraftCurrency(getValues(), currencyCode);
      reset(nextDraft);
      queueAutosave(nextDraft);
    },
    [getValues, queueAutosave, reset],
  );

  const discard = useCallback(async (): Promise<boolean> => {
    cancelAutosave();
    try {
      const result = await window.invoiceApp.discardInvoiceDraft();
      if (result.kind !== "discarded") {
        markAutosaveError();
        return false;
      }
    } catch {
      markAutosaveError();
      return false;
    }
    const nextDraft = createFreshDraft(clients);
    resetAutosave(nextDraft, null, "not-saved");
    reset(nextDraft);
    onDraftChanged(null);
    return true;
  }, [cancelAutosave, clients, markAutosaveError, onDraftChanged, reset, resetAutosave]);

  const issued = useCallback(
    (client: Client): void => {
      cancelAutosave();
      const nextDraft = createInvoiceDraft(client);
      resetAutosave(nextDraft, null, "not-saved");
      reset(nextDraft);
      onDraftChanged(null);
    },
    [cancelAutosave, onDraftChanged, reset, resetAutosave],
  );

  const openSavedDraft = useCallback(
    (draft: InvoiceDraft): void => {
      cancelAutosave();
      resetAutosave(draft, draft, "saved");
      reset(draft);
      onDraftChanged(draft);
    },
    [cancelAutosave, onDraftChanged, reset, resetAutosave],
  );

  const saveBeforeReview = useCallback(
    (draft: InvoiceDraftInput): Promise<boolean> =>
      saveNow(draft, { retryAfterInFlightFailure: true }),
    [saveNow],
  );

  function saveChanges(): void {
    queueAutosave(getValues());
  }

  return {
    ...periodDefaults,
    changeCurrency,
    control,
    discard,
    getValues,
    issued,
    initializeForFirstClient,
    openSavedDraft,
    saveBeforeReview,
    saveChanges,
    register,
    retry,
    saveStatus,
    setValue,
    selectClient,
  };
}

function createFreshDraft(clients: readonly Client[]): InvoiceDraftInput {
  return clients[0] ? createInvoiceDraft(clients[0]) : emptyInvoiceDraftInput;
}

function isUserFormChange(
  isDirty: boolean | undefined,
  fieldName: string | undefined,
  eventType: string | undefined,
): boolean {
  return Boolean(isDirty && fieldName && eventType === "change");
}

export type InvoiceDraftForm = ReturnType<typeof useInvoiceDraftForm>;

function createInvoiceDraftAutosavePolicy(
  invoiceApp: typeof window.invoiceApp,
  onDraftChanged: (draft: InvoiceDraft | null) => void,
  readDraft: () => InvoiceDraftInput,
  reset: (input: InvoiceDraftInput) => void,
): AutosavePolicy<InvoiceDraftInput, InvoiceDraft> {
  return {
    inputFromSavedValue: (draft) => draft,
    inputMatchesSavedValue: (input, savedDraft) => invoiceDraftInputsAreEqual(savedDraft, input),
    onInputCanonicalized: (input) => {
      if (!invoiceDraftInputsAreEqual(input, readDraft())) reset(input);
    },
    onSaved: onDraftChanged,
    prepareInput: (input) => ({ kind: "ready", input: parseInvoiceDraftInput(input) }),
    requestSave: async (input) => {
      try {
        const result = await invoiceApp.saveInvoiceDraft(input);
        return result.kind === "saved"
          ? { kind: "saved", value: result.draft }
          : { kind: "failed" };
      } catch {
        return { kind: "failed" };
      }
    },
  };
}
