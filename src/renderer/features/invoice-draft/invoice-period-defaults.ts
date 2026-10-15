import type { UseFormReturn } from "react-hook-form";

import type { InvoiceDraftInput } from "../../../domain/invoices/invoice-draft.ts";
import type { IssuedInvoice } from "../../../domain/invoices/issued-invoice.ts";
import {
  countInvoiceWorkdays,
  defaultInvoicePeriodEnd,
  nextInvoicePeriodStart,
} from "../../../domain/invoices/invoice-period-defaults.ts";

type InvoicePeriodDefaultsOptions = Pick<
  UseFormReturn<InvoiceDraftInput>,
  "getValues" | "setValue"
> &
  Readonly<{
    invoices: readonly IssuedInvoice[];
    onDraftChanged: (draft: InvoiceDraftInput) => void;
  }>;

export function createInvoicePeriodDefaults({
  getValues,
  invoices,
  onDraftChanged,
  setValue,
}: InvoicePeriodDefaultsOptions) {
  function updateBillableDays(index: number): void {
    const line = getValues().serviceLines[index];
    if (!line) return;
    const workdays = countInvoiceWorkdays(line.periodStart, line.periodEnd);
    if (workdays !== null) {
      setValue(`serviceLines.${index}.billableDays`, String(workdays), { shouldDirty: true });
    }
    onDraftChanged(getValues());
  }

  function updatePeriodEnd(index: number): void {
    const line = getValues().serviceLines[index];
    if (!line) return;
    const periodEnd = defaultInvoicePeriodEnd(line.periodStart);
    if (periodEnd) {
      setValue(`serviceLines.${index}.periodEnd`, periodEnd, { shouldDirty: true });
      updateBillableDays(index);
    }
  }

  function suggestPeriodStart(index: number): void {
    const draft = getValues();
    const line = draft.serviceLines[index];
    if (!line || line.periodStart) return;
    const lastPeriodEnd =
      index > 0
        ? draft.serviceLines[index - 1]?.periodEnd
        : latestClientPeriodEnd(invoices, draft.clientId);
    const periodStart = lastPeriodEnd ? nextInvoicePeriodStart(lastPeriodEnd) : null;
    if (periodStart) {
      setValue(`serviceLines.${index}.periodStart`, periodStart, { shouldDirty: true });
      updatePeriodEnd(index);
    }
  }

  return { suggestPeriodStart, updateBillableDays, updatePeriodEnd };
}

function latestClientPeriodEnd(
  invoices: readonly IssuedInvoice[],
  clientId: string,
): string | null {
  let latest: string | null = null;
  for (const invoice of invoices) {
    if (invoice.client.id !== clientId) continue;
    for (const line of invoice.serviceLines) {
      if (!latest || line.periodEnd > latest) latest = line.periodEnd;
    }
  }
  return latest;
}
