import { Building2, Users, type LucideIcon } from "lucide-react";

import type { InvoiceIssueResult } from "../../../application/invoice-application-contract.ts";
import type { Client } from "../../../domain/clients/client.ts";
import type { IssuerSettings } from "../../../domain/issuer/issuer-settings.ts";
import type { BusinessDate } from "../../../domain/time/business-date.ts";
import type { WorkspaceDestination } from "../../app/workspace-destination.ts";
import { PageHeader } from "../../ui/page-header.tsx";
import { InvoiceDraftStudio } from "./invoice-draft-studio.tsx";
import type { InvoiceDraftForm } from "./use-invoice-draft-form.ts";
import type { ReplacementDraftNoticeValues } from "./replacement-draft-notice.tsx";

type CreateInvoicePageProps = Readonly<{
  clients: readonly Client[];
  currentBusinessDate: BusinessDate;
  draftForm: InvoiceDraftForm;
  issuer: IssuerSettings | null;
  onDestinationChange: (destination: WorkspaceDestination) => void;
  onIssued: (result: Extract<InvoiceIssueResult, { kind: "issued" }>) => void;
  onRecoveryResolved: () => void;
  recoveryRequired: boolean;
  replacementNotice: ReplacementDraftNoticeValues | null;
}>;

export function CreateInvoicePage({
  clients,
  currentBusinessDate,
  draftForm,
  issuer,
  onDestinationChange,
  onIssued,
  onRecoveryResolved,
  recoveryRequired,
  replacementNotice,
}: CreateInvoicePageProps) {
  const firstClient = clients[0];
  const setupRequirements = getSetupRequirements(issuer !== null, firstClient !== undefined);

  return (
    <>
      <PageHeader
        eyebrow="Document studio"
        heading="Create invoice"
        summary="Build one invoice beside the document it will produce. A number is only used when you issue it."
      />
      {issuer && firstClient ? (
        <InvoiceDraftStudio
          clients={clients}
          currentBusinessDate={currentBusinessDate}
          draftForm={draftForm}
          issuer={issuer}
          onRecoveryResolved={onRecoveryResolved}
          onIssued={onIssued}
          recoveryRequired={recoveryRequired}
          replacementNotice={replacementNotice}
        />
      ) : (
        <SetupWorkspace
          onDestinationChange={onDestinationChange}
          requirements={setupRequirements}
        />
      )}
    </>
  );
}

type SetupRequirement = Readonly<{
  actionLabel: string;
  description: string;
  destination: WorkspaceDestination;
  icon: LucideIcon;
  title: string;
}>;

const issuerSetupRequirement: SetupRequirement = {
  actionLabel: "Add issuer details",
  description: "Legal, VAT, bank, and business details.",
  destination: "settings",
  icon: Building2,
  title: "Issuer details",
};

const clientSetupRequirement: SetupRequirement = {
  actionLabel: "Create first client",
  description: "Invoice prefix, currency, rate, and tax defaults.",
  destination: "clients",
  icon: Users,
  title: "First client",
};

function getSetupRequirements(
  issuerIsReady: boolean,
  clientIsReady: boolean,
): readonly SetupRequirement[] {
  return [
    ...(issuerIsReady ? [] : [issuerSetupRequirement]),
    ...(clientIsReady ? [] : [clientSetupRequirement]),
  ];
}

type SetupWorkspaceProps = Readonly<{
  onDestinationChange: (destination: WorkspaceDestination) => void;
  requirements: readonly SetupRequirement[];
}>;

function SetupWorkspace({ onDestinationChange, requirements }: SetupWorkspaceProps) {
  return (
    <div className="document-studio">
      <section className="preview-panel" aria-label="Invoice preview">
        <div className="preview-toolbar">
          <span>Generated PDF preview</span>
          <small>Waiting for setup</small>
        </div>
        <div className="invoice-paper">
          <div className="paper-wordmark" aria-hidden="true">
            <span>CODER</span>
            <strong>NETIC</strong>
          </div>
          <p>Your invoice preview will appear here after issuer and client setup.</p>
        </div>
      </section>
      <aside className="inspector setup-inspector" aria-labelledby="setup-heading">
        <div className="setup-copy">
          <p className="eyebrow">Before your first invoice</p>
          <div className="setup-copy__summary">
            <h2 id="setup-heading">Set up your workspace</h2>
            <p>Complete the remaining setup before creating an invoice.</p>
          </div>
        </div>
        <ol className="setup-steps">
          {requirements.map(({ description, icon: Icon, title }) => (
            <li key={title}>
              <Icon aria-hidden="true" />
              <div>
                <strong>{title}</strong>
                <span>{description}</span>
              </div>
            </li>
          ))}
        </ol>
        <div className="action-stack">
          {requirements.map(({ actionLabel, destination }, index) => (
            <button
              className={index === 0 ? "primary-action" : "secondary-action"}
              key={destination}
              onClick={() => onDestinationChange(destination)}
              type="button"
            >
              {actionLabel}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
