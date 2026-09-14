import type { PassedTest } from "./accepted-test-results.ts";
import type { PackagedReleaseCandidate } from "./package-contract.ts";
import {
  automatedChecks,
  electronScenarioGroups,
  humanChecks,
  releaseStages,
  requirementMappings,
  specificationSectionMappings,
} from "./release-plan.ts";

type ReleaseReportInput = Readonly<{
  candidate: PackagedReleaseCandidate;
  completedAt: string;
  passedTests: readonly PassedTest[];
  startedAt: string;
}>;

export function createReleaseReport({
  candidate,
  completedAt,
  passedTests,
  startedAt,
}: ReleaseReportInput) {
  const reportedAutomatedChecks = automatedChecks.map((check) =>
    reportPassedCheck(check, passedTests),
  );
  const reportedElectronScenarios = electronScenarioGroups.map((check) =>
    reportPassedCheck(check, passedTests),
  );

  return {
    artifact: {
      path: candidate.artifactPath,
      sha256: candidate.artifactSha256,
    },
    automatedChecks: reportedAutomatedChecks,
    completedAt,
    electronScenarios: reportedElectronScenarios,
    humanApprovals: humanChecks.map(({ id, name }) => ({
      artifactSha256: candidate.artifactSha256,
      id,
      name,
      status: "pending" as const,
    })),
    packageInspection: candidate,
    requirements: requirementMappings.flatMap(
      ({ automatedCheckIds, humanCheckIds, requirements }) =>
        requirements.map((requirement) => ({
          automatedCheckIds,
          humanCheckIds,
          requirement,
        })),
    ),
    stages: releaseStages.map(({ id, name }) => ({
      id,
      name,
      status: "passed" as const,
    })),
    specificationSections: specificationSectionMappings,
    startedAt,
    status: "awaiting-human-approval" as const,
    testEvidence: passedTests,
  };
}

function reportPassedCheck(
  check: (typeof automatedChecks)[number],
  passedTests: readonly PassedTest[],
) {
  const evidenceTests =
    check.evidence.kind === "tests"
      ? check.evidence.titleFragments.map((titleFragment) => {
          const passedTest = passedTests.find(
            ({ stageId, title }) => stageId === check.stageId && title.includes(titleFragment),
          );
          if (!passedTest) {
            throw new Error(
              `${check.name} has no passing ${check.stageId} test matching: ${titleFragment}`,
            );
          }
          return passedTest;
        })
      : [];
  return {
    evidenceKind: check.evidence.kind,
    evidenceTests,
    id: check.id,
    name: check.name,
    status: "passed" as const,
  };
}
