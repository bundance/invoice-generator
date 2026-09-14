import type { ExchangeMethod, SterlingVatSummary } from "../domain/invoices/exchange-record.ts";
import { formatCurrencyAmount } from "../domain/money/decimal.ts";

export const exchangeMethodLabels: Readonly<Record<ExchangeMethod, string>> = {
  "hmrc-period-rate": "HMRC period rate",
  "other-hmrc-approved-method": "Another HMRC-approved method",
  "uk-market-selling-rate": "UK market selling rate",
};

export type SterlingVatDetails = Readonly<{
  effectiveDate: string;
  evidenceReference: string;
  gross: string;
  method: string;
  net: string;
  rateStatement: string;
  vat: string;
}>;

export function formatSterlingVatSummary(
  summary: SterlingVatSummary | null,
  currencyCode: string,
): SterlingVatDetails | null {
  if (!summary) return null;
  return {
    effectiveDate: summary.exchangeRecord.effectiveDate,
    evidenceReference: summary.exchangeRecord.evidenceReference,
    gross: formatCurrencyAmount(summary.totals.gross, "GBP", 2),
    method: exchangeMethodLabels[summary.exchangeRecord.method],
    net: formatCurrencyAmount(summary.totals.net, "GBP", 2),
    rateStatement: `1 GBP = ${summary.exchangeRecord.rate} ${currencyCode}`,
    vat: formatCurrencyAmount(summary.totals.vat, "GBP", 2),
  };
}
