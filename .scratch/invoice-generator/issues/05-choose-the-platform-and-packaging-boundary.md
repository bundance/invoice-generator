# Choose the platform and packaging boundary

Type: grilling
Status: resolved
Blocked by: none

## Question

Which operating systems and processor architectures must the first release support, and what installation, code-signing, notarization, and update behavior is necessary for a personal-use application?

## Answer

The first release is a personal application for the issuer's owner to use across Macs they own. It supports macOS 26.0 or later on Apple Silicon `arm64` only. Intel Macs, universal binaries, Rosetta-only builds, Windows, and Linux are unsupported.

One documented local packaging command produces one `arm64` disk image. The disk image contains the app and supports the standard drag-to-Applications installation flow. The project does not produce a package installer, ZIP release, Mac App Store build, or additional architecture-specific artifact.

The app bundle receives ad hoc signatures for its Apple Silicon executable content. It does not receive a Developer ID identity signature. The disk image and app are not submitted to Apple's notarization service, and the build needs no Apple Developer Program membership, signing certificate, notarization credential, or release secret.

On each Mac, the user attempts the first launch and then explicitly permits the app through System Settings > Privacy & Security > Open Anyway. The specification accepts this one-time Gatekeeper override because the user built or transferred the artifact themselves and controls every target Mac.

Release builds are created locally on a supported Apple Silicon Mac. The project does not add release CI, hosted downloads, GitHub Releases, an update feed, or any other delivery service. Moving the disk image between the user's Macs sits outside the application.

Updates are manual. The user obtains or builds a newer disk image, quits the app, and replaces the existing application in Applications. The app keeps a stable application identity and continues using the dataset in its fixed application-data directory. Replacing the app never deletes or relocates that dataset.

Every packaged build has a `MAJOR.MINOR.PATCH` version and displays it in Settings. The app has no update check, update button, update status, background downloader, or automatic updater. If the user replaces the app with an older build after a data-format conversion, that build follows the data-contract rule for an unknown newer `schemaVersion`: it leaves the dataset unchanged and refuses to open it.
