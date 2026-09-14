import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";

const prototypeDirectory = dirname(fileURLToPath(import.meta.url));
const prototypeUrl = pathToFileURL(join(prototypeDirectory, "index.html"));
const repositoryRoot = join(prototypeDirectory, "../../../..");
const outputDirectory = process.env.PDF_PROTOTYPE_OUTPUT_DIR ?? join(repositoryRoot, "output/pdf");
const isBatchExport = process.argv.includes("--export-all");

const DOCUMENTS = {
  invoice: { filename: "GGIOHK-0043.pdf" },
  creditNote: { filename: "CN-GGIOHK-0043.pdf" },
};

app.disableHardwareAcceleration();

function isDocumentKind(value) {
  return Object.hasOwn(DOCUMENTS, value);
}

function createLockedWindow(options = {}) {
  const window = new BrowserWindow({
    show: options.show ?? false,
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    title: "PDF rendering proof",
    backgroundColor: "#e8e4dc",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(prototypeDirectory, "preload.mjs"),
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!navigationUrl.startsWith(prototypeUrl.href)) event.preventDefault();
  });

  return window;
}

async function loadDocumentWindow(documentKind, options = {}) {
  const window = createLockedWindow();
  const url = new URL(prototypeUrl);
  url.searchParams.set("export", "true");
  url.searchParams.set("document", documentKind);
  if (options.stressFit) url.searchParams.set("stress", "true");

  await window.loadURL(url.href);
  const verification = await window.webContents.executeJavaScript(
    "window.pdfRenderingProof.ready.then(() => window.pdfRenderingProof.verify())",
    true,
  );

  if (verification.fitFailures.length > 0 && !options.allowFitFailures) {
    window.destroy();
    throw new Error(`Document does not fit: ${JSON.stringify(verification.fitMeasurements)}`);
  }

  return { verification, window };
}

async function exportDocument(documentKind) {
  if (!isDocumentKind(documentKind)) throw new TypeError("Unknown document kind");

  const { verification, window } = await loadDocumentWindow(documentKind);
  const pdf = await window.webContents.printToPDF({
    pageSize: "A4",
    preferCSSPageSize: true,
    printBackground: true,
    generateTaggedPDF: true,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  const outputPath = join(outputDirectory, DOCUMENTS[documentKind].filename);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, pdf);
  window.destroy();

  return { ...verification, outputPath };
}

ipcMain.handle("pdf-prototype:export-document", async (event, documentKind) => {
  if (!event.senderFrame.url.startsWith(prototypeUrl.href)) {
    throw new Error("Rejected PDF export from an unknown renderer");
  }

  return exportDocument(documentKind);
});

async function run() {
  if (isBatchExport) {
    const documents = [];
    for (const documentKind of Object.keys(DOCUMENTS)) {
      documents.push(await exportDocument(documentKind));
    }

    const stressedInvoice = await loadDocumentWindow("invoice", {
      stressFit: true,
      allowFitFailures: true,
    });
    const overflowGate = stressedInvoice.verification.fitFailures;
    stressedInvoice.window.destroy();
    if (!overflowGate.includes("service-description")) {
      throw new Error("The renderer fit gate did not find the overflowing service description");
    }

    process.stdout.write(`${JSON.stringify({ documents, overflowGate }, null, 2)}\n`);
    app.quit();
    return;
  }

  const window = createLockedWindow({ show: true });
  await window.loadURL(prototypeUrl.href);
}

void app
  .whenReady()
  .then(run)
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    app.exit(1);
  });

app.on("window-all-closed", () => {
  if (!isBatchExport) app.quit();
});
