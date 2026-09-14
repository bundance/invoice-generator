import { describe, expect, it } from "vite-plus/test";

import { getBusinessDate, parseBusinessDate } from "./business-date.ts";
import { completeIssuer } from "../../../tests/fixtures/issuer-settings.ts";

describe("business date", () => {
  it("uses the issuer timezone at UTC date boundaries", () => {
    expect(
      getBusinessDate(new Date("2026-09-03T23:30:00.000Z"), completeIssuer.businessTimezone),
    ).toBe("2026-09-04");
  });

  it("rejects strings that are not calendar dates", () => {
    expect(() => parseBusinessDate("2026-09-31")).toThrow(/Invalid ISO date/u);
  });
});
