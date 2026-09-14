import { z } from "zod";

import { billingDocumentFontSupportsText } from "./billing-document-text.ts";

export type NormalizedField =
  | Readonly<{ kind: "valid"; value: string }>
  | Readonly<{ kind: "invalid"; message: string }>;

const graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

export function createFieldSchemas<Brand extends string>(
  normalize: (value: string) => NormalizedField,
) {
  const input = z.string().transform((value, context) => {
    const result = normalize(value);
    if (result.kind === "valid") return result.value;

    context.addIssue({ code: "custom", message: result.message });
    return z.NEVER;
  });
  const persisted = z.string().superRefine((value, context) => {
    const result = normalize(value);
    if (result.kind === "invalid") {
      context.addIssue({ code: "custom", message: result.message });
      return;
    }
    if (result.value !== value) {
      context.addIssue({ code: "custom", message: "Use the canonical persisted value." });
    }
  });

  return {
    input: input.brand<Brand>(),
    persisted: persisted.brand<Brand>(),
  };
}

export function normalizeRequiredSingleLine(
  value: string,
  requiredMessage: string,
): NormalizedField {
  const optionalValue = normalizeOptionalSingleLine(value);
  if (optionalValue.kind === "invalid" || optionalValue.value) return optionalValue;
  return { kind: "invalid", message: requiredMessage };
}

export function normalizeOptionalSingleLine(value: string): NormalizedField {
  if (hasDisallowedControlCharacter(value, false)) {
    return { kind: "invalid", message: "Remove line breaks or control characters." };
  }

  const normalizedValue = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!billingDocumentFontSupportsText(normalizedValue)) {
    return { kind: "invalid", message: "Use characters supported by the invoice PDF font." };
  }
  if (hasMoreThanGraphemes(normalizedValue, 200)) {
    return { kind: "invalid", message: "Use 200 characters or fewer." };
  }

  return { kind: "valid", value: normalizedValue };
}

export function normalizeRequiredMultiline(
  value: string,
  requiredMessage: string,
): NormalizedField {
  const optionalValue = normalizeOptionalMultiline(value);
  if (optionalValue.kind === "invalid" || optionalValue.value) return optionalValue;
  return { kind: "invalid", message: requiredMessage };
}

export function normalizeOptionalMultiline(value: string): NormalizedField {
  const normalizedLineEndings = value.replace(/\r\n?/gu, "\n");
  if (hasDisallowedControlCharacter(normalizedLineEndings, true)) {
    return { kind: "invalid", message: "Remove control characters." };
  }

  const normalizedValue = normalizedLineEndings.normalize("NFC").trim();
  if (!billingDocumentFontSupportsText(normalizedValue)) {
    return { kind: "invalid", message: "Use characters supported by the invoice PDF font." };
  }
  if (hasMoreThanGraphemes(normalizedValue, 1_000)) {
    return { kind: "invalid", message: "Use 1,000 characters or fewer." };
  }

  return { kind: "valid", value: normalizedValue };
}

export function hasDisallowedControlCharacter(value: string, allowLineBreaks: boolean): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (allowLineBreaks && (codePoint === 10 || codePoint === 13)) continue;
    if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return true;
  }
  return false;
}

function hasMoreThanGraphemes(value: string, maximum: number): boolean {
  let graphemeCount = 0;
  for (const _segment of graphemeSegmenter.segment(value)) {
    graphemeCount += 1;
    if (graphemeCount > maximum) return true;
  }
  return false;
}

export function normalizeBoundedField(value: string, maximum: number): NormalizedField {
  const normalizedValue = value.normalize("NFC").trim();
  return hasMoreThanGraphemes(normalizedValue, maximum)
    ? { kind: "invalid", message: `Use ${maximum.toLocaleString("en")} characters or fewer.` }
    : { kind: "valid", value: normalizedValue };
}
