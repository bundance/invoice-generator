import { useState } from "react";
import { useWatch } from "react-hook-form";

import type { InvoiceIssueResult } from "../../../application/invoice-application-contract.ts";
import type { Client } from "../../../domain/clients/client.ts";
import {
  parseInvoiceDraftInput,
  reviewInvoiceDraft,
} from "../../../domain/invoices/invoice-draft.ts";
import type { IssuerSettings } from "../../../domain/issuer/issuer-settings.ts";
import type { BusinessDate } from "../../../domain/time/business-date.ts";
import type { BillingPdfPreviewReadiness } from "../../ui/billing-pdf-preview.tsx";
import { DraftRecoveryDialog } from "./draft-recovery-dialog.tsx";
import { InvoiceDraftInspector } from "./invoice-draft-inspector.tsx";
import { InvoiceDraftLayout } from "./invoice-draft-layout.tsx";
import { InvoicePreview } from "./invoice-preview.tsx";
import type { InvoiceDraftForm } from "./use-invoice-draft-form.ts";
import type { ReplacementDraftNoticeValues } from "./replacement-draft-notice.tsx";

type InvoiceDraftStudioProps = Readonly<{
  clients: readonly Client[];
  currentBusinessDate: BusinessDate;
  draftForm: InvoiceDraftForm;
  issuer: IssuerSettings;
  onIssued: (result: Extract<InvoiceIssueResult, { kind: "issued" }>) => void;
  onRecoveryResolved: () => void;
  recoveryRequired: boolean;
  replacementNotice: ReplacementDraftNoticeValues | null;
}>;

export function InvoiceDraftStudio({
  clients,
  currentBusinessDate,
  draftForm,
  issuer,
  onIssued,
  onRecoveryResolved,
  recoveryRequired,
  replacementNotice,
}: InvoiceDraftStudioProps) {
  const [previewReadiness, setPreviewReadiness] = useState<BillingPdfPreviewReadiness | null>(null);
  const draft = parseInvoiceDraftInput(useWatch({ control: draftForm.control }));
  const previewRequestKey = JSON.stringify(draft);
  const previewIsReady =
    previewReadiness?.requestKey === previewRequestKey && previewReadiness.ready;
  const selectedClient = clients.find(({ id }) => id === draft.clientId);
  const review = reviewInvoiceDraft({
    client: selectedClient,
    draft,
    issuer,
    today: currentBusinessDate,
  });

  async function discardDraft(): Promise<boolean> {
    const didDiscard = await draftForm.discard();
    if (didDiscard) onRecoveryResolved();
    return didDiscard;
  }

  return (
    <>
      <InvoiceDraftLayout
        preview={
          <InvoicePreview
            draft={draft}
            onReadyChange={setPreviewReadiness}
            requestKey={previewRequestKey}
          />
        }
        editor={
          <InvoiceDraftInspector
            clients={clients}
            draft={draft}
            draftForm={draftForm}
            onDiscard={discardDraft}
            onIssued={onIssued}
            previewIsReady={previewIsReady}
            review={review}
            selectedClient={selectedClient}
            replacementNotice={replacementNotice}
          />
        }
      />
      {recoveryRequired ? (
        <DraftRecoveryDialog onDiscard={() => void discardDraft()} onResume={onRecoveryResolved} />
      ) : null}
    </>
  );
}
