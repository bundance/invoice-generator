import { defineConfig } from "@playwright/test";

const outputDirectory = process.env.INVOICE_GENERATOR_EVIDENCE_PROBE_OUTPUT;
if (!outputDirectory) throw new Error("The evidence probe output directory is required");

export default defineConfig({
  forbidOnly: true,
  outputDir: outputDirectory,
  reporter: "line",
  retries: 0,
  testDir: "./tests/e2e/probes",
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  workers: 1,
});
