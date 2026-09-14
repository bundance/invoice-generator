import { describe, expect, it } from "vite-plus/test";

import { verifyEmbeddedArimoFonts } from "./pdf-font-report.js";

describe("PDF font report", () => {
  it("accepts every embedded Unicode Arimo font row", () => {
    expect(() =>
      verifyEmbeddedArimoFonts(`name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
AAAAAA+Arimo-Regular                 CID TrueType      Identity-H       yes yes yes      8  0
BBBBBB+Arimo-Bold                    CID TrueType      Identity-H       yes yes yes     12  0`),
    ).not.toThrow();
  });

  it("rejects one fallback font even when another row is embedded Arimo", () => {
    expect(() =>
      verifyEmbeddedArimoFonts(`name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
AAAAAA+Arimo-Regular                 CID TrueType      Identity-H       yes yes yes      8  0
BBBBBB+ArialMT                       CID TrueType      Identity-H       yes yes yes     12  0`),
    ).toThrow("The retained PDF must use only embedded Unicode Arimo fonts");
  });

  it("rejects an unembedded Arimo row", () => {
    expect(() =>
      verifyEmbeddedArimoFonts(`name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
Arimo-Regular                        TrueType          WinAnsi          no  no  no       8  0`),
    ).toThrow("The retained PDF must use only embedded Unicode Arimo fonts");
  });
});
