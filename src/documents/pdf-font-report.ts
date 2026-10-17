import { z } from "zod";

const approvedPdfFontName = /^(?:[A-Z]{6}\+)?Arimo(?:[-,]|$)/u;
const pdfKitUnusedFontResourceName = /^(?:Helvetica|Helvetica-Oblique)$/u;
const pdfJsFontSchema = z.object({ name: z.string() });

export function verifyEmbeddedArimoFonts(report: string): void {
  const lines = report.split("\n");
  const separatorIndex = lines.findIndex((line) => /^-+\s+-+/u.test(line));
  const fontRows = separatorIndex < 0 ? [] : lines.slice(separatorIndex + 1).filter(Boolean);
  const fonts = fontRows.map((row) => {
    const columns = row.trim().split(/\s+/u);
    return {
      embedded: columns.at(-5),
      name: columns[0] ?? "",
      unicode: columns.at(-3),
    };
  });
  const arimoFonts = fonts.filter(({ name }) => approvedPdfFontName.test(name));
  const allArimoFontsAreEmbeddedUnicode =
    arimoFonts.length > 0 &&
    arimoFonts.every(({ embedded, unicode }) => embedded === "yes" && unicode === "yes");
  const onlyPdfKitUnusedResourcesAreAdditional = fonts.every(
    ({ name }) => approvedPdfFontName.test(name) || pdfKitUnusedFontResourceName.test(name),
  );

  if (!allArimoFontsAreEmbeddedUnicode || !onlyPdfKitUnusedResourcesAreAdditional) {
    throw new Error("The retained PDF must embed every document font as Unicode Arimo");
  }
}

export async function readUsedPdfTextFontNames(bytes: Uint8Array): Promise<readonly string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: Uint8Array.from(bytes),
    fontExtraProperties: true,
    standardFontDataUrl: decodeURIComponent(
      new URL("./standard_fonts/", import.meta.resolve("pdfjs-dist/package.json")).pathname,
    ),
  });
  try {
    const document = await loadingTask.promise;
    const pageFontNames = await Promise.all(
      Array.from({ length: document.numPages }, async (_value, index) => {
        const page = await document.getPage(index + 1);
        await page.getOperatorList();
        const text = await page.getTextContent();
        return text.items.flatMap((item) => {
          if (!("fontName" in item)) return [];
          return [pdfJsFontSchema.parse(page.commonObjs.get(item.fontName)).name];
        });
      }),
    );
    const fontNames = new Set(pageFontNames.flat());
    return [...fontNames].sort();
  } finally {
    await loadingTask.destroy();
  }
}

export async function verifyPdfTextUsesArimo(bytes: Uint8Array): Promise<void> {
  verifyUsedPdfTextFontNames(await readUsedPdfTextFontNames(bytes));
}

export function verifyUsedPdfTextFontNames(fontNames: readonly string[]): void {
  if (fontNames.length === 0 || fontNames.some((name) => !approvedPdfFontName.test(name))) {
    throw new Error("Every retained PDF text item must use embedded Arimo");
  }
}
