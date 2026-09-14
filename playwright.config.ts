import { defineConfig } from "@playwright/test";

export const acceptedTestRetries = 0;

export default defineConfig({
  fullyParallel: false,
  forbidOnly: true,
  projects: [
    {
      name: "electron",
      testIgnore: ["**/pdf-fidelity.spec.ts", "**/probes/**"],
    },
    {
      name: "pdf",
      testMatch: ["**/invoice-issue.spec.ts", "**/pdf-fidelity.spec.ts"],
    },
  ],
  retries: acceptedTestRetries,
  testDir: "./tests/e2e",
  workers: 1,
  reporter: "line",
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
