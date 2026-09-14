import { z } from "zod";

import type { BusinessTimezone } from "../issuer/issuer-settings.ts";

const businessDateSchema = z.iso.date().brand<"BusinessDate">();

export type BusinessDate = z.output<typeof businessDateSchema>;

export function parseBusinessDate(value: string): BusinessDate {
  return businessDateSchema.parse(value);
}

export function getBusinessDate(now: Date, businessTimezone: BusinessTimezone): BusinessDate {
  const date = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: businessTimezone,
    year: "numeric",
  }).format(now);
  return parseBusinessDate(date);
}
