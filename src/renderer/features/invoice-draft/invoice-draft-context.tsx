import type { Client } from "../../../domain/clients/client.ts";
import { formatDocumentId } from "../../../domain/clients/client.ts";

export function InvoiceDraftContext({ client }: Readonly<{ client: Client | undefined }>) {
  if (!client) {
    return (
      <div className="draft-context">
        <p>Choose a saved client to apply editable starting values.</p>
      </div>
    );
  }

  return (
    <div className="draft-context">
      <p>Draft defaults ready for {client.legalName}.</p>
      <p>Selecting a client copies these defaults. It uses no number.</p>
      <ul aria-label="Client document defaults">
        <li>
          {formatDocumentId(client.invoiceSequence.prefix, client.invoiceSequence.nextNumber)}
        </li>
        <li>
          {client.currency.code} {client.standardDayRate} per day
        </li>
      </ul>
    </div>
  );
}
