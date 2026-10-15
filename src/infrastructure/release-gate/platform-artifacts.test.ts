import { describe, expect, it } from "vite-plus/test";

import { isAlternatePlatformArtifact } from "./platform-artifacts.ts";

describe("packaged platform paths", () => {
  it.each([
    "release/Invoice Generator-0.1.0-arm64.dmg",
    "release/mac-arm64/Invoice Generator.app/Contents/Resources/app.asar",
    "release/mac-arm64/Invoice Generator.app/Contents/Resources/app.asar.unpacked/node_modules/@napi-rs/canvas-darwin-arm64/package.json",
    "release/mac-arm64/Invoice Generator.app/Contents/Resources/app.asar.unpacked/node_modules/@napi-rs/canvas-darwin-arm64/skia.darwin-arm64.node",
    "release/node_modules/@napi-rs+canvas-darwin-arm64@1.0.0/node_modules/@napi-rs/canvas-darwin-arm64/skia.darwin-arm64.node",
    "release/darwin-arm64/skia.DARWIN-arm64.node",
    "release/twin-tools/darwin-arm64/drawing.node",
  ])("accepts target platform path %s", (path) => {
    expect(isAlternatePlatformArtifact(path)).toBe(false);
  });

  it.each([
    "release/win-unpacked/Invoice Generator.exe",
    "release/win-arm64/resources/app.asar",
    "release/windows-x64/resources/app.asar",
    "release/linux-arm64/resources/app.asar",
    "release/node_modules/@napi-rs/canvas-win32-x64-msvc/package.json",
    "release/node_modules/@napi-rs/canvas-linux-arm64-gnu/skia.node",
    "release/node_modules/@napi-rs/canvas-darwin-x64/skia.darwin-x64.node",
    "release/darwin-universal/Invoice Generator.app/Contents/MacOS/Invoice Generator",
    "release/mac-x64/Invoice Generator.app/Contents/Info.plist",
    "release/mac-universal/Invoice Generator.app/Contents/Info.plist",
    "release\\win-arm64\\resources\\app.asar",
    ...["AppImage", "deb", "exe", "msi", "pkg", "rpm", "snap", "zip"].map(
      (extension) => `release/Invoice Generator.${extension}`,
    ),
  ])("rejects alternate platform path %s", (path) => {
    expect(isAlternatePlatformArtifact(path)).toBe(true);
  });
});
