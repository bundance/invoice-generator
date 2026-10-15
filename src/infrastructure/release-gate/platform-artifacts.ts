const alternateInstallerExtension = /\.(?:AppImage|deb|exe|msi|pkg|rpm|snap|zip)$/iu;
const alternateOperatingSystemLabel = /(?:^|[-_.+@])(?:win(?:32|64)?|windows|linux)(?=[-_.+@]|$)/iu;
const alternateMacArchitectureLabel =
  /(?:^|[-_.+@])(?:mac|darwin)-(?:x64|x86_64|ia32|universal)(?=[-_.+@]|$)/iu;

export function isAlternatePlatformArtifact(path: string): boolean {
  return path
    .split(/[\\/]/u)
    .some(
      (segment) =>
        alternateInstallerExtension.test(segment) ||
        alternateOperatingSystemLabel.test(segment) ||
        alternateMacArchitectureLabel.test(segment),
    );
}
