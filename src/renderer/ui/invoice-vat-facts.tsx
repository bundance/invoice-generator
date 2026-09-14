import type { SterlingVatDetails } from "../../documents/exchange-presentation.ts";

import { SterlingVatFacts } from "./sterling-vat-facts.tsx";

type InvoiceVatFactsProps = Readonly<{
  sterlingVatDetails: SterlingVatDetails | null;
  taxPoint: string | null;
  vatWording: string;
}>;

export function InvoiceVatFacts({
  sterlingVatDetails,
  taxPoint,
  vatWording,
}: InvoiceVatFactsProps) {
  return (
    <>
      {taxPoint ? (
        <div>
          <dt>Tax point</dt>
          <dd>{taxPoint}</dd>
        </div>
      ) : null}
      {sterlingVatDetails ? <SterlingVatFacts {...sterlingVatDetails} /> : null}
      <div>
        <dt>VAT wording</dt>
        <dd>{vatWording}</dd>
      </div>
    </>
  );
}
