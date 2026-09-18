import arimoCyrillicExtItalic from "@fontsource/arimo/files/arimo-cyrillic-ext-400-italic.woff2?inline";
import arimoCyrillicExtRegular from "@fontsource/arimo/files/arimo-cyrillic-ext-400-normal.woff2?inline";
import arimoCyrillicExtBold from "@fontsource/arimo/files/arimo-cyrillic-ext-700-normal.woff2?inline";
import arimoCyrillicItalic from "@fontsource/arimo/files/arimo-cyrillic-400-italic.woff2?inline";
import arimoCyrillicRegular from "@fontsource/arimo/files/arimo-cyrillic-400-normal.woff2?inline";
import arimoCyrillicBold from "@fontsource/arimo/files/arimo-cyrillic-700-normal.woff2?inline";
import arimoGreekExtItalic from "@fontsource/arimo/files/arimo-greek-ext-400-italic.woff2?inline";
import arimoGreekExtRegular from "@fontsource/arimo/files/arimo-greek-ext-400-normal.woff2?inline";
import arimoGreekExtBold from "@fontsource/arimo/files/arimo-greek-ext-700-normal.woff2?inline";
import arimoGreekItalic from "@fontsource/arimo/files/arimo-greek-400-italic.woff2?inline";
import arimoGreekRegular from "@fontsource/arimo/files/arimo-greek-400-normal.woff2?inline";
import arimoGreekBold from "@fontsource/arimo/files/arimo-greek-700-normal.woff2?inline";
import arimoHebrewItalic from "@fontsource/arimo/files/arimo-hebrew-400-italic.woff2?inline";
import arimoHebrewRegular from "@fontsource/arimo/files/arimo-hebrew-400-normal.woff2?inline";
import arimoHebrewBold from "@fontsource/arimo/files/arimo-hebrew-700-normal.woff2?inline";
import arimoLatinExtItalic from "@fontsource/arimo/files/arimo-latin-ext-400-italic.woff2?inline";
import arimoLatinExtRegular from "@fontsource/arimo/files/arimo-latin-ext-400-normal.woff2?inline";
import arimoLatinExtBold from "@fontsource/arimo/files/arimo-latin-ext-700-normal.woff2?inline";
import arimoLatinItalic from "@fontsource/arimo/files/arimo-latin-400-italic.woff2?inline";
import arimoLatinRegular from "@fontsource/arimo/files/arimo-latin-400-normal.woff2?inline";
import arimoLatinBold from "@fontsource/arimo/files/arimo-latin-700-normal.woff2?inline";
import arimoVietnameseItalic from "@fontsource/arimo/files/arimo-vietnamese-400-italic.woff2?inline";
import arimoVietnameseRegular from "@fontsource/arimo/files/arimo-vietnamese-400-normal.woff2?inline";
import arimoVietnameseBold from "@fontsource/arimo/files/arimo-vietnamese-700-normal.woff2?inline";

import {
  billingDocumentFontSubsets,
  type BillingDocumentFontSubset,
} from "../domain/validation/billing-document-text.ts";
const regularSources = {
  "cyrillic-ext": arimoCyrillicExtRegular,
  cyrillic: arimoCyrillicRegular,
  "greek-ext": arimoGreekExtRegular,
  greek: arimoGreekRegular,
  hebrew: arimoHebrewRegular,
  vietnamese: arimoVietnameseRegular,
  "latin-ext": arimoLatinExtRegular,
  latin: arimoLatinRegular,
} satisfies Readonly<Record<BillingDocumentFontSubset, string>>;

const italicSources = {
  "cyrillic-ext": arimoCyrillicExtItalic,
  cyrillic: arimoCyrillicItalic,
  "greek-ext": arimoGreekExtItalic,
  greek: arimoGreekItalic,
  hebrew: arimoHebrewItalic,
  vietnamese: arimoVietnameseItalic,
  "latin-ext": arimoLatinExtItalic,
  latin: arimoLatinItalic,
} satisfies Readonly<Record<BillingDocumentFontSubset, string>>;

const boldSources = {
  "cyrillic-ext": arimoCyrillicExtBold,
  cyrillic: arimoCyrillicBold,
  "greek-ext": arimoGreekExtBold,
  greek: arimoGreekBold,
  hebrew: arimoHebrewBold,
  vietnamese: arimoVietnameseBold,
  "latin-ext": arimoLatinExtBold,
  latin: arimoLatinBold,
} satisfies Readonly<Record<BillingDocumentFontSubset, string>>;

export type BillingDocumentFontFace = Readonly<{
  family: "Arimo";
  source: string;
  style: "italic" | "normal";
  subset: BillingDocumentFontSubset;
  unicodeRange: string;
  weight: "400" | "700";
}>;

type BillingDocumentFontVariant = Readonly<{
  sources: Readonly<Record<BillingDocumentFontSubset, string>>;
  style: BillingDocumentFontFace["style"];
  weight: BillingDocumentFontFace["weight"];
}>;

const fontVariants: readonly BillingDocumentFontVariant[] = [
  { sources: regularSources, style: "normal", weight: "400" },
  { sources: italicSources, style: "italic", weight: "400" },
  { sources: boldSources, style: "normal", weight: "700" },
];

export const billingDocumentFontFaces: readonly BillingDocumentFontFace[] =
  billingDocumentFontSubsets.flatMap(({ name: subset, unicodeRange }) =>
    fontVariants.map(({ sources, style, weight }) => ({
      family: "Arimo",
      source: sources[subset],
      style,
      subset,
      unicodeRange,
      weight,
    })),
  );

export const billingDocumentFontFaceCount = billingDocumentFontFaces.length;

export const billingDocumentFontCss = billingDocumentFontFaces
  .map(({ source, style, unicodeRange, weight }) =>
    fontFace({ source, style, unicodeRange, weight }),
  )
  .join("");

export type BillingDocumentFonts = Readonly<{
  css: string;
  faces: readonly BillingDocumentFontFace[];
}>;

export const billingDocumentFonts: BillingDocumentFonts = {
  css: billingDocumentFontCss,
  faces: billingDocumentFontFaces,
};

type FontFaceOptions = Readonly<{
  source: string;
  style: "italic" | "normal";
  unicodeRange: string;
  weight: "400" | "700";
}>;

function fontFace({ source, style, unicodeRange, weight }: FontFaceOptions): string {
  return `@font-face{font-family:"Arimo";font-style:${style};font-weight:${weight};font-display:block;src:url("${source}") format("woff2");unicode-range:${unicodeRange}}`;
}
