import { describe, expect, it } from "vite-plus/test";

import { verifyEmbeddedArimoFonts, verifyUsedPdfTextFontNames } from "./pdf-font-report.js";

describe("PDF font report", () => {
  it("accepts every embedded Unicode Arimo font row", () => {
    expect(() =>
      verifyEmbeddedArimoFonts(`name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
AAAAAA+Arimo-Regular                 CID TrueType      Identity-H       yes yes yes      8  0
BBBBBB+Arimo-Bold                    CID TrueType      Identity-H       yes yes yes     12  0`),
    ).not.toThrow();
  });

  it("accepts PDFKit's unused plain Helvetica resource beside embedded Arimo", () => {
    expect(() =>
      verifyEmbeddedArimoFonts(`name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
AAAAAA+Arimo-Regular                 CID TrueType      Identity-H       yes yes yes      8  0
Helvetica                            Type 1            WinAnsi          no  no  no      12  0`),
    ).not.toThrow();
  });

  it("accepts PDFKit's unused oblique Helvetica resource beside embedded Arimo", () => {
    expect(() =>
      verifyEmbeddedArimoFonts(`name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
AAAAAA+Arimo-Regular                 CID TrueType      Identity-H       yes yes yes      8  0
Helvetica-Oblique                    Type 1            WinAnsi          no  no  no      12  0`),
    ).not.toThrow();
  });

  it("rejects an unproved Helvetica style resource", () => {
    expect(() =>
      verifyEmbeddedArimoFonts(`name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
AAAAAA+Arimo-Regular                 CID TrueType      Identity-H       yes yes yes      8  0
Helvetica-Bold                       Type 1            WinAnsi          no  no  no      12  0`),
    ).toThrow("The retained PDF must embed every document font as Unicode Arimo");
  });

  it("rejects one fallback font even when another row is embedded Arimo", () => {
    expect(() =>
      verifyEmbeddedArimoFonts(`name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
AAAAAA+Arimo-Regular                 CID TrueType      Identity-H       yes yes yes      8  0
BBBBBB+ArialMT                       CID TrueType      Identity-H       yes yes yes     12  0`),
    ).toThrow("The retained PDF must embed every document font as Unicode Arimo");
  });

  it("rejects an unembedded Arimo row", () => {
    expect(() =>
      verifyEmbeddedArimoFonts(`name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
Arimo-Regular                        TrueType          WinAnsi          no  no  no       8  0`),
    ).toThrow("The retained PDF must embed every document font as Unicode Arimo");
  });

  it("rejects a painted fallback font even when embedded Arimo is also used", () => {
    expect(() => verifyUsedPdfTextFontNames(["AAAAAA+Arimo-Regular", "Helvetica"])).toThrow(
      "Every retained PDF text item must use embedded Arimo",
    );
  });

  it("accepts only painted Arimo subsets", () => {
    expect(() =>
      verifyUsedPdfTextFontNames(["AAAAAA+Arimo-Regular", "BBBBBB+Arimo-Bold"]),
    ).not.toThrow();
  });
});
