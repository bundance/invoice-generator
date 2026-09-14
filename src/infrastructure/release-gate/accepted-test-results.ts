import { z } from "zod";

import type { ReleaseStageId } from "./release-plan.ts";

export type PassedTest = Readonly<{
  file: string;
  stageId: ReleaseStageId;
  title: string;
}>;

type CollectedPlaywrightTests = Readonly<{
  results: ReadonlyArray<{ retry: number; status: string }>;
  tests: readonly PassedTest[];
}>;

const vitestReportSchema = z.object({
  numFailedTests: z.number(),
  numPendingTests: z.number(),
  numPendingTestSuites: z.number(),
  numTodoTests: z.number(),
  success: z.boolean(),
  testResults: z.array(
    z.object({
      assertionResults: z.array(z.object({ fullName: z.string(), status: z.string() })),
      name: z.string(),
    }),
  ),
});

const playwrightSpecSchema = z.object({
  file: z.string(),
  tests: z.array(
    z.object({
      results: z.array(z.object({ retry: z.number(), status: z.string() })),
      status: z.string(),
    }),
  ),
  title: z.string(),
});
const jsonValueSchema = z.json();
const playwrightSuiteSchema = z.object({
  specs: z.array(playwrightSpecSchema).optional(),
  suites: z.array(jsonValueSchema).optional(),
});
const playwrightReportSchema = z.object({
  stats: z.object({
    expected: z.number(),
    flaky: z.number(),
    skipped: z.number(),
    unexpected: z.number(),
  }),
  suites: z.array(jsonValueSchema),
});

export function readAcceptedVitestResults({
  reportInput,
  stageId,
}: Readonly<{
  reportInput: z.input<typeof vitestReportSchema>;
  stageId: ReleaseStageId;
}>): readonly PassedTest[] {
  const report = vitestReportSchema.parse(reportInput);
  const nonPassedAssertions = report.testResults.flatMap(({ assertionResults }) =>
    assertionResults.filter(({ status }) => status !== "passed"),
  );
  const problems = [
    report.numFailedTests > 0 ? `${report.numFailedTests} failed Vitest tests` : "",
    report.numPendingTests > 0 ? `${report.numPendingTests} pending Vitest tests` : "",
    report.numPendingTestSuites > 0 ? `${report.numPendingTestSuites} pending Vitest suites` : "",
    report.numTodoTests > 0 ? `${report.numTodoTests} todo Vitest tests` : "",
    nonPassedAssertions.length > 0
      ? `${nonPassedAssertions.length} Vitest assertions were not passed`
      : "",
    !report.success ? "Vitest reported an unsuccessful run" : "",
  ].filter(Boolean);
  if (problems.length > 0) throw new Error(problems.join("; "));

  return report.testResults.flatMap(({ assertionResults, name }) =>
    assertionResults.map(({ fullName }) => ({ file: name, stageId, title: fullName })),
  );
}

export function readAcceptedPlaywrightResults({
  reportInput,
  stageId,
}: Readonly<{
  reportInput: z.input<typeof playwrightReportSchema>;
  stageId: ReleaseStageId;
}>): readonly PassedTest[] {
  const report = playwrightReportSchema.parse(reportInput);
  const passedTests = collectPlaywrightTests(report.suites, stageId);
  const retriedResults = passedTests.results.filter(({ retry }) => retry !== 0);
  const nonPassedResults = passedTests.results.filter(({ status }) => status !== "passed");
  const problems = [
    report.stats.skipped > 0 ? `${report.stats.skipped} skipped Playwright tests` : "",
    report.stats.unexpected > 0 ? `${report.stats.unexpected} unexpected Playwright tests` : "",
    report.stats.flaky > 0 ? `${report.stats.flaky} flaky Playwright tests` : "",
    retriedResults.length > 0 ? `${retriedResults.length} retried Playwright results` : "",
    nonPassedResults.length > 0
      ? `${nonPassedResults.length} Playwright results were not passed`
      : "",
    report.stats.expected === 0 ? "Playwright collected no accepted tests" : "",
  ].filter(Boolean);
  if (problems.length > 0) throw new Error(problems.join("; "));
  return passedTests.tests;
}

function collectPlaywrightTests(
  suiteInputs: readonly z.output<typeof jsonValueSchema>[],
  stageId: ReleaseStageId,
): CollectedPlaywrightTests {
  if (suiteInputs.length === 0) return { results: [], tests: [] };
  const suites = suiteInputs.map((suite) => playwrightSuiteSchema.parse(suite));
  const directSpecs = suites.flatMap(({ specs = [] }) => specs);
  const nested = collectPlaywrightTests(
    suites.flatMap(({ suites: childSuites = [] }) => childSuites),
    stageId,
  );
  return {
    results: [
      ...directSpecs.flatMap(({ tests }) => tests.flatMap(({ results }) => results)),
      ...nested.results,
    ],
    tests: [...directSpecs.map(({ file, title }) => ({ file, stageId, title })), ...nested.tests],
  };
}
