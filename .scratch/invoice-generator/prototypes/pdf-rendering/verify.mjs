import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = new URL("../../../..", import.meta.url).pathname;
const outputDirectory = join(repositoryRoot, "output/pdf");
const renderDirectory = join(repositoryRoot, "tmp/pdfs/pdf-rendering-proof");
const sourceLogo = new URL("assets/codernetic-wordmark.png", import.meta.url).pathname;
const documents = [
  {
    filename: "GGIOHK-0043.pdf",
    requiredText: [
      "INVOICE GGIOHK-0043",
      "Genesis Global",
      "$1,450.00",
      "Company Reg. No. 8822243",
    ],
  },
  {
    filename: "CN-GGIOHK-0043.pdf",
    requiredText: [
      "CREDIT NOTE CN-GGIOHK-0043",
      "References invoice GGIOHK-0043",
      "-$1,450.00",
      "The billed service period was incorrect.",
    ],
  },
];

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8" });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

mkdirSync(renderDirectory, { recursive: true });

const results = documents.map(({ filename, requiredText }) => {
  const pdfPath = join(outputDirectory, filename);
  assert(existsSync(pdfPath), `Missing ${filename}`);

  const info = run("pdfinfo", [pdfPath]);
  assert(/^Pages:\s+1$/m.test(info), `${filename} must have one page`);
  const pageSize = info.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts \(A4\)$/m);
  assert(pageSize, `${filename} must report an A4 page`);
  assert(Math.abs(Number(pageSize[1]) - 595.28) < 1, `${filename} has the wrong A4 width`);
  assert(Math.abs(Number(pageSize[2]) - 841.89) < 1, `${filename} has the wrong A4 height`);

  const text = run("pdftotext", ["-layout", pdfPath, "-"]);
  for (const expectedText of requiredText) {
    assert(text.includes(expectedText), `${filename} is missing selectable text: ${expectedText}`);
  }

  const fonts = run("pdffonts", [pdfPath]);
  assert(/\s+yes\s+yes\s+yes\s+/m.test(fonts), `${filename} must embed its text font`);

  const images = run("pdfimages", ["-list", pdfPath]);
  assert(/\s334\s+72\s/.test(images), `${filename} must contain the 334 x 72 Codernetic wordmark`);

  const imagePrefix = join(renderDirectory, filename.replace(".pdf", "-image"));
  run("pdfimages", ["-png", pdfPath, imagePrefix]);
  const extractedLogo = `${imagePrefix}-logo.png`;
  run("magick", [
    `${imagePrefix}-000.png`,
    `${imagePrefix}-001.png`,
    "-alpha",
    "off",
    "-compose",
    "CopyOpacity",
    "-composite",
    extractedLogo,
  ]);
  const logoComparison = spawnSync(
    "magick",
    ["compare", "-metric", "AE", sourceLogo, extractedLogo, "null:"],
    { encoding: "utf8" },
  );
  const changedLogoPixels = Number(logoComparison.stderr.trim().split(" ")[0]);
  assert(changedLogoPixels === 0, `${filename} changed the wordmark pixels`);

  const renderPrefix = join(renderDirectory, filename.replace(".pdf", ""));
  run("pdftoppm", ["-png", "-r", "144", "-singlefile", pdfPath, renderPrefix]);

  return {
    filename,
    pageCount: 1,
    pageSize: "A4",
    selectableText: true,
    embeddedFonts: true,
    exactLogo: true,
    renderedPng: `${renderPrefix}.png`,
  };
});

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
