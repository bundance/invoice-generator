export function formatVatTreatment(isUkTaxable: boolean, vatRates: readonly string[]): string {
  return isUkTaxable
    ? `UK VAT at ${vatRates.map((rate) => `${rate}%`).join(", ")}`
    : "Outside the scope of UK VAT";
}
