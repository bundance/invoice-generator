import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { expect, test as base, type TestInfo } from "@playwright/test";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";

import { decideEvidenceRetention } from "../../../src/infrastructure/release-gate/evidence-policy.js";
import type { FaultPoint } from "../../../src/infrastructure/testing/fault-injection.js";

type JourneyRun = {
  readonly applications: Map<ElectronApplication, string>;
  readonly evidenceDirectory: string;
  readonly networkLogs: string[];
  readonly temporaryPaths: Set<string>;
  readonly writes: Promise<void>[];
  launchCount: number;
};

let activeRun: JourneyRun | null = null;

export const test = base.extend<{ electronEvidence: void }>({
  electronEvidence: [
    async ({ browserName: _browserName }, runTest, testInfo) => {
      const run: JourneyRun = {
        applications: new Map(),
        evidenceDirectory: testInfo.outputPath("electron-evidence"),
        launchCount: 0,
        networkLogs: [],
        temporaryPaths: new Set(),
        writes: [],
      };
      activeRun = run;

      try {
        await runTest();
      } finally {
        try {
          await finishJourney(run, testInfo);
        } finally {
          activeRun = null;
        }
      }
    },
    { auto: true },
  ],
});

export { expect };

export async function createUserDataPath(name: string): Promise<string> {
  const userDataPath = await mkdtemp(join(tmpdir(), `invoice-generator-${name}-`));
  requireActiveRun().temporaryPaths.add(userDataPath);
  return userDataPath;
}

export async function launchProductionApp(
  userDataPath: string,
  faultPlan: readonly FaultPoint[] = [],
): Promise<ElectronApplication> {
  const run = requireActiveRun();
  run.launchCount += 1;
  const launchDirectory = join(run.evidenceDirectory, `launch-${run.launchCount}`);
  const mainOutputPath = join(launchDirectory, "main-process.stdout.log");
  const mainErrorPath = join(launchDirectory, "main-process.stderr.log");
  const rendererLogPath = join(launchDirectory, "renderer.log");
  const networkLogPath = join(launchDirectory, "network-requests.log");
  await mkdir(launchDirectory, { recursive: true });
  await Promise.all(
    [mainOutputPath, mainErrorPath, rendererLogPath, networkLogPath].map((path) =>
      writeFile(path, ""),
    ),
  );

  const electronApplication = await electron.launch({
    args: ["dist-electron/main.cjs", `--user-data-dir=${userDataPath}`],
    env: {
      ...createProductionEnvironment(),
      INVOICE_GENERATOR_TEST_FAULTS: JSON.stringify(faultPlan),
      INVOICE_GENERATOR_TEST_HIDE_WINDOW: "1",
      INVOICE_GENERATOR_TEST_NETWORK_LOG: networkLogPath,
    },
  });
  run.applications.set(electronApplication, launchDirectory);
  run.networkLogs.push(networkLogPath);

  const applicationProcess = electronApplication.process();
  applicationProcess.stdout?.on("data", (chunk: Buffer) =>
    queueLogWrite(run, mainOutputPath, chunk),
  );
  applicationProcess.stderr?.on("data", (chunk: Buffer) =>
    queueLogWrite(run, mainErrorPath, chunk),
  );
  for (const page of electronApplication.context().pages()) {
    recordRendererLogs(run, page, rendererLogPath);
  }
  electronApplication.on("window", (page) => recordRendererLogs(run, page, rendererLogPath));

  return electronApplication;
}

export async function closeApp(electronApplication: ElectronApplication): Promise<void> {
  const run = activeRun;
  try {
    if (run) await captureApplicationScreenshots(run, electronApplication);
  } finally {
    await electronApplication.close();
    run?.applications.delete(electronApplication);
  }
}

function createProductionEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name !== "VITE_DEV_SERVER_URL"),
  );
}

function requireActiveRun(): JourneyRun {
  if (!activeRun) {
    throw new Error("Electron journey helpers must run inside the shared Playwright fixture");
  }
  return activeRun;
}

function recordRendererLogs(run: JourneyRun, page: Page, rendererLogPath: string): void {
  page.on("console", (message) => {
    queueLogWrite(run, rendererLogPath, `[console:${message.type()}] ${message.text()}\n`);
  });
  page.on("pageerror", (error) => {
    queueLogWrite(run, rendererLogPath, `[pageerror] ${error.stack ?? error.message}\n`);
  });
}

function queueLogWrite(run: JourneyRun, path: string, content: string | Buffer): void {
  run.writes.push(appendFile(path, content));
}

async function finishJourney(run: JourneyRun, testInfo: TestInfo): Promise<void> {
  await Promise.allSettled(
    [...run.applications.keys()].map((electronApplication) => closeApp(electronApplication)),
  );
  await Promise.allSettled(run.writes);

  const attemptedNetworkRequests = (
    await Promise.all(run.networkLogs.map((path) => readFile(path, "utf8")))
  )
    .flatMap((contents) => contents.split("\n"))
    .filter((url) => url.length > 0);
  const decision = decideEvidenceRetention({
    attemptedNetworkRequests,
    testStatus: testInfo.status ?? "interrupted",
  });

  if (decision.kind === "remove") {
    await removeTemporaryPaths(run.temporaryPaths);
    await rm(run.evidenceDirectory, { force: true, recursive: true });
    return;
  }

  const datasetsDirectory = join(run.evidenceDirectory, "isolated-datasets");
  await mkdir(datasetsDirectory, { recursive: true });
  const retainedDatasets: string[] = [];
  for (const temporaryPath of run.temporaryPaths) {
    const retainedPath = join(datasetsDirectory, basename(temporaryPath));
    try {
      await cp(temporaryPath, retainedPath, { recursive: true });
      retainedDatasets.push(retainedPath);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  await writeFile(
    join(run.evidenceDirectory, "failure-manifest.json"),
    `${JSON.stringify({ problems: decision.problems, retainedDatasets }, null, 2)}\n`,
  );
  await removeTemporaryPaths(run.temporaryPaths);

  if (attemptedNetworkRequests.length > 0) {
    throw new Error(decision.problems.join("\n"));
  }
}

async function captureApplicationScreenshots(
  run: JourneyRun,
  electronApplication: ElectronApplication,
): Promise<void> {
  const launchDirectory = run.applications.get(electronApplication);
  if (!launchDirectory) return;

  const openPages = electronApplication
    .context()
    .pages()
    .filter((page) => !page.isClosed());
  await Promise.allSettled(
    openPages.map((page, index) =>
      page.screenshot({ path: join(launchDirectory, `final-window-${index + 1}.png`) }),
    ),
  );
}

async function removeTemporaryPaths(paths: ReadonlySet<string>): Promise<void> {
  await Promise.all([...paths].map((path) => rm(path, { force: true, recursive: true })));
}
