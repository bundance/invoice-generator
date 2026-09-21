import { useEffect, useRef, useState } from "react";
import { useFieldArray } from "react-hook-form";

import type { Client } from "../../../domain/clients/client.ts";
import { createInvoiceServiceLineInput } from "../../../domain/invoices/invoice-draft.ts";
import type { InvoiceDraftForm } from "./use-invoice-draft-form.ts";

type UseInvoiceDraftItemsOptions = Readonly<{
  draftForm: InvoiceDraftForm;
  selectedClient: Client | undefined;
}>;

export function useInvoiceDraftItems({ draftForm, selectedClient }: UseInvoiceDraftItemsOptions) {
  const { append, fields, insert, remove } = useFieldArray({
    control: draftForm.control,
    name: "serviceLines",
  });
  const [activeFieldId, setActiveFieldId] = useState<string | null>(fields[0]?.id ?? null);
  const pendingOpenIndex = useRef<number | null>(null);

  useEffect(() => {
    if (pendingOpenIndex.current !== null) {
      const pendingField = fields[pendingOpenIndex.current];
      if (pendingField) {
        setActiveFieldId(pendingField.id);
        pendingOpenIndex.current = null;
        return;
      }
    }
    if (!activeFieldId || !fields.some(({ id }) => id === activeFieldId)) {
      setActiveFieldId(fields[0]?.id ?? null);
    }
  }, [activeFieldId, fields]);

  function addItem(): void {
    if (!selectedClient) return;
    const draft = draftForm.getValues();
    pendingOpenIndex.current = fields.length;
    append(createInvoiceServiceLineInput(selectedClient, draft));
  }

  function duplicateItem(index: number): void {
    const line = draftForm.getValues().serviceLines[index];
    if (!line) return;
    pendingOpenIndex.current = index + 1;
    insert(index + 1, { ...line });
  }

  function deleteItem(index: number): void {
    if (fields.length === 1) return;
    const deletingActiveItem = fields[index]?.id === activeFieldId;
    const nextActiveField = fields[index + 1] ?? fields[index - 1] ?? fields[0];
    remove(index);
    if (deletingActiveItem) setActiveFieldId(nextActiveField?.id ?? null);
  }

  function fieldIdAt(index: number): string | null {
    return fields[index]?.id ?? null;
  }

  return {
    activeFieldId,
    addItem,
    deleteItem,
    duplicateItem,
    fieldIdAt,
    fields,
    openItem: setActiveFieldId,
  };
}

export type InvoiceDraftItems = ReturnType<typeof useInvoiceDraftItems>;
