import { z } from "zod";

const calendarDateSchema = z.iso.date();
const millisecondsPerDay = 86_400_000;

export function nextInvoicePeriodStart(periodEnd: string): string | null {
  return nextWeekdayAfter(periodEnd, 1);
}

export function defaultInvoicePeriodEnd(periodStart: string): string | null {
  return nextWeekdayAfter(periodStart, 0);
}

export function countInvoiceWorkdays(periodStart: string, periodEnd: string): number | null {
  if (!calendarDateSchema.safeParse(periodStart).success) return null;
  if (!calendarDateSchema.safeParse(periodEnd).success || periodEnd < periodStart) return null;

  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const end = Date.parse(`${periodEnd}T00:00:00.000Z`);
  const totalDays = (end - start.getTime()) / millisecondsPerDay + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  let workdays = fullWeeks * 5;
  for (let offset = 0; offset < totalDays % 7; offset += 1) {
    const weekday = (start.getUTCDay() + offset) % 7;
    if (weekday !== 0 && weekday !== 6) workdays += 1;
  }
  return workdays;
}

function nextWeekdayAfter(value: string, weekday: number): string | null {
  if (!calendarDateSchema.safeParse(value).success) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  const daysToAdd = (weekday - date.getUTCDay() + 7) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  const nextDate = date.toISOString().slice(0, 10);
  return calendarDateSchema.safeParse(nextDate).success ? nextDate : null;
}
