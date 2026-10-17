import { execFileSync, spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { coderneticWordmarkDataUrl } from "../../../src/documents/codernetic-wordmark.js";
import {
  verifyEmbeddedArimoFonts,
  verifyPdfTextUsesArimo,
} from "../../../src/documents/pdf-font-report.js";

type VerifyRetainedInvoicePdfOptions = Readonly<{
  expectedPageCount?: number;
  orderedText?: readonly string[];
  pdfPath: string;
  rasterBaselinePaths?: readonly string[];
  requiredText: readonly string[];
  workingDirectory: string;
}>;

type VerifyPdfRasterBaselineOptions = Readonly<{
  baselinePath: string;
  pdfPath: string;
  workingDirectory: string;
}>;

const rasterDpi = 144;
const a4RasterSize = { height: 1684, maximumWidth: 1191, minimumWidth: 1190 } as const;
const changedPixelLimit = 0;

export async function verifyRetainedInvoicePdf({
  expectedPageCount,
  orderedText = [],
  pdfPath,
  rasterBaselinePaths,
  requiredText,
  workingDirectory,
}: VerifyRetainedInvoicePdfOptions): Promise<void> {
  await mkdir(workingDirectory, { recursive: true });
  const pageCount = verifyA4Document(pdfPath);
  if (expectedPageCount !== undefined && pageCount !== expectedPageCount) {
    throw new Error(`The retained PDF has ${pageCount} pages; expected ${expectedPageCount}`);
  }
  verifySelectableText(pdfPath, requiredText, orderedText);
  await verifyEmbeddedFont(pdfPath);
  await verifyExactWordmark(pdfPath, pageCount, workingDirectory);
  const rasterPaths = await rasterizePdf(pdfPath, pageCount, workingDirectory);
  if (rasterBaselinePaths) {
    if (rasterBaselinePaths.length !== rasterPaths.length) {
      throw new Error(
        `The retained PDF has ${rasterPaths.length} raster pages; expected ${rasterBaselinePaths.length}`,
      );
    }
    for (const [pageIndex, baselinePath] of rasterBaselinePaths.entries()) {
      const rasterPath = rasterPaths[pageIndex];
      if (!rasterPath) throw new Error(`The retained PDF is missing raster page ${pageIndex + 1}`);
      compareRaster({ baselinePath, rasterPath });
    }
  }
}

export async function verifyPdfRasterBaseline({
  baselinePath,
  pdfPath,
  workingDirectory,
}: VerifyPdfRasterBaselineOptions): Promise<void> {
  await mkdir(workingDirectory, { recursive: true });
  const pageCount = verifyA4Document(pdfPath);
  if (pageCount !== 1) throw new Error("The reference PDF raster fixture must have one page");
  const [rasterPath] = await rasterizePdf(pdfPath, pageCount, workingDirectory);
  if (!rasterPath) throw new Error("The reference PDF raster fixture has no rendered page");
  compareRaster({ baselinePath, rasterPath });
}

function run(command: string, arguments_: readonly string[]): string {
  return execFileSync(command, arguments_, { encoding: "utf8", timeout: 30_000 });
}

function verifyA4Document(pdfPath: string): number {
  const info = run("pdfinfo", [pdfPath]);
  const pageCountMatch = /^Pages:\s+(\d+)$/mu.exec(info);
  const pageCount = Number(pageCountMatch?.[1]);
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error("The retained PDF must have at least one page");
  }
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    verifyA4Page(run("pdfinfo", ["-f", String(pageNumber), "-l", String(pageNumber), pdfPath]));
  }
  return pageCount;
}

function verifyA4Page(info: string): void {
  const pageSize = /^Page(?:\s+\d+)? size:\s+([\d.]+) x ([\d.]+) pts \(A4\)$/mu.exec(info);
  if (!pageSize) throw new Error("Every retained PDF page must report A4 dimensions");
  const width = Number(pageSize[1]);
  const height = Number(pageSize[2]);
  if (Math.abs(width - 595.28) >= 1 || Math.abs(height - 841.89) >= 1) {
    throw new Error("A retained PDF page has the wrong A4 dimensions");
  }
}

function verifySelectableText(
  pdfPath: string,
  requiredText: readonly string[],
  orderedText: readonly string[],
): void {
  const text = run("pdftotext", ["-layout", pdfPath, "-"]);
  for (const expectedText of requiredText) {
    if (!text.includes(expectedText)) {
      throw new Error(`The retained PDF is missing selectable text: ${expectedText}`);
    }
  }
  verifyPageCounters(text);
  verifyOrderedItems(text, orderedText);
  if (text.split(/\bTOTAL\b/gu).length !== 2) {
    throw new Error("The retained PDF must contain its grand total exactly once");
  }
}

function verifyPageCounters(text: string): void {
  const pages = text.split("\f").filter((page) => page.trim().length > 0);
  for (const [index, pageText] of pages.entries()) {
    if (!pageText.includes(`Page ${index + 1} of ${pages.length}`)) {
      throw new Error(`The retained PDF page ${index + 1} is missing its page counter`);
    }
  }
}

function verifyOrderedItems(text: string, orderedText: readonly string[]): void {
  let previousTextIndex = -1;
  for (const expectedText of orderedText) {
    if (text.split(expectedText).length !== 2) {
      throw new Error(
        `The retained PDF must contain each ordered item exactly once: ${expectedText}`,
      );
    }
    const textIndex = text.indexOf(expectedText, previousTextIndex + 1);
    if (textIndex < 0) {
      throw new Error(`The retained PDF is missing ordered selectable text: ${expectedText}`);
    }
    previousTextIndex = textIndex;
  }
}

async function verifyEmbeddedFont(pdfPath: string): Promise<void> {
  verifyEmbeddedArimoFonts(run("pdffonts", [pdfPath]));
  await verifyPdfTextUsesArimo(await readFile(pdfPath));
}

async function verifyExactWordmark(
  pdfPath: string,
  pageCount: number,
  workingDirectory: string,
): Promise<void> {
  const images = run("pdfimages", ["-list", pdfPath]);
  const imageRows = images.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\w+)\s+(\d+)\s+(\d+)\s/u.exec(line);
    return match
      ? [
          {
            height: Number(match[5]),
            imageNumber: Number(match[2]),
            pageNumber: Number(match[1]),
            type: match[3],
            width: Number(match[4]),
          },
        ]
      : [];
  });
  const wordmarkImages = imageRows.filter(
    ({ height, type, width }) => type === "image" && width === 334 && height === 72,
  );
  if (
    wordmarkImages.length !== pageCount ||
    wordmarkImages.some(({ pageNumber }, index) => pageNumber !== index + 1)
  ) {
    throw new Error("Every retained PDF page must contain the native Codernetic wordmark");
  }

  const imagePrefix = join(workingDirectory, "wordmark-image");
  run("pdfimages", ["-png", pdfPath, imagePrefix]);
  const sourceWordmark = join(workingDirectory, "source-wordmark.png");
  await writeFile(sourceWordmark, decodeDataUrl(coderneticWordmarkDataUrl));
  for (const { imageNumber, pageNumber } of wordmarkImages) {
    const imageNumberText = String(imageNumber).padStart(3, "0");
    const maskNumberText = String(imageNumber + 1).padStart(3, "0");
    const mask = imageRows.find(
      (row) => row.imageNumber === imageNumber + 1 && row.pageNumber === pageNumber,
    );
    if (!mask || mask.type !== "smask" || mask.width !== 334 || mask.height !== 72) {
      throw new Error(`PDF page ${pageNumber} is missing the native wordmark transparency mask`);
    }
    const extractedWordmark = join(workingDirectory, `extracted-wordmark-page-${pageNumber}.png`);
    run("magick", [
      `${imagePrefix}-${imageNumberText}.png`,
      `${imagePrefix}-${maskNumberText}.png`,
      "-alpha",
      "off",
      "-compose",
      "CopyOpacity",
      "-composite",
      extractedWordmark,
    ]);
    const comparison = spawnSync(
      "magick",
      ["compare", "-metric", "AE", sourceWordmark, extractedWordmark, "null:"],
      { encoding: "utf8", timeout: 30_000 },
    );
    const changedPixels = Number(comparison.stderr.trim().split(" ")[0]);
    if (changedPixels !== 0) {
      throw new Error(`PDF page ${pageNumber} changed the wordmark pixels`);
    }
  }
}

async function rasterizePdf(
  pdfPath: string,
  pageCount: number,
  workingDirectory: string,
): Promise<readonly string[]> {
  const rasterPaths: string[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const renderPrefix = join(workingDirectory, `retained-invoice-page-${pageNumber}`);
    const rasterPath = `${renderPrefix}.png`;
    run("pdftoppm", [
      "-f",
      String(pageNumber),
      "-l",
      String(pageNumber),
      "-png",
      "-r",
      String(rasterDpi),
      "-singlefile",
      pdfPath,
      renderPrefix,
    ]);
    await access(rasterPath);
    rasterPaths.push(rasterPath);
  }
  return rasterPaths;
}

type CompareRasterOptions = Readonly<{ baselinePath: string; rasterPath: string }>;

function compareRaster({ baselinePath, rasterPath }: CompareRasterOptions): void {
  verifyRasterSize(baselinePath, "baseline");
  verifyRasterSize(rasterPath, "rendered PDF");
  const comparison = spawnSync(
    "magick",
    ["compare", "-metric", "AE", "-format", "%[distortion]", baselinePath, rasterPath, "null:"],
    { encoding: "utf8", timeout: 30_000 },
  );
  if (comparison.error) throw comparison.error;
  const changedPixels = Number(comparison.stdout.trim());
  if (!Number.isFinite(changedPixels) || changedPixels > changedPixelLimit) {
    throw new Error(
      `The PDF raster changed ${changedPixels} pixels; the approved limit is ${changedPixelLimit}`,
    );
  }
}

function verifyRasterSize(path: string, name: string): void {
  const dimensions = run("magick", ["identify", "-format", "%w %h", path]).trim();
  const [widthText, heightText] = dimensions.split(" ");
  const width = Number(widthText);
  const height = Number(heightText);
  const isExpectedA4Raster =
    width >= a4RasterSize.minimumWidth &&
    width <= a4RasterSize.maximumWidth &&
    height === a4RasterSize.height;
  if (!isExpectedA4Raster) {
    throw new Error(
      `The ${name} raster is ${dimensions} pixels; expected 1190-1191 ${a4RasterSize.height} at ${rasterDpi} DPI`,
    );
  }
}

function decodeDataUrl(dataUrl: string): Buffer {
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("The Codernetic wordmark data URL is invalid");
  return Buffer.from(dataUrl.slice(separator + 1), "base64");
}
