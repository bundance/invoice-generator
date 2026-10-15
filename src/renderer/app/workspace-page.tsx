import type {
  FullCreditNoteIssueResult,
  InvoiceIssueResult,
  ReplacementDraftCreateResult,
  WorkspaceSummary,
} from "../../application/invoice-application-contract.ts";
import type { Client } from "../../domain/clients/client.ts";
import { formatDocumentId } from "../../domain/clients/client.ts";
import type { InvoiceDraft } from "../../domain/invoices/invoice-draft.ts";
import type { IssuerSettings } from "../../domain/issuer/issuer-settings.ts";
import { ClientsPage } from "../features/clients/clients-page.tsx";
import { CreateInvoicePage } from "../features/invoice-draft/create-invoice-page.tsx";
import { useInvoiceDraftForm } from "../features/invoice-draft/use-invoice-draft-form.ts";
import type { ReplacementDraftNoticeValues } from "../features/invoice-draft/replacement-draft-notice.tsx";
import { InvoicesPage } from "../features/invoices/invoices-page.tsx";
import { SettingsPage } from "../features/issuer-settings/settings-page.tsx";
import { useIssuerSettingsForm } from "../features/issuer-settings/use-issuer-settings-form.ts";
import type { WorkspaceDestination } from "./workspace-destination.ts";

type WorkspacePageProps = Readonly<{
  destination: WorkspaceDestination;
  draftRecoveryRequired: boolean;
  onClientSaved: (client: Client) => void;
  onCreditNoteIssued: (result: Extract<FullCreditNoteIssueResult, { kind: "issued" }>) => void;
  onDestinationChange: (destination: WorkspaceDestination) => void;
  onDraftChanged: (draft: InvoiceDraft | null) => void;
  onDraftRecoveryResolved: () => void;
  onIssuerSaved: (issuer: IssuerSettings) => void;
  onInvoiceIssued: (result: Extract<InvoiceIssueResult, { kind: "issued" }>) => void;
  onReplacementCreated: (
    result: Extract<ReplacementDraftCreateResult, { kind: "created" }>,
  ) => void;
  workspace: WorkspaceSummary;
}>;

export function WorkspacePage({
  destination,
  draftRecoveryRequired,
  onClientSaved,
  onCreditNoteIssued,
  onDestinationChange,
  onDraftChanged,
  onDraftRecoveryResolved,
  onIssuerSaved,
  onInvoiceIssued,
  onReplacementCreated,
  workspace,
}: WorkspacePageProps) {
  const issuerSettingsForm = useIssuerSettingsForm({
    issuer: workspace.issuer,
    onIssuerSaved,
  });
  const invoiceDraftForm = useInvoiceDraftForm({
    clients: workspace.clients,
    initialDraft: workspace.draft?.draft ?? null,
    invoices: workspace.issuedInvoices,
    onDraftChanged,
  });
  const usedClientIds = new Set(workspace.issuedInvoices.map((invoice) => invoice.client.id));
  const replacementNotice = createReplacementNotice(workspace);

  switch (destination) {
    case "create":
      return (
        <CreateInvoicePage
          clients={workspace.clients}
          currentBusinessDate={workspace.currentBusinessDate}
          draftForm={invoiceDraftForm}
          issuer={workspace.issuer}
          onDestinationChange={onDestinationChange}
          onRecoveryResolved={onDraftRecoveryResolved}
          onIssued={onInvoiceIssued}
          recoveryRequired={draftRecoveryRequired}
          replacementNotice={replacementNotice}
        />
      );
    case "invoices":
      return (
        <InvoicesPage
          creditNotes={workspace.creditNotes}
          currentBusinessDate={workspace.currentBusinessDate}
          invoices={workspace.issuedInvoices}
          onCreditNoteIssued={onCreditNoteIssued}
          onDestinationChange={onDestinationChange}
          onReplacementCreated={(result) => {
            invoiceDraftForm.openSavedDraft(result.draft);
            onReplacementCreated(result);
          }}
        />
      );
    case "clients":
      return (
        <ClientsPage
          clients={workspace.clients}
          onClientSaved={(client) => {
            if (workspace.clients.length === 0) {
              invoiceDraftForm.initializeForFirstClient(client);
            }
            onClientSaved(client);
          }}
          standardVatRate={workspace.issuer?.standardVatRate ?? null}
          usedClientIds={usedClientIds}
        />
      );
    case "settings":
      return (
        <SettingsPage
          appVersion={workspace.appVersion}
          issuer={workspace.issuer}
          issuerSettingsForm={issuerSettingsForm}
        />
      );
    default: {
      const unhandledDestination: never = destination;
      return unhandledDestination;
    }
  }
}

function createReplacementNotice(workspace: WorkspaceSummary): ReplacementDraftNoticeValues | null {
  if (workspace.draft?.kind !== "replacement" || !workspace.issuer) return null;
  const client = workspace.clients.find(({ id }) => id === workspace.draft?.draft.clientId);
  if (!client) return null;
  return {
    clientName: client.legalName,
    issuerName: workspace.issuer.legalName,
    nextInvoiceId: formatDocumentId(
      client.invoiceSequence.prefix,
      client.invoiceSequence.nextNumber,
    ),
    originalInvoiceId: workspace.draft.source,
  };
}
