import { describe, expect, it } from "vite-plus/test";

import { findMissingRequiredFallowPlugins } from "./fallow-plugins.js";

describe("release Fallow plugins", () => {
  it("requires both the Electron and Vite plugins", () => {
    expect(findMissingRequiredFallowPlugins(["electron", "vite", "vitest"])).toEqual([]);
    expect(findMissingRequiredFallowPlugins(["vitest"])).toEqual(["electron", "vite"]);
  });
});
