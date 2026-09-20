import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import {
  automatedChecks,
  electronScenarioGroups,
  humanChecks,
  releaseStages,
  requirementMappings,
  specificationSectionMappings,
} from "./release-plan.js";

const packageScriptsSchema = z.object({
  scripts: z.object({
    "check:quality": z.string(),
  }),
});

describe("local release gate", () => {
  it("runs every release-blocking stage in the specified order", () => {
    expect(releaseStages.map(({ name }) => name)).toEqual([
      "shared quality gate",
      "domain and persistence tests",
      "React tests",
      "production build",
      "Playwright Electron journeys",
      "PDF verification",
      "arm64 DMG packaging",
      "packaged release candidate inspection",
    ]);
  });

  it("keeps the shared quality gate independent of network services", async () => {
    const packageJsonInput: unknown = JSON.parse(
      await readFile(join(process.cwd(), "package.json"), "utf8"),
    );
    const packageScripts = packageScriptsSchema.parse(packageJsonInput).scripts;
    const qualityStage = releaseStages.find(({ id }) => id === "quality");

    expect(qualityStage?.command).toContain("vp run check:runtime");
    expect(packageScripts["check:quality"]).toContain("react-doctor");
    expect(packageScripts["check:quality"]).toContain("--no-score");
    expect(packageScripts["check:quality"]).toContain("--no-telemetry");
    expect(packageScripts["check:quality"]).toContain("--no-supply-chain");
  });

  it("uses tracked production baselines for release-blocking PDF evidence", () => {
    const pdfStage = releaseStages.find(({ id }) => id === "pdf");
    const rasterCheck = automatedChecks.find(({ id }) => id === "pdf-raster-fidelity");

    expect(pdfStage?.command).toContain("--project=pdf");
    expect(pdfStage?.command).not.toContain("supplied reference invoice");
    expect(pdfStage?.command).toContain("GBP UK VAT invoice");
    expect(pdfStage?.command).toContain("multi-item invoice");
    expect(rasterCheck).toMatchObject({
      evidence: {
        kind: "tests",
        titleFragments: [
          "GBP UK VAT invoice keeps exact tax facts",
          "foreign-currency UK VAT invoice retains sterling evidence",
          "multi-item invoice recovers, credits, replaces, and retains exact PDFs",
        ],
      },
    });
  });

  it("lets Playwright projects own the accepted Electron and PDF test inventories", () => {
    const electronStage = releaseStages.find(({ id }) => id === "electron");
    const pdfStage = releaseStages.find(({ id }) => id === "pdf");

    expect(electronStage?.command).toContain("check:evidence-retention");
    expect(electronStage?.command).toContain("playwright test --project=electron");
    expect(pdfStage?.command).toContain("playwright test --project=pdf");
    expect(electronStage?.command).not.toContain(".spec.ts");
    expect(pdfStage?.command).not.toContain(".spec.ts");
  });

  it("maps every numbered specification requirement to named evidence", () => {
    const mappedRequirements = requirementMappings
      .flatMap(({ requirements }) => requirements)
      .sort((first, second) => first - second);
    const automatedCheckIds = new Set(automatedChecks.map(({ id }) => id));
    const humanCheckIds = new Set(humanChecks.map(({ id }) => id));

    expect(mappedRequirements).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
    for (const mapping of requirementMappings) {
      expect(mapping.automatedCheckIds.length + mapping.humanCheckIds.length).toBeGreaterThan(0);
      expect(mapping.automatedCheckIds.every((id) => automatedCheckIds.has(id))).toBe(true);
      expect(mapping.humanCheckIds.every((id) => humanCheckIds.has(id))).toBe(true);
    }
  });

  it("names all nine Electron scenario groups", () => {
    expect(electronScenarioGroups.map(({ id }) => id)).toEqual([
      "electron-01-fresh-setup",
      "electron-02-draft-lifecycle",
      "electron-03-validation-and-issue",
      "electron-04-outside-scope",
      "electron-05-foreign-currency-vat",
      "electron-06-failure-matrix",
      "electron-07-correction-chain",
      "electron-08-backup-and-recovery",
      "electron-09-history-and-immutability",
    ]);
  });

  it("keeps every exact-artifact approval explicitly human-owned", () => {
    expect(humanChecks.map(({ id }) => id)).toEqual([
      "human-gatekeeper-install",
      "human-existing-dataset-launch",
      "human-newer-dataset-refusal",
      "human-invoice-output-approval",
      "human-credit-note-output-approval",
    ]);
  });

  it("maps every normative specification section to named evidence", () => {
    const automatedCheckIds = new Set(automatedChecks.map(({ id }) => id));
    const humanCheckIds = new Set(humanChecks.map(({ id }) => id));

    expect(specificationSectionMappings.map(({ section }) => section)).toEqual([
      "product-and-navigation",
      "application-structure-and-test-boundaries",
      "issuer-clients-and-draft",
      "validation-and-normalization",
      "currency-vat-and-calculations",
      "issue-sequences-and-immutable-history",
      "full-credit-notes-and-replacement-invoices",
      "local-dataset-backup-and-recovery",
      "shared-document-and-pdf-output",
      "electron-security-and-offline-operation",
      "toolchain-and-repository-replacement",
      "packaging-and-updates",
      "what-a-good-test-proves",
      "module-coverage",
      "domain-fixture-matrix",
      "failure-matrix",
      "production-electron-journeys",
      "pdf-verification",
      "electron-and-package-verification",
      "authoritative-command-and-evidence",
      "out-of-scope",
    ]);
    for (const mapping of specificationSectionMappings) {
      expect(mapping.automatedCheckIds.length + mapping.humanCheckIds.length).toBeGreaterThan(0);
      expect(mapping.automatedCheckIds.every((id) => automatedCheckIds.has(id))).toBe(true);
      expect(mapping.humanCheckIds.every((id) => humanCheckIds.has(id))).toBe(true);
    }
  });
});
