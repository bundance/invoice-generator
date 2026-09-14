import { Users } from "lucide-react";
import { useState } from "react";

import type { Client, ClientId } from "../../../domain/clients/client.ts";
import { EmptyState } from "../../ui/empty-state.tsx";
import { PageHeader } from "../../ui/page-header.tsx";
import { ClientEditor, type ClientEditorMode } from "./client-editor.tsx";
import { ClientList } from "./client-list.tsx";

type ClientsPageProps = Readonly<{
  clients: readonly Client[];
  onClientSaved: (client: Client) => void;
  standardVatRate: string | null;
  usedClientIds: ReadonlySet<ClientId>;
}>;

type ClientEditorSelection =
  | Readonly<{ kind: "empty"; revision: number }>
  | Readonly<{ kind: "create"; revision: number }>
  | Readonly<{ kind: "copy"; revision: number; sourceClient: Client }>
  | Readonly<{ kind: "edit"; revision: number; clientId: ClientId }>;

export function ClientsPage({
  clients,
  onClientSaved,
  standardVatRate,
  usedClientIds,
}: ClientsPageProps) {
  const [selection, setSelection] = useState<ClientEditorSelection>(() =>
    clients[0]
      ? { kind: "edit", clientId: clients[0].id, revision: 0 }
      : { kind: "empty", revision: 0 },
  );
  const editorMode = resolveClientEditorMode({ clients, selection, usedClientIds });
  const selectedClientId =
    editorMode?.kind === "edit" || editorMode?.kind === "locked-edit" ? editorMode.client.id : null;

  function startClient(): void {
    setSelection((current) => ({
      kind: "create",
      revision: current.revision + 1,
    }));
  }

  function selectClient(clientId: ClientId): void {
    setSelection((current) => ({ kind: "edit", clientId, revision: current.revision + 1 }));
  }

  function copyClient(client: Client): void {
    setSelection((current) => ({
      kind: "copy",
      revision: current.revision + 1,
      sourceClient: client,
    }));
  }

  function clientSaved(client: Client): void {
    onClientSaved(client);
    setSelection((current) => ({ kind: "edit", clientId: client.id, revision: current.revision }));
  }

  function cancelEditor(): void {
    setSelection((current) => {
      const revision = current.revision + 1;
      if (current.kind !== "create" && current.kind !== "copy") {
        return { ...current, revision };
      }
      const firstClient = clients[0];
      return firstClient
        ? { kind: "edit", clientId: firstClient.id, revision }
        : { kind: "empty", revision };
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Invoice defaults"
        heading="Clients"
        summary="Each client keeps its invoice sequence, currency, tax treatment, and standard terms."
      />
      {editorMode === null ? (
        <EmptyState icon={Users} heading="No clients yet">
          <p>Next: create the first client and invoice number series.</p>
          <button className="primary-action" onClick={startClient} type="button">
            Create first client
          </button>
        </EmptyState>
      ) : (
        <div className="clients-workspace">
          <div className="clients-sidebar">
            <button className="primary-action" onClick={startClient} type="button">
              New client
            </button>
            {clients.length > 0 ? (
              <ClientList
                clients={clients}
                onSelect={selectClient}
                selectedClientId={selectedClientId}
              />
            ) : null}
          </div>
          <ClientEditor
            clients={clients}
            key={selection.revision}
            mode={editorMode}
            onCancel={cancelEditor}
            onCopy={copyClient}
            onSaved={clientSaved}
            standardVatRate={standardVatRate}
          />
        </div>
      )}
    </>
  );
}

type ResolveClientEditorModeOptions = Readonly<{
  clients: readonly Client[];
  selection: ClientEditorSelection;
  usedClientIds: ReadonlySet<ClientId>;
}>;

function resolveClientEditorMode({
  clients,
  selection,
  usedClientIds,
}: ResolveClientEditorModeOptions): ClientEditorMode | null {
  switch (selection.kind) {
    case "empty":
      return null;
    case "create":
      return { kind: "create" };
    case "copy":
      return { kind: "copy", sourceClient: selection.sourceClient };
    case "edit": {
      const client = clients.find(({ id }) => id === selection.clientId);
      if (!client) return { kind: "create" };
      return {
        kind: usedClientIds.has(client.id) ? "locked-edit" : "edit",
        client,
      };
    }
    default: {
      const unhandledSelection: never = selection;
      return unhandledSelection;
    }
  }
}
