type ReleaseStage = Readonly<{
  command: string;
  id: string;
  name: string;
  result?: Readonly<{ kind: "playwright" | "vitest"; path: string }>;
}>;

type HumanCheck = Readonly<{
  id: string;
  name: string;
}>;

type RequirementMapping = Readonly<{
  automatedCheckIds: readonly string[];
  humanCheckIds: readonly string[];
  requirements: readonly number[];
}>;

type SpecificationSectionMapping = Readonly<{
  automatedCheckIds: readonly string[];
  humanCheckIds: readonly string[];
  section: string;
}>;

export const releaseStages = [
  {
    command:
      "timeout 30 vp run check:runtime && timeout 300 vp run check:quality && timeout 60 vp run check:fallow-plugins",
    id: "quality",
    name: "shared quality gate",
  },
  {
    command:
      "timeout 60 vp run check:test-policy && timeout 300 vp test run src/domain src/application src/infrastructure/persistence src/infrastructure/testing src/infrastructure/release-gate src/infrastructure/electron/billing-pdf-engine.test.tsx src/infrastructure/electron/invoice-pdf.test.ts --allowOnly=false --retry=0 --reporter=json --outputFile=test-results/domain-persistence.json",
    id: "domain-persistence",
    name: "domain and persistence tests",
    result: { kind: "vitest", path: "test-results/domain-persistence.json" },
  },
  {
    command:
      "timeout 300 vp test run src/renderer src/documents --allowOnly=false --retry=0 --reporter=json --outputFile=test-results/react.json",
    id: "react",
    name: "React tests",
    result: { kind: "vitest", path: "test-results/react.json" },
  },
  {
    command: "timeout 300 vp build",
    id: "build",
    name: "production build",
  },
  {
    command:
      "timeout 180 vp run check:evidence-retention && timeout 600 env PLAYWRIGHT_JSON_OUTPUT_FILE=test-results/electron.json playwright test --project=electron --reporter=line,json",
    id: "electron",
    name: "Playwright Electron journeys",
    result: { kind: "playwright", path: "test-results/electron.json" },
  },
  {
    command:
      'timeout 300 env PLAYWRIGHT_JSON_OUTPUT_FILE=test-results/pdf.json playwright test --project=pdf --grep "GBP UK VAT invoice|foreign-currency UK VAT invoice|30-row invoice|multi-item invoice" --reporter=line,json',
    id: "pdf",
    name: "PDF verification",
    result: { kind: "playwright", path: "test-results/pdf.json" },
  },
  {
    command: "timeout 300 vp run package:mac",
    id: "package",
    name: "arm64 DMG packaging",
  },
  {
    command: "timeout 120 vp run inspect:package",
    id: "inspect-package",
    name: "packaged release candidate inspection",
  },
] as const satisfies readonly ReleaseStage[];

export type ReleaseStageId = (typeof releaseStages)[number]["id"];

type NamedCheckEvidence =
  | Readonly<{ kind: "stage" }>
  | Readonly<{ kind: "tests"; titleFragments: readonly [string, ...string[]] }>;

type NamedCheck = Readonly<{
  evidence: NamedCheckEvidence;
  id: string;
  name: string;
  stageId: ReleaseStageId;
}>;

export const electronScenarioGroups = [
  namedCheck(
    "electron-01-fresh-setup",
    "Fresh launch, setup, and four empty destinations",
    "electron",
    ["fresh production launch creates the fixed local workspace"],
  ),
  namedCheck(
    "electron-02-draft-lifecycle",
    "Draft preview, save, restart, navigation, and discard",
    "electron",
    ["outside-scope draft autosaves, resumes after restart"],
  ),
  namedCheck(
    "electron-03-validation-and-issue",
    "Validation summary, keyboard focus, confirmation, warning, and issue",
    "electron",
    ["GBP UK VAT invoice keeps exact tax facts"],
  ),
  namedCheck("electron-04-outside-scope", "Outside-scope and reverse-charge issue", "electron", [
    "multi-item invoice recovers, credits, replaces, and retains exact PDFs",
  ]),
  namedCheck(
    "electron-05-foreign-currency-vat",
    "Foreign-currency UK VAT issue and sterling summary",
    "electron",
    ["foreign-currency UK VAT invoice retains sterling evidence"],
  ),
  namedCheck("electron-06-failure-matrix", "PDF and durable-state failure matrix", "electron", [
    "post-commit document failures keep the issued invoice",
  ]),
  namedCheck(
    "electron-07-correction-chain",
    "Full credit and repeated replacement chain",
    "electron",
    ["multi-item invoice recovers, credits, replaces, and retains exact PDFs"],
  ),
  namedCheck(
    "electron-08-backup-and-recovery",
    "Backup, replacement restore, and blocked recovery states",
    "electron",
    ["Settings validates, cancels, and completes a whole-dataset restore"],
  ),
  namedCheck(
    "electron-09-history-and-immutability",
    "History search, retained output, locked identity, and immutable snapshots",
    "electron",
    ["used client stays locked"],
  ),
] as const satisfies readonly NamedCheck[];

export const automatedChecks = [
  namedCheck("toolchain-node-runtime", "Pinned Node.js release runtime", "quality"),
  namedCheck("quality-vite-plus", "Vite+ format, lint, and type checks", "quality"),
  namedCheck("quality-react-doctor", "Full blocking React Doctor scan", "quality"),
  namedCheck(
    "quality-fallow",
    "Full blocking Fallow scan with Electron and Vite plugins",
    "quality",
  ),
  namedCheck(
    "domain-fixture-matrix",
    "Currency, VAT, exchange, rounding, and correction fixtures",
    "domain-persistence",
  ),
  namedCheck(
    "domain-boundary-matrix",
    "Normalization, dates, amounts, text, and identifier boundaries",
    "domain-persistence",
  ),
  namedCheck(
    "persistence-lifecycle-matrix",
    "Atomic state, retained PDF, backup, restore, and cleanup lifecycle",
    "domain-persistence",
  ),
  namedCheck(
    "failure-injection-matrix",
    "Named pre-commit and post-commit failure injection",
    "domain-persistence",
  ),
  namedCheck(
    "react-interaction-matrix",
    "Validation timing, status, dialogs, conflicts, and focus",
    "react",
  ),
  namedCheck(
    "test-policy",
    "No skipped, pending, quarantined, focused, or retried tests",
    "domain-persistence",
  ),
  ...electronScenarioGroups,
  namedCheck(
    "electron-zero-network",
    "Zero HTTP, HTTPS, WebSocket, or secure WebSocket requests",
    "electron",
    ["production window exposes only the guarded sandboxed workspace bridge"],
  ),
  namedCheck(
    "electron-failure-evidence",
    "Failed-journey dataset, trace, screenshot, and process logs",
    "electron",
  ),
  namedCheck(
    "pdf-structure-and-fit",
    "PDF structure, A4 fit, selectable text, fonts, and wordmark",
    "pdf",
    [
      "GBP UK VAT invoice keeps exact tax facts",
      "30-row invoice and full credit note retain every multi-page PDF page",
      "multi-item invoice recovers, credits, replaces, and retains exact PDFs",
    ],
  ),
  namedCheck(
    "pdf-raster-fidelity",
    "Frozen fixed-DPI invoice and credit-note raster baselines",
    "pdf",
    [
      "GBP UK VAT invoice keeps exact tax facts",
      "foreign-currency UK VAT invoice retains sterling evidence",
      "30-row invoice and full credit note retain every multi-page PDF page",
      "multi-item invoice recovers, credits, replaces, and retains exact PDFs",
    ],
  ),
  namedCheck(
    "package-release-candidate",
    "Exact arm64 DMG identity and package contract",
    "inspect-package",
  ),
  namedCheck(
    "successful-run-cleanup",
    "Successful-run temporary evidence cleanup",
    "inspect-package",
  ),
  namedCheck(
    "named-check-report",
    "Exact-artifact stage, scenario, and approval report",
    "inspect-package",
  ),
] as const satisfies readonly NamedCheck[];

export const humanChecks = [
  humanCheck(
    "human-gatekeeper-install",
    "Install this exact DMG by dragging the app to Applications and complete Gatekeeper Open Anyway",
  ),
  humanCheck(
    "human-existing-dataset-launch",
    "Launch this exact installed app with an existing supported dataset and confirm the dataset is preserved",
  ),
  humanCheck(
    "human-newer-dataset-refusal",
    "Launch this exact installed app with a disposable newer unsupported dataset and confirm refusal without mutation",
  ),
  humanCheck(
    "human-invoice-output-approval",
    "Approve the representative invoice output produced by this exact release candidate",
  ),
  humanCheck(
    "human-credit-note-output-approval",
    "Approve the representative credit-note output produced by this exact release candidate",
  ),
] as const satisfies readonly HumanCheck[];

export const requirementMappings = [
  mapRequirements(1, 7, ["electron-01-fresh-setup"]),
  mapRequirements(8, 13, ["electron-02-draft-lifecycle", "persistence-lifecycle-matrix"]),
  mapRequirements(14, 24, [
    "react-interaction-matrix",
    "electron-02-draft-lifecycle",
    "electron-03-validation-and-issue",
  ]),
  mapRequirements(25, 31, ["domain-boundary-matrix", "electron-09-history-and-immutability"]),
  mapRequirements(32, 51, ["domain-fixture-matrix", "domain-boundary-matrix"]),
  mapRequirements(52, 62, [
    "electron-03-validation-and-issue",
    "electron-06-failure-matrix",
    "failure-injection-matrix",
  ]),
  mapRequirements(63, 77, ["domain-fixture-matrix", "electron-07-correction-chain"]),
  mapRequirements(78, 80, ["electron-01-fresh-setup", "electron-09-history-and-immutability"]),
  mapRequirements(81, 89, ["persistence-lifecycle-matrix", "electron-08-backup-and-recovery"]),
  mapRequirements(90, 90, ["electron-09-history-and-immutability"]),
  mapRequirements(91, 91, ["electron-zero-network"]),
  mapRequirements(92, 92, ["package-release-candidate"], ["human-gatekeeper-install"]),
  mapRequirements(93, 93, ["package-release-candidate"], ["human-existing-dataset-launch"]),
  mapRequirements(94, 94, ["electron-08-backup-and-recovery"], ["human-newer-dataset-refusal"]),
  mapRequirements(95, 95, ["quality-vite-plus", "quality-react-doctor", "quality-fallow"]),
  mapRequirements(96, 96, ["test-policy"]),
  mapRequirements(97, 97, ["electron-failure-evidence"]),
  mapRequirements(98, 98, ["successful-run-cleanup", "named-check-report"]),
  mapRequirements(
    99,
    99,
    ["pdf-raster-fidelity"],
    ["human-invoice-output-approval", "human-credit-note-output-approval"],
  ),
  mapRequirements(100, 100, ["electron-09-history-and-immutability"]),
] as const satisfies readonly RequirementMapping[];

export const specificationSectionMappings = [
  mapSection("product-and-navigation", ["electron-01-fresh-setup"]),
  mapSection("application-structure-and-test-boundaries", [
    "domain-fixture-matrix",
    "react-interaction-matrix",
    "electron-09-history-and-immutability",
  ]),
  mapSection("issuer-clients-and-draft", [
    "electron-01-fresh-setup",
    "electron-02-draft-lifecycle",
  ]),
  mapSection("validation-and-normalization", [
    "domain-boundary-matrix",
    "react-interaction-matrix",
    "electron-03-validation-and-issue",
  ]),
  mapSection("currency-vat-and-calculations", [
    "domain-fixture-matrix",
    "electron-04-outside-scope",
    "electron-05-foreign-currency-vat",
  ]),
  mapSection("issue-sequences-and-immutable-history", [
    "domain-fixture-matrix",
    "electron-03-validation-and-issue",
    "electron-06-failure-matrix",
    "electron-09-history-and-immutability",
  ]),
  mapSection("full-credit-notes-and-replacement-invoices", [
    "domain-fixture-matrix",
    "electron-07-correction-chain",
  ]),
  mapSection("local-dataset-backup-and-recovery", [
    "persistence-lifecycle-matrix",
    "electron-08-backup-and-recovery",
  ]),
  mapSection(
    "shared-document-and-pdf-output",
    ["pdf-structure-and-fit", "pdf-raster-fidelity"],
    ["human-invoice-output-approval", "human-credit-note-output-approval"],
  ),
  mapSection("electron-security-and-offline-operation", [
    "electron-zero-network",
    "electron-09-history-and-immutability",
  ]),
  mapSection("toolchain-and-repository-replacement", [
    "quality-vite-plus",
    "quality-react-doctor",
    "quality-fallow",
  ]),
  mapSection(
    "packaging-and-updates",
    ["package-release-candidate"],
    ["human-gatekeeper-install", "human-existing-dataset-launch"],
  ),
  mapSection("what-a-good-test-proves", ["test-policy"]),
  mapSection("module-coverage", [
    "domain-fixture-matrix",
    "persistence-lifecycle-matrix",
    "react-interaction-matrix",
    "electron-09-history-and-immutability",
    "pdf-structure-and-fit",
    "package-release-candidate",
  ]),
  mapSection("domain-fixture-matrix", ["domain-fixture-matrix"]),
  mapSection("failure-matrix", ["failure-injection-matrix", "electron-06-failure-matrix"]),
  mapSection(
    "production-electron-journeys",
    electronScenarioGroups.map(({ id }) => id),
  ),
  mapSection(
    "pdf-verification",
    ["pdf-structure-and-fit", "pdf-raster-fidelity"],
    ["human-invoice-output-approval", "human-credit-note-output-approval"],
  ),
  mapSection("electron-and-package-verification", [
    "electron-zero-network",
    "electron-09-history-and-immutability",
    "package-release-candidate",
  ]),
  mapSection("authoritative-command-and-evidence", [
    "test-policy",
    "electron-failure-evidence",
    "successful-run-cleanup",
    "named-check-report",
  ]),
  mapSection("out-of-scope", ["electron-zero-network", "package-release-candidate"]),
] as const satisfies readonly SpecificationSectionMapping[];

function namedCheck(
  id: string,
  name: string,
  stageId: NamedCheck["stageId"],
  evidenceTestTitleFragments?: readonly [string, ...string[]],
): NamedCheck {
  return {
    evidence: evidenceTestTitleFragments
      ? { kind: "tests", titleFragments: evidenceTestTitleFragments }
      : { kind: "stage" },
    id,
    name,
    stageId,
  };
}

function humanCheck(id: string, name: string): HumanCheck {
  return { id, name };
}

function mapRequirements(
  first: number,
  last: number,
  automatedCheckIds: readonly string[],
  humanCheckIds: readonly string[] = [],
): RequirementMapping {
  return {
    automatedCheckIds,
    humanCheckIds,
    requirements: Array.from({ length: last - first + 1 }, (_, index) => first + index),
  };
}

function mapSection(
  section: string,
  automatedCheckIds: readonly string[],
  humanCheckIds: readonly string[] = [],
): SpecificationSectionMapping {
  return { automatedCheckIds, humanCheckIds, section };
}
