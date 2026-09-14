export type ReplacementDraftNoticeValues = Readonly<{
  clientName: string;
  issuerName: string;
  nextInvoiceId: string;
  originalInvoiceId: string;
}>;

export function ReplacementDraftNotice({
  clientName,
  issuerName,
  nextInvoiceId,
  originalInvoiceId,
}: ReplacementDraftNoticeValues) {
  return (
    <section className="replacement-draft-notice" aria-label="Replacement draft source">
      <p className="eyebrow">Replacement for {originalInvoiceId}</p>
      <p>The editable invoice facts were copied from the original. Its snapshots stay unchanged.</p>
      <p>Current issuer: {issuerName}</p>
      <p>Current client: {clientName}</p>
      <p>Next invoice if issued: {nextInvoiceId}</p>
    </section>
  );
}
