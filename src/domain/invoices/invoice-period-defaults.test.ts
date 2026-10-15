import { describe, expect, it } from "vite-plus/test";

import {
  countInvoiceWorkdays,
  defaultInvoicePeriodEnd,
  nextInvoicePeriodStart,
} from "./invoice-period-defaults.ts";

describe("invoice period defaults", () => {
  it.each([
    ["2026-08-03", "2026-08-09"],
    ["2026-08-08", "2026-08-09"],
    ["2026-08-09", "2026-08-16"],
    ["2026-12-31", "2027-01-03"],
    ["2028-02-28", "2028-03-05"],
  ])("suggests the Sunday strictly after %s", (start, end) => {
    expect(defaultInvoicePeriodEnd(start)).toBe(end);
  });

  it.each([
    ["2026-08-09", "2026-08-10"],
    ["2026-08-10", "2026-08-17"],
    ["2026-12-31", "2027-01-04"],
  ])("suggests the Monday strictly after %s", (end, start) => {
    expect(nextInvoicePeriodStart(end)).toBe(start);
  });

  it.each([
    ["2026-08-03", "2026-08-09", 5],
    ["2026-08-03", "2026-08-03", 1],
    ["2026-08-08", "2026-08-09", 0],
    ["2026-08-07", "2026-08-10", 2],
    ["2026-08-03", "2026-08-16", 10],
    ["2026-12-31", "2027-01-04", 3],
    ["2028-02-28", "2028-03-01", 3],
    ["2026-03-27", "2026-03-30", 2],
    ["2026-10-23", "2026-10-26", 2],
  ])("counts inclusive Monday to Friday workdays from %s to %s", (start, end, days) => {
    expect(countInvoiceWorkdays(start, end)).toBe(days);
  });

  it("leaves incomplete, invalid, reversed, or out-of-range dates without suggestions", () => {
    expect(defaultInvoicePeriodEnd("")).toBeNull();
    expect(defaultInvoicePeriodEnd("2026-02-30")).toBeNull();
    expect(defaultInvoicePeriodEnd("9999-12-31")).toBeNull();
    expect(nextInvoicePeriodStart("invalid")).toBeNull();
    expect(countInvoiceWorkdays("", "2026-08-09")).toBeNull();
    expect(countInvoiceWorkdays("2026-08-03", "")).toBeNull();
    expect(countInvoiceWorkdays("2026-08-09", "2026-08-03")).toBeNull();
  });
});
