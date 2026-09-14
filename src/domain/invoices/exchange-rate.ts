import { normalizePositiveDecimal } from "../money/decimal.ts";
import { createFieldSchemas, type NormalizedField } from "../validation/text-field.ts";

export const persistedExchangeRateSchema =
  createFieldSchemas<"ExchangeRate">(normalizeExchangeRate).persisted;

export function normalizeExchangeRate(value: string): NormalizedField {
  const rate = normalizePositiveDecimal(value);
  if (rate.kind === "invalid") {
    return { kind: "invalid", message: "Enter a positive exchange rate." };
  }

  const significantDigits = rate.value.replace(".", "").replace(/^0+/u, "").length;
  return significantDigits <= 12
    ? rate
    : { kind: "invalid", message: "Use at most 12 significant digits." };
}
