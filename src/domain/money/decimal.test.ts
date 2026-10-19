import { describe, expect, it } from "vite-plus/test";

import { formatCurrencyAmount } from "./decimal.ts";

describe("currency amount display", () => {
  it.each([
    ["525", "GBP", 2, "£525.00"],
    ["2625.00", "GBP", 2, "£2,625.00"],
    ["525", "USD", 2, "$525.00"],
    ["525", "EUR", 2, "€525.00"],
    ["2625", "JPY", 0, "¥2,625"],
    ["0.001", "BHD", 3, "BHD 0.001"],
    ["-525.00", "GBP", 2, "-£525.00"],
    ["-0.01", "GBP", 2, "-£0.01"],
    ["9007199254740993.01", "GBP", 2, "£9,007,199,254,740,993.01"],
  ])("formats %s %s with %i decimal places", (amount, currency, precision, expected) => {
    expect(formatCurrencyAmount(amount, currency, precision)).toBe(expected);
  });
});
