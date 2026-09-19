import { z } from "zod";

import { normalizeBoundedField, type NormalizedField } from "../validation/text-field.ts";

export const persistedVatRateSchema = z.string().superRefine((value, context) => {
  const normalized = normalizeVatRate(value);
  if (normalized.kind === "invalid" || normalized.value !== value) {
    context.addIssue({ code: "custom", message: "Use a canonical VAT rate." });
  }
});

export function normalizeVatRate(value: string): NormalizedField {
  const normalizedField = normalizeBoundedField(value, 200);
  if (normalizedField.kind === "invalid") return normalizedField;
  const normalizedValue = normalizedField.value;
  const match = /^(\d+)(?:\.(\d{1,3}))?$/u.exec(normalizedValue);
  if (!match) {
    return { kind: "invalid", message: "Enter a VAT rate with up to three decimal places." };
  }

  const integerDigits = match[1];
  if (!integerDigits) {
    return { kind: "invalid", message: "Enter a VAT rate greater than zero." };
  }

  const wholeRate = BigInt(integerDigits);
  const fractionalDigits = match[2] ?? "";
  const hasFractionalValue = /[1-9]/u.test(fractionalDigits);
  if (wholeRate === 0n && !hasFractionalValue) {
    return { kind: "invalid", message: "Enter a VAT rate greater than zero." };
  }
  if (wholeRate > 100n || (wholeRate === 100n && hasFractionalValue)) {
    return { kind: "invalid", message: "Enter a VAT rate no greater than 100." };
  }

  const significantFraction = fractionalDigits.replace(/0+$/u, "");
  const canonicalValue = significantFraction
    ? `${wholeRate.toString()}.${significantFraction}`
    : wholeRate.toString();
  return { kind: "valid", value: canonicalValue };
}
