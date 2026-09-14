import { useCallback, useEffect, useState } from "react";

import type {
  FullCreditNoteIssueResult,
  InvoiceIssueResult,
  ReplacementDraftCreateResult,
  WorkspaceLoadResult,
  WorkspaceSummary,
} from "../../application/invoice-application-contract.ts";
import type { Client } from "../../domain/clients/client.ts";
import type { InvoiceDraft } from "../../domain/invoices/invoice-draft.ts";
import type { IssuerSettings } from "../../domain/issuer/issuer-settings.ts";
import { TopBar } from "./top-bar.tsx";
import type { WorkspaceDestination } from "./workspace-destination.ts";
import { WorkspacePage } from "./workspace-page.tsx";
import { RecoveryScreen } from "../features/recovery/recovery-screen.tsx";

export default function App() {
  const [destination, setDestination] = useState<WorkspaceDestination>("create");
  const [workspaceResult, setWorkspaceResult] = useState<WorkspaceLoadResult | null>(null);
  const [draftRecoveryRequired, setDraftRecoveryRequired] = useState(false);
  const handleClientSaved = useCallback((client: Client): void => {
    setWorkspaceResult((currentResult) =>
      updateReadyWorkspace(currentResult, (workspace) => {
        const clientExists = workspace.clients.some(({ id }) => id === client.id);
        const clients = clientExists
          ? workspace.clients.map((currentClient) =>
              currentClient.id === client.id ? client : currentClient,
            )
          : [...workspace.clients, client];
        return { ...workspace, clients };
      }),
    );
  }, []);
  const handleIssuerSaved = useCallback((issuer: IssuerSettings): void => {
    setWorkspaceResult((currentResult) =>
      updateReadyWorkspace(currentResult, (workspace) => ({ ...workspace, issuer })),
    );
  }, []);
  const handleDraftChanged = useCallback((invoiceDraft: InvoiceDraft | null): void => {
    setWorkspaceResult((currentResult) =>
      updateReadyWorkspace(currentResult, (workspace) => ({
        ...workspace,
        draft: invoiceDraft
          ? workspace.draft?.kind === "replacement"
            ? { ...workspace.draft, draft: invoiceDraft }
            : { kind: "ordinary", draft: invoiceDraft }
          : null,
      })),
    );
  }, []);
  const handleInvoiceIssued = useCallback(
    (result: Extract<InvoiceIssueResult, { kind: "issued" }>): void => {
      setWorkspaceResult((currentResult) =>
        updateReadyWorkspace(currentResult, (workspace) => {
          return {
            ...workspace,
            clients: replaceClient(workspace.clients, result.client),
            draft: null,
            issuedInvoices: [...workspace.issuedInvoices, result.invoice],
          };
        }),
      );
      setDestination("invoices");
    },
    [],
  );
  const handleCreditNoteIssued = useCallback(
    (result: Extract<FullCreditNoteIssueResult, { kind: "issued" }>): void => {
      setWorkspaceResult((currentResult) =>
        updateReadyWorkspace(currentResult, (workspace) => ({
          ...workspace,
          creditNotes: [...workspace.creditNotes, result.creditNote],
        })),
      );
    },
    [],
  );
  const handleReplacementCreated = useCallback(
    (result: Extract<ReplacementDraftCreateResult, { kind: "created" }>): void => {
      setWorkspaceResult((currentResult) =>
        updateReadyWorkspace(currentResult, (workspace) => ({
          ...workspace,
          draft: { kind: "replacement", draft: result.draft, source: result.source },
        })),
      );
      setDraftRecoveryRequired(false);
      setDestination("create");
    },
    [],
  );

  useEffect(() => {
    let isCurrent = true;

    window.invoiceApp.loadWorkspace().then(
      (result) => {
        if (isCurrent) {
          setWorkspaceResult(result);
          setDraftRecoveryRequired(result.kind === "ready" && result.workspace.draft !== null);
        }
      },
      () => {
        if (isCurrent) {
          setWorkspaceResult({
            kind: "recovery-required",
            problem: "unreadable",
          });
        }
      },
    );

    return () => {
      isCurrent = false;
    };
  }, []);

  if (!workspaceResult) {
    return <main className="launch-state">Opening your local workspace…</main>;
  }

  if (workspaceResult.kind === "recovery-required") {
    return <RecoveryScreen problem={workspaceResult.problem} />;
  }

  return (
    <div className="app-shell">
      <TopBar destination={destination} onDestinationChange={setDestination} />
      <main className="workspace">
        <WorkspacePage
          destination={destination}
          draftRecoveryRequired={draftRecoveryRequired}
          onClientSaved={handleClientSaved}
          onCreditNoteIssued={handleCreditNoteIssued}
          onDestinationChange={setDestination}
          onDraftChanged={handleDraftChanged}
          onDraftRecoveryResolved={() => setDraftRecoveryRequired(false)}
          onIssuerSaved={handleIssuerSaved}
          onInvoiceIssued={handleInvoiceIssued}
          onReplacementCreated={handleReplacementCreated}
          workspace={workspaceResult.workspace}
        />
      </main>
    </div>
  );
}

function updateReadyWorkspace(
  currentResult: WorkspaceLoadResult | null,
  update: (workspace: WorkspaceSummary) => WorkspaceSummary,
): WorkspaceLoadResult | null {
  if (!currentResult || currentResult.kind !== "ready") return currentResult;
  return { kind: "ready", workspace: update(currentResult.workspace) };
}

function replaceClient(clients: readonly Client[], savedClient: Client): readonly Client[] {
  return clients.map((client) => (client.id === savedClient.id ? savedClient : client));
}
