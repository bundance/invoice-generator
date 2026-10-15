import arimoCyrillicExtItalic from "@fontsource/arimo/files/arimo-cyrillic-ext-400-italic.woff?inline";
import arimoCyrillicExtRegular from "@fontsource/arimo/files/arimo-cyrillic-ext-400-normal.woff?inline";
import arimoCyrillicExtBold from "@fontsource/arimo/files/arimo-cyrillic-ext-700-normal.woff?inline";
import arimoCyrillicItalic from "@fontsource/arimo/files/arimo-cyrillic-400-italic.woff?inline";
import arimoCyrillicRegular from "@fontsource/arimo/files/arimo-cyrillic-400-normal.woff?inline";
import arimoCyrillicBold from "@fontsource/arimo/files/arimo-cyrillic-700-normal.woff?inline";
import arimoGreekExtItalic from "@fontsource/arimo/files/arimo-greek-ext-400-italic.woff?inline";
import arimoGreekExtRegular from "@fontsource/arimo/files/arimo-greek-ext-400-normal.woff?inline";
import arimoGreekExtBold from "@fontsource/arimo/files/arimo-greek-ext-700-normal.woff?inline";
import arimoGreekItalic from "@fontsource/arimo/files/arimo-greek-400-italic.woff?inline";
import arimoGreekRegular from "@fontsource/arimo/files/arimo-greek-400-normal.woff?inline";
import arimoGreekBold from "@fontsource/arimo/files/arimo-greek-700-normal.woff?inline";
import arimoHebrewItalic from "@fontsource/arimo/files/arimo-hebrew-400-italic.woff?inline";
import arimoHebrewRegular from "@fontsource/arimo/files/arimo-hebrew-400-normal.woff?inline";
import arimoHebrewBold from "@fontsource/arimo/files/arimo-hebrew-700-normal.woff?inline";
import arimoLatinExtItalic from "@fontsource/arimo/files/arimo-latin-ext-400-italic.woff?inline";
import arimoLatinExtRegular from "@fontsource/arimo/files/arimo-latin-ext-400-normal.woff?inline";
import arimoLatinExtBold from "@fontsource/arimo/files/arimo-latin-ext-700-normal.woff?inline";
import arimoLatinItalic from "@fontsource/arimo/files/arimo-latin-400-italic.woff?inline";
import arimoLatinRegular from "@fontsource/arimo/files/arimo-latin-400-normal.woff?inline";
import arimoLatinBold from "@fontsource/arimo/files/arimo-latin-700-normal.woff?inline";
import arimoVietnameseItalic from "@fontsource/arimo/files/arimo-vietnamese-400-italic.woff?inline";
import arimoVietnameseRegular from "@fontsource/arimo/files/arimo-vietnamese-400-normal.woff?inline";
import arimoVietnameseBold from "@fontsource/arimo/files/arimo-vietnamese-700-normal.woff?inline";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- This module runs only in the Electron main process.
import { Font } from "@react-pdf/renderer";

import type { BillingDocumentFontSubset } from "../domain/validation/billing-document-text.ts";

const sources = {
  "cyrillic-ext": {
    bold: arimoCyrillicExtBold,
    italic: arimoCyrillicExtItalic,
    regular: arimoCyrillicExtRegular,
  },
  cyrillic: {
    bold: arimoCyrillicBold,
    italic: arimoCyrillicItalic,
    regular: arimoCyrillicRegular,
  },
  "greek-ext": {
    bold: arimoGreekExtBold,
    italic: arimoGreekExtItalic,
    regular: arimoGreekExtRegular,
  },
  greek: { bold: arimoGreekBold, italic: arimoGreekItalic, regular: arimoGreekRegular },
  hebrew: { bold: arimoHebrewBold, italic: arimoHebrewItalic, regular: arimoHebrewRegular },
  "latin-ext": {
    bold: arimoLatinExtBold,
    italic: arimoLatinExtItalic,
    regular: arimoLatinExtRegular,
  },
  latin: { bold: arimoLatinBold, italic: arimoLatinItalic, regular: arimoLatinRegular },
  vietnamese: {
    bold: arimoVietnameseBold,
    italic: arimoVietnameseItalic,
    regular: arimoVietnameseRegular,
  },
} satisfies Readonly<
  Record<BillingDocumentFontSubset, Readonly<{ bold: string; italic: string; regular: string }>>
>;

const subsetOrder: readonly BillingDocumentFontSubset[] = [
  "latin",
  "latin-ext",
  "vietnamese",
  "greek",
  "greek-ext",
  "cyrillic",
  "cyrillic-ext",
  "hebrew",
];

export const billingPdfFontFamilies = subsetOrder.map((subset) => `Arimo ${subset}`);

let fontsRegistered = false;

export function registerBillingPdfFonts(): void {
  if (fontsRegistered) return;
  for (const subset of subsetOrder) {
    const family = `Arimo ${subset}`;
    Font.register({
      family,
      fonts: [
        { src: sources[subset].regular, fontStyle: "normal", fontWeight: 400 },
        { src: sources[subset].italic, fontStyle: "italic", fontWeight: 400 },
        { src: sources[subset].bold, fontStyle: "normal", fontWeight: 700 },
      ],
    });
  }
  fontsRegistered = true;
}
