import { useState } from "react";
import { Controller } from "react-hook-form";

import type { Client } from "../../../domain/clients/client.ts";
import { currencies } from "../../../domain/money/currency.ts";
import {
  createInvoiceDraft,
  invoiceDraftInputsAreEqual,
  type InvoiceDraftInput,
} from "../../../domain/invoices/invoice-draft.ts";
import { FormField, FormFieldError } from "../../ui/form-controls.tsx";
import { ClientReselectionDialog } from "./client-reselection-dialog.tsx";
import type { InvoiceDraftFieldGroupProps } from "./invoice-draft-field-group.ts";

type InvoiceClientFieldsProps = InvoiceDraftFieldGroupProps &
  Readonly<{
    clients: readonly Client[];
    draft: InvoiceDraftInput;
  }>;

export function InvoiceClientFields({
  clients,
  draft,
  draftForm,
  errorFor,
  onFieldBlur,
}: InvoiceClientFieldsProps) {
  const [pendingClient, setPendingClient] = useState<Client | null>(null);

  function requestClientSelection(client: Client): void {
    const selectedClient = clients.find(({ id }) => id === draft.clientId);
    if (selectedClient && !invoiceDraftInputsAreEqual(createInvoiceDraft(selectedClient), draft)) {
      setPendingClient(client);
      return;
    }
    draftForm.selectClient(client);
  }

  return (
    <div className="draft-fields">
      <div className="settings-field settings-field--wide">
        <label className="field-label" htmlFor="draft-clientId">
          Client
        </label>
        <Controller
          control={draftForm.control}
          name="clientId"
          render={({ field }) => (
            <select
              {...field}
              id="draft-clientId"
              onBlur={() => {
                field.onBlur();
                onFieldBlur("clientId");
              }}
              onChange={(event) => {
                const client = clients.find(({ id }) => id === event.currentTarget.value);
                if (client && client.id !== field.value) requestClientSelection(client);
              }}
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.legalName}
                </option>
              ))}
            </select>
          )}
        />
        <FormFieldError error={errorFor("clientId")} id="draft-clientId-error" />
      </div>
      <FormField
        error={errorFor("clientLegalName")}
        idPrefix="draft"
        label="Client legal name"
        registration={draftForm.register("clientLegalName", {
          onBlur: () => onFieldBlur("clientLegalName"),
        })}
        wide
      />
      <FormField
        error={errorFor("clientPostalAddress")}
        idPrefix="draft"
        label="Client postal address"
        multiline
        registration={draftForm.register("clientPostalAddress", {
          onBlur: () => onFieldBlur("clientPostalAddress"),
        })}
      />
      <div className="settings-field">
        <label className="field-label" htmlFor="draft-currencyCode">
          Currency
        </label>
        <Controller
          control={draftForm.control}
          name="currencyCode"
          render={({ field }) => (
            <select
              {...field}
              id="draft-currencyCode"
              onBlur={() => {
                field.onBlur();
                onFieldBlur("currencyCode");
              }}
              onChange={(event) => {
                const currencyCode = event.currentTarget.value;
                if (currencyCode !== field.value) draftForm.changeCurrency(currencyCode);
              }}
            >
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} · {currency.name}
                </option>
              ))}
            </select>
          )}
        />
        <FormFieldError error={errorFor("currencyCode")} id="draft-currencyCode-error" />
      </div>
      <FormField
        error={errorFor("paymentTerms")}
        idPrefix="draft"
        label="Payment terms"
        registration={draftForm.register("paymentTerms", {
          onBlur: () => onFieldBlur("paymentTerms"),
        })}
      />
      {pendingClient ? (
        <ClientReselectionDialog
          client={pendingClient}
          onCancel={() => setPendingClient(null)}
          onConfirm={() => {
            draftForm.selectClient(pendingClient);
            setPendingClient(null);
          }}
        />
      ) : null}
    </div>
  );
}
