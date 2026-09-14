import { describe, expect, it } from "vite-plus/test";

import {
  checkPackageContract,
  packagedReleaseCandidateSchema,
  type PackagedReleaseCandidate,
} from "./package-contract.js";

const acceptedCandidate = {
  alternatePlatformArtifacts: [],
  appBundleName: "Invoice Generator.app",
  appId: "com.codernetic.invoicegenerator",
  applicationArchitectures: ["arm64"],
  artifactPath: "release/Invoice Generator-0.1.0-arm64.dmg",
  artifactSha256: "a".repeat(64),
  dmgApplicationsLink: true,
  dmgSigned: false,
  forbiddenRuntimeMetadata: [],
  hardenedRuntime: false,
  inspectedApplicationBinaryCount: 13,
  minimumSystemVersion: "26.0",
  nonArm64ApplicationBinaries: [],
  notarized: false,
  productName: "Invoice Generator",
  publishOrUpdateMetadata: [],
  signature: "adhoc",
  unexpectedDmgEntries: [],
} as const satisfies PackagedReleaseCandidate;

describe("packaged release candidate contract", () => {
  it("accepts the exact local arm64 DMG contract", () => {
    expect(checkPackageContract(acceptedCandidate)).toEqual([]);
    expect(packagedReleaseCandidateSchema.parse(acceptedCandidate)).toEqual(acceptedCandidate);
  });

  it.each([
    ["stable application identity", { appId: "example.changed" }],
    ["product name", { productName: "Another App" }],
    ["arm64-only", { applicationArchitectures: ["arm64", "x86_64"] }],
    ["non-arm64", { nonArm64ApplicationBinaries: ["Frameworks/example"] }],
    ["macOS 26", { minimumSystemVersion: "15.0" }],
    ["ad hoc", { signature: "developer-id" }],
    ["hardened runtime", { hardenedRuntime: true }],
    ["notarization", { notarized: true }],
    ["unsigned DMG", { dmgSigned: true }],
    ["drag-to-Applications", { dmgApplicationsLink: false }],
    ["expected application", { appBundleName: "Wrong.app" }],
    ["unexpected DMG", { unexpectedDmgEntries: ["Read me first.txt"] }],
    ["update or publishing", { publishOrUpdateMetadata: ["app-update.yml"] }],
    ["alternate-platform", { alternatePlatformArtifacts: ["Invoice Generator.exe"] }],
    ["forbidden runtime", { forbiddenRuntimeMetadata: ["electron-updater"] }],
    ["artifact identity", { artifactSha256: "not-a-sha" }],
  ] satisfies readonly [string, Partial<PackagedReleaseCandidate>][])(
    "rejects a package that violates %s evidence",
    (expectedProblem, changedFacts) => {
      expect(checkPackageContract({ ...acceptedCandidate, ...changedFacts })).toEqual([
        expect.stringContaining(expectedProblem),
      ]);
    },
  );

  it("rejects a package inspection that did not inspect application binaries", () => {
    expect(
      checkPackageContract({ ...acceptedCandidate, inspectedApplicationBinaryCount: 0 }),
    ).toEqual([expect.stringContaining("application binaries")]);
  });
});
