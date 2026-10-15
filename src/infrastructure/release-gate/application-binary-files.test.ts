import { describe, expect, it } from "vite-plus/test";

import { requiresArchitectureInspection } from "./application-binary-files.ts";

describe("packaged application binary inspection", () => {
  it("includes a native Node addon without executable permissions", () => {
    expect(requiresArchitectureInspection("Resources/skia.darwin-arm64.node", 0o100644)).toBe(true);
  });

  it("includes the application executable", () => {
    expect(requiresArchitectureInspection("MacOS/Invoice Generator", 0o100755)).toBe(true);
  });

  it("does not treat ordinary JavaScript or package metadata as native binaries", () => {
    expect(requiresArchitectureInspection("Resources/main.cjs", 0o100644)).toBe(false);
    expect(requiresArchitectureInspection("Resources/package.json", 0o100644)).toBe(false);
  });
});
