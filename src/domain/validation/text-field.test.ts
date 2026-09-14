import { describe, expect, it } from "vite-plus/test";

import { normalizeOptionalMultiline, normalizeOptionalSingleLine } from "./text-field.js";

describe("document text glyph coverage", () => {
  it("accepts text covered by the bundled non-Latin Arimo subsets", () => {
    expect(normalizeOptionalSingleLine("Công ty Nghiên cứu")).toEqual({
      kind: "valid",
      value: "Công ty Nghiên cứu",
    });
    expect(normalizeOptionalMultiline("Αθήνα\nКиїв\nירושלים")).toEqual({
      kind: "valid",
      value: "Αθήνα\nКиїв\nירושלים",
    });
  });

  it("rejects a character outside the bundled document-font subsets", () => {
    expect(normalizeOptionalSingleLine("Acme 🚀 Research")).toEqual({
      kind: "invalid",
      message: "Use characters supported by the invoice PDF font.",
    });
  });
});
