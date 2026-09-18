import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import type { Client, ClientInput } from "../../../domain/clients/client.ts";
import {
  clientToInput,
  copyClientToNewInput,
  createNewClientInput,
  createClientFormSchema,
  emptyClientInput,
} from "../../../domain/clients/client.ts";
import { FormSaveStatus } from "../../ui/form-controls.tsx";
import { ClientIdentityFields } from "./client-identity-fields.tsx";
import { ClientInvoiceDefaultFields } from "./client-invoice-default-fields.tsx";
import { ClientSequenceFields } from "./client-sequence-fields.tsx";

type ClientEditorProps = Readonly<{
  clients: readonly Client[];
  mode: ClientEditorMode;
  onCancel: () => void;
  onCopy: (client: Client) => void;
  onSaved: (client: Client) => void;
  standardVatRate: string | null;
}>;

export type ClientEditorMode =
  | Readonly<{ kind: "create" }>
  | Readonly<{ kind: "copy"; sourceClient: Client }>
  | Readonly<{ kind: "edit"; client: Client }>
  | Readonly<{ kind: "locked-edit"; client: Client }>;

type SaveStatus = "editing" | "saving" | "saved" | "error";

const clientSaveStatusLabels: Readonly<Record<SaveStatus, string | null>> = {
  editing: null,
  saving: "Saving client",
  saved: "Client saved on this Mac",
  error: "Client not saved",
};
const editableClientDescription =
  "Defaults are copied into new invoice drafts. Selecting a client uses no number.";

export function ClientEditor({
  clients,
  mode,
  onCancel,
  onCopy,
  onSaved,
  standardVatRate,
}: ClientEditorProps) {
  const currentClient = mode.kind === "edit" || mode.kind === "locked-edit" ? mode.client : null;
  const identityLocked = mode.kind === "locked-edit";
  const clientFormSchema = useMemo(
    () => createClientFormSchema(clients, currentClient?.id ?? null),
    [clients, currentClient?.id],
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("editing");
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    getValues,
    register,
    reset,
    subscribe,
  } = useForm<ClientInput>({
    defaultValues: clientEditorInput(mode, standardVatRate),
    mode: "onTouched",
    reValidateMode: "onChange",
    resolver: zodResolver(clientFormSchema, undefined, { mode: "sync", raw: true }),
  });
  useEffect(
    () =>
      subscribe({
        formState: { isDirty: true },
        callback: ({ isDirty }) => {
          if (isDirty) {
            setSaveStatus((currentStatus) => (currentStatus === "error" ? "error" : "editing"));
          }
        },
      }),
    [subscribe],
  );

  async function save(input: ClientInput): Promise<void> {
    setSaveStatus("saving");
    try {
      const result = await saveClientInput(mode, input);
      if (result.kind !== "saved") {
        setSaveStatus("error");
        return;
      }

      const inputChangedDuringSave = !clientInputsAreEqual(getValues(), input);
      if (!inputChangedDuringSave) reset(clientToInput(result.client));
      setSaveStatus(inputChangedDuringSave ? "editing" : "saved");
      onSaved(result.client);
    } catch {
      setSaveStatus("error");
    }
  }

  return (
    <form className="client-editor" noValidate onSubmit={handleSubmit(save)}>
      <ClientEditorHeader mode={mode} saveStatus={saveStatus} />

      <ClientIdentityFields errors={errors} readOnly={identityLocked} register={register} />
      <ClientInvoiceDefaultFields control={control} errors={errors} register={register} />
      <ClientSequenceFields errors={errors} invoiceReadOnly={identityLocked} register={register} />

      <ClientEditorActions
        isSubmitting={isSubmitting}
        mode={mode}
        onCancel={onCancel}
        onCopy={onCopy}
        saveStatus={saveStatus}
      />
    </form>
  );
}

function clientEditorInput(mode: ClientEditorMode, standardVatRate: string | null): ClientInput {
  switch (mode.kind) {
    case "create":
      return createNewClientInput(standardVatRate);
    case "copy":
      return copyClientToNewInput(mode.sourceClient);
    case "edit":
    case "locked-edit":
      return clientToInput(mode.client);
    default: {
      const unhandledMode: never = mode;
      return unhandledMode;
    }
  }
}

type ClientEditorHeaderProps = Readonly<{
  mode: ClientEditorMode;
  saveStatus: SaveStatus;
}>;

function ClientEditorHeader({ mode, saveStatus }: ClientEditorHeaderProps) {
  const content = clientEditorHeaderContent(mode);
  return (
    <header>
      <div className="client-editor-heading">
        <p className="eyebrow">Client details</p>
        <div className="client-editor-copy">
          <h2>{content.heading}</h2>
          <p>{content.description}</p>
        </div>
      </div>
      <FormSaveStatus label={clientSaveStatusLabels[saveStatus]} status={saveStatus} />
    </header>
  );
}

type ClientEditorActionsProps = Readonly<{
  isSubmitting: boolean;
  mode: ClientEditorMode;
  onCancel: () => void;
  onCopy: (client: Client) => void;
  saveStatus: SaveStatus;
}>;

function ClientEditorActions({
  isSubmitting,
  mode,
  onCancel,
  onCopy,
  saveStatus,
}: ClientEditorActionsProps) {
  return (
    <div className="editor-actions">
      {mode.kind === "locked-edit" ? (
        <button className="secondary-action" onClick={() => onCopy(mode.client)} type="button">
          Create new from this client
        </button>
      ) : null}
      <button className="secondary-action" onClick={onCancel} type="button">
        Cancel
      </button>
      <button className="primary-action" disabled={isSubmitting} type="submit">
        {clientSaveActionLabel(mode, saveStatus)}
      </button>
      {saveStatus === "error" ? (
        <p className="save-error">Could not save client. Your edits are still here.</p>
      ) : null}
    </div>
  );
}

function saveClientInput(mode: ClientEditorMode, input: ClientInput) {
  switch (mode.kind) {
    case "create":
    case "copy":
      return window.invoiceApp.createClient(input);
    case "edit":
    case "locked-edit":
      return window.invoiceApp.updateClient(mode.client.id, input);
    default: {
      const unhandledMode: never = mode;
      return unhandledMode;
    }
  }
}

function clientEditorHeaderContent(mode: ClientEditorMode) {
  switch (mode.kind) {
    case "create":
    case "copy":
      return {
        heading: "New client",
        description: editableClientDescription,
      };
    case "edit":
      return {
        heading: mode.client.legalName,
        description: editableClientDescription,
      };
    case "locked-edit":
      return {
        heading: mode.client.legalName,
        description: "Identity and invoice numbering are locked after first issue.",
      };
    default: {
      const unhandledMode: never = mode;
      return unhandledMode;
    }
  }
}

function clientSaveActionLabel(mode: ClientEditorMode, saveStatus: SaveStatus): string {
  if (saveStatus === "error") return "Retry";
  return mode.kind === "edit" || mode.kind === "locked-edit" ? "Save changes" : "Create client";
}

// SAFETY: emptyClientInput is a ClientInput, so each of its enumerable keys is a ClientInput key.
const clientInputFieldNames = Object.keys(emptyClientInput) as readonly (keyof ClientInput)[];

function clientInputsAreEqual(first: ClientInput, second: ClientInput): boolean {
  return clientInputFieldNames.every((fieldName) => first[fieldName] === second[fieldName]);
}
