import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { listDescendantFilePaths } from "./file-tree.ts";
import { requiresArchitectureInspection } from "./application-binary-files.ts";
import { checkPackageContract, type PackagedReleaseCandidate } from "./package-contract.ts";
import { isAlternatePlatformArtifact } from "./platform-artifacts.ts";

const releaseDirectory = join(process.cwd(), "release");
const releaseFiles = await listDescendantFilePaths(releaseDirectory);
const dmgPaths = releaseFiles.filter((path) => path.endsWith("-arm64.dmg"));
if (dmgPaths.length !== 1) {
  throw new Error(`Expected one arm64 DMG, found ${dmgPaths.length}`);
}
const dmgPath = dmgPaths[0];
if (!dmgPath) throw new Error("The arm64 DMG path is missing");

const artifactSha256 = createHash("sha256")
  .update(await readFile(dmgPath))
  .digest("hex");
const dmgSignature = run("codesign", ["--verify", dmgPath]);
if (
  dmgSignature.status !== 1 ||
  !/code object is not signed at all/iu.test(`${dmgSignature.stderr}\n${dmgSignature.stdout}`)
) {
  throw new Error(
    `Could not prove that the DMG is unsigned: ${dmgSignature.stderr || dmgSignature.stdout}`,
  );
}
const dmgInspection = await inspectDmg(dmgPath);
const asarPaths = dmgInspection.asarInspection.paths;
const publishOrUpdateMetadata = [...releaseFiles, ...asarPaths].filter((path) =>
  /(?:app-update|latest[^/]*\.ya?ml|\.blockmap$|publish)/iu.test(path),
);
const alternatePlatformArtifacts = releaseFiles.filter(isAlternatePlatformArtifact);
const forbiddenRuntimeMetadata = [
  ...asarPaths.filter((path) => /(?:electron-updater|autoUpdater|update\.ya?ml)/iu.test(path)),
  ...dmgInspection.asarInspection.forbiddenContent,
];

const candidate = {
  alternatePlatformArtifacts,
  appBundleName: dmgInspection.appBundleName,
  appId: dmgInspection.appId,
  applicationArchitectures: dmgInspection.applicationArchitectures,
  artifactPath: relative(process.cwd(), dmgPath),
  artifactSha256,
  dmgApplicationsLink: dmgInspection.applicationsLink,
  dmgSigned: false,
  forbiddenRuntimeMetadata,
  hardenedRuntime: dmgInspection.hardenedRuntime,
  inspectedApplicationBinaryCount: dmgInspection.inspectedApplicationBinaryCount,
  minimumSystemVersion: dmgInspection.minimumSystemVersion,
  nonArm64ApplicationBinaries: dmgInspection.nonArm64ApplicationBinaries,
  notarized: dmgInspection.notarized,
  productName: dmgInspection.productName,
  publishOrUpdateMetadata,
  signature: dmgInspection.signature,
  unexpectedDmgEntries: dmgInspection.unexpectedEntries,
} as const satisfies PackagedReleaseCandidate;
const problems = checkPackageContract(candidate);
if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  throw new Error("The packaged release candidate does not satisfy the release contract");
}

const candidateRecordPath = join(releaseDirectory, "release-candidate.json");
await writeFile(candidateRecordPath, `${JSON.stringify(candidate, null, 2)}\n`);
process.stdout.write(`PASS package-release-candidate ${candidate.artifactSha256}\n`);
process.stdout.write(`Artifact: ${candidate.artifactPath}\n`);

type CommandResult = Readonly<{
  status: number | null;
  stderr: string;
  stdout: string;
}>;

type ApplicationBinary = Readonly<{
  architectures: readonly string[];
  path: string;
}>;

type ApplicationInspection = Readonly<{
  appId: string;
  applicationArchitectures: readonly string[];
  asarInspection: Readonly<{ forbiddenContent: string[]; paths: string[] }>;
  hardenedRuntime: boolean;
  inspectedApplicationBinaryCount: number;
  minimumSystemVersion: string;
  nonArm64ApplicationBinaries: readonly string[];
  notarized: boolean;
  productName: string;
  signature: "adhoc" | "invalid";
}>;

function run(command: string, arguments_: readonly string[]): CommandResult {
  const result = spawnSync(command, arguments_, { encoding: "utf8", timeout: 60_000 });
  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`${command} ${arguments_.join(" ")} ended with signal ${result.signal}`);
  }
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

function runRequired(command: string, arguments_: readonly string[]): CommandResult {
  const result = run(command, arguments_);
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

async function inspectApplicationBinaries(applicationPath: string): Promise<ApplicationBinary[]> {
  const applicationPaths = await listDescendantFilePaths(applicationPath);
  const binaryPaths = (
    await Promise.all(
      applicationPaths.map(async (path) => {
        const file = await lstat(path);
        return file.isFile() && requiresArchitectureInspection(path, file.mode) ? path : null;
      }),
    )
  ).filter((path): path is string => path !== null);

  return binaryPaths.map((path) => ({
    architectures: runRequired("lipo", ["-archs", path])
      .stdout.trim()
      .split(/\s+/u)
      .filter(Boolean),
    path,
  }));
}

async function inspectApplication(appPath: string): Promise<ApplicationInspection> {
  const infoPlistPath = join(appPath, "Contents", "Info.plist");
  runRequired("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  const signatureDetails = runRequired("codesign", ["-dv", "--verbose=4", appPath]);
  const applicationBinaries = await inspectApplicationBinaries(appPath);
  const applicationArchitectures = [
    ...new Set(applicationBinaries.flatMap(({ architectures }) => architectures)),
  ].sort();
  const signature = /Signature=adhoc/u.test(signatureDetails.stderr) ? "adhoc" : "invalid";

  return {
    appId: readPlistValue(infoPlistPath, "CFBundleIdentifier"),
    applicationArchitectures,
    asarInspection: await inspectAsar(join(appPath, "Contents", "Resources", "app.asar")),
    hardenedRuntime: /\bruntime\b/iu.test(signatureDetails.stderr),
    inspectedApplicationBinaryCount: applicationBinaries.length,
    minimumSystemVersion: readPlistValue(infoPlistPath, "LSMinimumSystemVersion"),
    nonArm64ApplicationBinaries: applicationBinaries.flatMap(({ architectures, path }) =>
      architectures.length === 1 && architectures[0] === "arm64" ? [] : [relative(appPath, path)],
    ),
    notarized: signature !== "adhoc",
    productName: readPlistValue(infoPlistPath, "CFBundleName"),
    signature,
  };
}

function readPlistValue(infoPlistPath: string, key: string): string {
  return runRequired("plutil", ["-extract", key, "raw", "-o", "-", infoPlistPath]).stdout.trim();
}

async function inspectDmg(dmgPathToInspect: string): Promise<
  ApplicationInspection & {
    appBundleName: string;
    applicationsLink: boolean;
    unexpectedEntries: string[];
  }
> {
  const attach = runRequired("hdiutil", ["attach", "-nobrowse", "-readonly", dmgPathToInspect]);
  const mountPoint = findDmgMountPoint(attach.stdout);

  try {
    return await inspectMountedDmg(mountPoint);
  } finally {
    runRequired("hdiutil", ["detach", mountPoint]);
  }
}

function findDmgMountPoint(attachOutput: string): string {
  const mountPoint = attachOutput
    .split("\n")
    .map((line) => line.split("\t").at(-1)?.trim() ?? "")
    .find((path) => path.startsWith("/Volumes/"));
  if (!mountPoint) throw new Error(`Could not find the DMG mount point in: ${attachOutput}`);
  return mountPoint;
}

async function inspectMountedDmg(mountPoint: string) {
  const entries = await readdir(mountPoint);
  const appBundleName = findApplicationBundleName(entries);
  const applicationsPath = join(mountPoint, "Applications");
  const applicationsLink =
    (await lstat(applicationsPath)).isSymbolicLink() &&
    (await readlink(applicationsPath)) === "/Applications";
  const allowedEntries = new Set([
    ".background",
    ".background.tiff",
    ".DS_Store",
    ".VolumeIcon.icns",
    "Applications",
    "Invoice Generator.app",
  ]);
  return {
    ...(await inspectApplication(join(mountPoint, appBundleName))),
    appBundleName,
    applicationsLink,
    unexpectedEntries: entries.filter((entry) => !allowedEntries.has(entry)),
  };
}

function findApplicationBundleName(entries: readonly string[]): string {
  const appBundleNames = entries.filter((entry) => entry.endsWith(".app"));
  if (appBundleNames.length !== 1) {
    throw new Error(`Expected one application in the DMG, found ${appBundleNames.length}`);
  }
  const appBundleName = appBundleNames[0];
  if (!appBundleName) throw new Error("The application bundle name is missing from the DMG");
  return appBundleName;
}

async function inspectAsar(asarPath: string): Promise<{
  forbiddenContent: string[];
  paths: string[];
}> {
  const pnpmDirectory = join(process.cwd(), "node_modules", ".pnpm");
  const asarPackageDirectory = (await readdir(pnpmDirectory)).find((entry) =>
    entry.startsWith("@electron+asar@"),
  );
  if (!asarPackageDirectory) throw new Error("The pinned @electron/asar package is missing");
  const asarCommandPath = join(
    pnpmDirectory,
    asarPackageDirectory,
    "node_modules",
    "@electron",
    "asar",
    "bin",
    "asar.js",
  );
  const extractionDirectory = await mkdtemp(join(tmpdir(), "invoice-generator-asar-"));

  try {
    runRequired(process.execPath, [asarCommandPath, "extract", asarPath, extractionDirectory]);
    const paths = await listDescendantFilePaths(extractionDirectory);
    const applicationMetadataPaths = paths.filter(
      (path) =>
        path === join(extractionDirectory, "package.json") ||
        path.startsWith(join(extractionDirectory, "dist")),
    );
    const forbiddenContent = (
      await Promise.all(
        applicationMetadataPaths.map(async (path) => ({
          contents: await readFile(path, "utf8"),
          path,
        })),
      )
    ).flatMap(({ contents, path }) =>
      /(?:autoUpdater|checkForUpdates|electron-updater|setFeedURL|update\.electronjs\.org|"publish"\s*:)/iu.test(
        contents,
      )
        ? [relative(extractionDirectory, path)]
        : [],
    );
    return {
      forbiddenContent,
      paths: paths.map((path) => relative(extractionDirectory, path)),
    };
  } finally {
    await rm(extractionDirectory, { force: true, recursive: true });
  }
}
