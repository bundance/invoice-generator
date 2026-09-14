import { join } from "node:path";

import { test } from "@playwright/test";

import { verifyPdfRasterBaseline } from "./support/retained-pdf-verification.js";

const repositoryRoot = join(import.meta.dirname, "../..");

test("the supplied reference invoice matches its approved 144 DPI raster", async ({
  browserName: _browserName,
}, testInfo) => {
  await verifyPdfRasterBaseline({
    baselinePath: join(repositoryRoot, "tests/baselines/pdf/reference-invoice-144dpi.png"),
    pdfPath: join(repositoryRoot, "docs/Codernetic-invoice-GGIOHK-0043.pdf"),
    workingDirectory: testInfo.outputPath("reference-invoice"),
  });
});
