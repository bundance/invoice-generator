import type { ExchangeMethod } from "../domain/invoices/exchange-record.ts";
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
  totalsByRate: readonly Readonly<{ net: string; vat: string; gross: string; vatRate: string }>[];
  vat: string;
}>;

type PresentableSterlingVatSummary = Readonly<{
  exchangeRecord: Readonly<{
    effectiveDate: string;
    evidenceReference: string;
    method: ExchangeMethod;
    rate: string;
  }>;
  totals: Readonly<{ gross: string; net: string; vat: string }>;
  totalsByRate: readonly Readonly<{
    sterlingTotals: Readonly<{ gross: string; net: string; vat: string }>;
    vatRate: string;
  }>[];
}>;

export function formatSterlingVatSummary(
  summary: PresentableSterlingVatSummary | null,
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
    totalsByRate: summary.totalsByRate.map((bucket) => ({
      gross: formatCurrencyAmount(bucket.sterlingTotals.gross, "GBP", 2),
      net: formatCurrencyAmount(bucket.sterlingTotals.net, "GBP", 2),
      vat: formatCurrencyAmount(bucket.sterlingTotals.vat, "GBP", 2),
      vatRate: bucket.vatRate,
    })),
    vat: formatCurrencyAmount(summary.totals.vat, "GBP", 2),
  };
}
