import type { SterlingVatDetails } from "../../documents/exchange-presentation.ts";

export function SterlingVatFacts({
  effectiveDate,
  evidenceReference,
  gross,
  method,
  net,
  rateStatement,
  vat,
}: SterlingVatDetails) {
  return (
    <>
      <div>
        <dt>Sterling net</dt>
        <dd>{net}</dd>
      </div>
      <div>
        <dt>Sterling VAT</dt>
        <dd>{vat}</dd>
      </div>
      <div>
        <dt>Sterling gross</dt>
        <dd>{gross}</dd>
      </div>
      <div>
        <dt>Exchange rate</dt>
        <dd>{rateStatement}</dd>
      </div>
      <div>
        <dt>Exchange-rate date</dt>
        <dd>{effectiveDate}</dd>
      </div>
      <div>
        <dt>Exchange-rate method</dt>
        <dd>{method}</dd>
      </div>
      <div>
        <dt>Exchange-rate evidence</dt>
        <dd className="sterling-vat-facts__evidence">{evidenceReference}</dd>
      </div>
    </>
  );
}
