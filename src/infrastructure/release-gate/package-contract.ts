import { z } from "zod";

export const packagedReleaseCandidateSchema = z.strictObject({
  alternatePlatformArtifacts: z.array(z.string()).readonly(),
  appBundleName: z.string(),
  appId: z.string(),
  applicationArchitectures: z.array(z.string()).readonly(),
  artifactPath: z.string(),
  artifactSha256: z.string(),
  dmgApplicationsLink: z.boolean(),
  dmgSigned: z.boolean(),
  forbiddenRuntimeMetadata: z.array(z.string()).readonly(),
  hardenedRuntime: z.boolean(),
  inspectedApplicationBinaryCount: z.number().int().nonnegative(),
  minimumSystemVersion: z.string(),
  nonArm64ApplicationBinaries: z.array(z.string()).readonly(),
  notarized: z.boolean(),
  productName: z.string(),
  publishOrUpdateMetadata: z.array(z.string()).readonly(),
  signature: z.literal(["adhoc", "developer-id", "invalid"]),
  unexpectedDmgEntries: z.array(z.string()).readonly(),
});

export type PackagedReleaseCandidate = Readonly<z.output<typeof packagedReleaseCandidateSchema>>;

export function checkPackageContract(candidate: PackagedReleaseCandidate): string[] {
  return packageContractChecks.flatMap((checkContract) => checkContract(candidate));
}

type PackageContractCheck = (candidate: PackagedReleaseCandidate) => string[];

const packageContractChecks: readonly PackageContractCheck[] = [
  checkApplicationIdentity,
  checkApplicationPlatform,
  checkApplicationSigning,
  checkDmgContract,
  checkArtifactIdentity,
];

function checkApplicationIdentity(candidate: PackagedReleaseCandidate): string[] {
  const problems: string[] = [];
  if (candidate.appId !== "com.codernetic.invoicegenerator") {
    problems.push(`stable application identity is ${candidate.appId}`);
  }
  if (candidate.productName !== "Invoice Generator") {
    problems.push(`product name is ${candidate.productName}`);
  }
  return problems;
}

function checkApplicationPlatform(candidate: PackagedReleaseCandidate): string[] {
  const problems: string[] = [];
  if (candidate.inspectedApplicationBinaryCount === 0) {
    problems.push("application binaries were not inspected");
  }
  if (
    candidate.applicationArchitectures.length !== 1 ||
    candidate.applicationArchitectures[0] !== "arm64"
  ) {
    problems.push(
      `application is not arm64-only: ${candidate.applicationArchitectures.join(", ")}`,
    );
  }
  if (candidate.nonArm64ApplicationBinaries.length > 0) {
    problems.push(
      `application contains non-arm64 binaries: ${candidate.nonArm64ApplicationBinaries.join(", ")}`,
    );
  }
  if (candidate.minimumSystemVersion !== "26.0") {
    problems.push(`macOS 26 minimum is ${candidate.minimumSystemVersion}`);
  }
  return problems;
}

function checkApplicationSigning(candidate: PackagedReleaseCandidate): string[] {
  const problems: string[] = [];
  if (candidate.signature !== "adhoc") {
    problems.push(`ad hoc signature mode is ${candidate.signature}`);
  }
  if (candidate.hardenedRuntime) problems.push("hardened runtime is enabled");
  if (candidate.notarized) problems.push("notarization evidence is present");
  return problems;
}

function checkDmgContract(candidate: PackagedReleaseCandidate): string[] {
  const problems: string[] = [];
  if (candidate.dmgSigned) problems.push("unsigned DMG boundary has a signature");
  if (!candidate.dmgApplicationsLink) {
    problems.push("drag-to-Applications link is missing from the DMG");
  }
  if (candidate.appBundleName !== "Invoice Generator.app") {
    problems.push(`expected application bundle is ${candidate.appBundleName}`);
  }
  if (candidate.unexpectedDmgEntries.length > 0) {
    problems.push(
      `unexpected DMG contents are present: ${candidate.unexpectedDmgEntries.join(", ")}`,
    );
  }
  if (candidate.publishOrUpdateMetadata.length > 0) {
    problems.push(
      `update or publishing metadata is present: ${candidate.publishOrUpdateMetadata.join(", ")}`,
    );
  }
  if (candidate.alternatePlatformArtifacts.length > 0) {
    problems.push(
      `alternate-platform artifacts are present: ${candidate.alternatePlatformArtifacts.join(", ")}`,
    );
  }
  if (candidate.forbiddenRuntimeMetadata.length > 0) {
    problems.push(
      `forbidden runtime metadata is present: ${candidate.forbiddenRuntimeMetadata.join(", ")}`,
    );
  }
  return problems;
}

function checkArtifactIdentity(candidate: PackagedReleaseCandidate): string[] {
  const problems: string[] = [];
  if (!/^[a-f\d]{64}$/u.test(candidate.artifactSha256)) {
    problems.push("artifact identity is not a SHA-256 digest");
  }
  if (!candidate.artifactPath.endsWith("-arm64.dmg")) {
    problems.push(`release candidate path is not the arm64 DMG: ${candidate.artifactPath}`);
  }
  return problems;
}
