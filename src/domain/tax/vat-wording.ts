export const outsideScopeWording = "Outside the scope of UK VAT.";
export const reverseChargeWording =
  "Outside the scope of UK VAT. Subject to reverse charge in the country of receipt.";
export const ukTaxableWording = "UK VAT applies.";

export function outsideScopeVatWording(reverseCharge: boolean): string {
  return reverseCharge ? reverseChargeWording : outsideScopeWording;
}
