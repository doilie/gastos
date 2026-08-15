// Card cycle: the derived credit-card billing-cycle window (HLD §3.4, "Card
// cycle | Cut-off day (17th) | 'What do I owe this card, and from where?'").
// This is a Domain-layer file: it may depend on Ledger Core, Reference, and
// money, per the layer map in `packages/config/README.md` (the diagram
// explicitly lists "CC cycles" under Domain).
//
// A cycle runs from the day after one cutoff through the next cutoff,
// inclusive on both ends. If a card's `cutoffDay` exceeds the number of days
// in a given month (e.g. `cutoffDay: 31` in February), it clamps to that
// month's actual last day — standard statement-billing convention.

import { type LedgerDate, ledgerDateFromString } from "../ledger-core/transaction";

const LEDGER_DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Small local equivalent of `matchLedgerDateShape`/parsing in
 * `ledger-core/transaction.ts` (not exported from there, so re-implemented
 * here) — extracts year/month/day as numbers from a `LedgerDate` string. */
function parseLedgerDateParts(date: LedgerDate): { year: number; month: number; day: number } {
  const match = LEDGER_DATE_SHAPE.exec(date);
  if (!match) {
    throw new Error(`parseLedgerDateParts: not a valid YYYY-MM-DD date: ${JSON.stringify(date)}`);
  }
  const [, yearStr, monthStr, dayStr] = match;
  if (yearStr === undefined || monthStr === undefined || dayStr === undefined) {
    throw new Error(`parseLedgerDateParts: not a valid YYYY-MM-DD date: ${JSON.stringify(date)}`);
  }
  return {
    year: Number.parseInt(yearStr, 10),
    month: Number.parseInt(monthStr, 10),
    day: Number.parseInt(dayStr, 10),
  };
}

/** Number of days in `month` (1-indexed, 1 = January) of `year`. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatLedgerDate(year: number, month: number, day: number): string {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Builds the `LedgerDate` for `cutoffDay` within `year`/`month` (1-indexed),
 * clamped to that month's actual last day (e.g. `cutoffDay: 31` in a
 * 30-day-or-shorter month clamps down).
 */
function cutoffDateInMonth(cutoffDay: number, year: number, month: number): LedgerDate {
  const clampedDay = Math.min(cutoffDay, daysInMonth(year, month));
  return ledgerDateFromString(formatLedgerDate(year, month, clampedDay));
}

/**
 * Adds `delta` months to `year`/`month` (1-indexed), rolling the year over in
 * either direction. Implemented with integer arithmetic, no looping.
 */
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroIndexedMonth = month - 1 + delta;
  const newMonth = ((zeroIndexedMonth % 12) + 12) % 12;
  const yearOffset = Math.floor(zeroIndexedMonth / 12);
  return { year: year + yearOffset, month: newMonth + 1 };
}

/** Returns the calendar day after `date`. */
function nextLedgerDay(date: LedgerDate): LedgerDate {
  const { year, month, day } = parseLedgerDateParts(date);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  return ledgerDateFromString(
    formatLedgerDate(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate()),
  );
}

/** A credit card's billing-cycle window, both bounds inclusive. */
export interface CardCycle {
  readonly start: LedgerDate;
  readonly end: LedgerDate;
}

function assertValidCutoffDay(cutoffDay: number): void {
  if (!Number.isInteger(cutoffDay) || cutoffDay < 1 || cutoffDay > 31) {
    throw new Error("cardCycleContaining: cutoffDay must be an integer from 1 to 31");
  }
}

function cycleEndingThisMonth(cutoffDay: number, year: number, month: number): CardCycle {
  const previous = shiftMonth(year, month, -1);
  return {
    start: nextLedgerDay(cutoffDateInMonth(cutoffDay, previous.year, previous.month)),
    end: cutoffDateInMonth(cutoffDay, year, month),
  };
}

function cycleEndingNextMonth(cutoffDay: number, year: number, month: number): CardCycle {
  const next = shiftMonth(year, month, 1);
  return {
    start: nextLedgerDay(cutoffDateInMonth(cutoffDay, year, month)),
    end: cutoffDateInMonth(cutoffDay, next.year, next.month),
  };
}

/**
 * Computes the billing-cycle window (start/end, both inclusive) that `date`
 * falls into for a card with the given `cutoffDay`. A cycle runs from the day
 * after one cutoff through the next cutoff.
 */
export function cardCycleContaining(cutoffDay: number, date: LedgerDate): CardCycle {
  assertValidCutoffDay(cutoffDay);

  const { year, month, day } = parseLedgerDateParts(date);
  const thisMonthCutoff = cutoffDateInMonth(cutoffDay, year, month);
  const thisMonthCutoffDay = parseLedgerDateParts(thisMonthCutoff).day;

  return day <= thisMonthCutoffDay
    ? cycleEndingThisMonth(cutoffDay, year, month)
    : cycleEndingNextMonth(cutoffDay, year, month);
}
