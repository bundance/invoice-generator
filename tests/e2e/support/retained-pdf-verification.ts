import { execFileSync, spawnSync } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { coderneticWordmarkDataUrl } from "../../../src/documents/codernetic-wordmark.js";
import { verifyEmbeddedArimoFonts } from "../../../src/documents/pdf-font-report.js";

type VerifyRetainedInvoicePdfOptions = Readonly<{
  rasterBaselinePath?: string;
  pdfPath: string;
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
  rasterBaselinePath,
  pdfPath,
  requiredText,
  workingDirectory,
}: VerifyRetainedInvoicePdfOptions): Promise<void> {
  await mkdir(workingDirectory, { recursive: true });
  verifyA4Document(pdfPath);
  verifySelectableText(pdfPath, requiredText);
  verifyEmbeddedFont(pdfPath);
  await verifyExactWordmark(pdfPath, workingDirectory);
  const rasterPath = await rasterizePdf(pdfPath, workingDirectory);
  if (rasterBaselinePath) compareRaster({ baselinePath: rasterBaselinePath, rasterPath });
}

export async function verifyPdfRasterBaseline({
  baselinePath,
  pdfPath,
  workingDirectory,
}: VerifyPdfRasterBaselineOptions): Promise<void> {
  await mkdir(workingDirectory, { recursive: true });
  const rasterPath = await rasterizePdf(pdfPath, workingDirectory);
  compareRaster({ baselinePath, rasterPath });
}

function run(command: string, arguments_: readonly string[]): string {
  return execFileSync(command, arguments_, { encoding: "utf8", timeout: 30_000 });
}

function verifyA4Document(pdfPath: string): void {
  const info = run("pdfinfo", [pdfPath]);
  if (!/^Pages:\s+1$/mu.test(info)) throw new Error("The retained PDF must have one page");
  if (!/^Tagged:\s+yes$/mu.test(info)) throw new Error("The retained PDF must be tagged");
  const pageSize = /^Page size:\s+([\d.]+) x ([\d.]+) pts \(A4\)$/mu.exec(info);
  if (!pageSize) throw new Error("The retained PDF must report an A4 page");
  const width = Number(pageSize[1]);
  const height = Number(pageSize[2]);
  if (Math.abs(width - 595.28) >= 1 || Math.abs(height - 841.89) >= 1) {
    throw new Error("The retained PDF has the wrong A4 dimensions");
  }
}

function verifySelectableText(pdfPath: string, requiredText: readonly string[]): void {
  const text = run("pdftotext", ["-layout", pdfPath, "-"]);
  for (const expectedText of requiredText) {
    if (!text.includes(expectedText)) {
      throw new Error(`The retained PDF is missing selectable text: ${expectedText}`);
    }
  }
}

function verifyEmbeddedFont(pdfPath: string): void {
  verifyEmbeddedArimoFonts(run("pdffonts", [pdfPath]));
}

async function verifyExactWordmark(pdfPath: string, workingDirectory: string): Promise<void> {
  const images = run("pdfimages", ["-list", pdfPath]);
  if (!/\s334\s+72\s/u.test(images)) {
    throw new Error("The retained PDF must contain the native Codernetic wordmark");
  }

  const imagePrefix = join(workingDirectory, "wordmark-image");
  run("pdfimages", ["-png", pdfPath, imagePrefix]);
  const extractedWordmark = join(workingDirectory, "extracted-wordmark.png");
  run("magick", [
    `${imagePrefix}-000.png`,
    `${imagePrefix}-001.png`,
    "-alpha",
    "off",
    "-compose",
    "CopyOpacity",
    "-composite",
    extractedWordmark,
  ]);
  const sourceWordmark = join(workingDirectory, "source-wordmark.png");
  await writeFile(sourceWordmark, decodeDataUrl(coderneticWordmarkDataUrl));
  const comparison = spawnSync(
    "magick",
    ["compare", "-metric", "AE", sourceWordmark, extractedWordmark, "null:"],
    { encoding: "utf8", timeout: 30_000 },
  );
  const changedPixels = Number(comparison.stderr.trim().split(" ")[0]);
  if (changedPixels !== 0) throw new Error("The retained PDF changed the wordmark pixels");
}

async function rasterizePdf(pdfPath: string, workingDirectory: string): Promise<string> {
  const renderPrefix = join(workingDirectory, "retained-invoice");
  const rasterPath = `${renderPrefix}.png`;
  run("pdftoppm", ["-png", "-r", String(rasterDpi), "-singlefile", pdfPath, renderPrefix]);
  await access(rasterPath);
  return rasterPath;
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
