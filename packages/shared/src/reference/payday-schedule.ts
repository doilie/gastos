// Payday schedule reference type.
//
// Per `req/what-i-want.txt` ("budget: tracks where the salaries per month
// will be placed in the sub-envelopes. there are multiple pay days to be
// budgeted per month.") and HLD §3.4's "Payday window" row, this models the
// configured day(s)-of-month payday(s) happen (e.g. semi-monthly payroll on
// the 15th and the last day of the month). This is Reference-layer config,
// like `CreditCard.cutoffDay` — a per-schedule field, not a shared
// magic-number constant.
//
// Scope note: the HLD's own §9 Open Item 1 ("Payday shift rule when the 15th
// or month-end is a non-banking day") is explicitly unresolved in the source
// design docs. This file does not attempt to solve it — paydays here are raw
// calendar days only, with no holiday/weekend-shifting logic.

import { type LedgerDate, ledgerDateFromString } from "../ledger-core/transaction";

/** Branded string type: a payday schedule identifier. */
export type PaydayScheduleId = string & { readonly __brand: "PaydayScheduleId" };

/**
 * Safe constructor: converts a raw `string` into `PaydayScheduleId`, throwing
 * if it is empty or whitespace-only.
 */
export function paydayScheduleIdFromString(value: string): PaydayScheduleId {
  if (value.trim().length === 0) {
    throw new Error("paydayScheduleIdFromString: value is empty or whitespace-only");
  }
  return value as PaydayScheduleId;
}

/** A payday schedule: the configured day(s)-of-month payday(s) happen. */
export interface PaydaySchedule {
  readonly id: PaydayScheduleId;
  readonly name: string;
  /** Day-of-month (1–31) each payday falls on, clamped to the actual last
   * day of any shorter month (e.g. 31 clamps to Feb 28/29) — the same
   * technique already used for CreditCard.cutoffDay. At least one entry;
   * no duplicates. No non-banking-day shift rule is modeled (HLD open
   * item, unresolved) — these are raw calendar days. */
  readonly paydayDaysOfMonth: readonly number[];
}

function assertNonEmptyName(name: string, context: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error(`${context}: name is empty or whitespace-only`);
  }
  return trimmed;
}

function assertNoDuplicateDays(paydayDaysOfMonth: readonly number[], context: string): void {
  const uniqueDays = new Set(paydayDaysOfMonth);
  if (uniqueDays.size !== paydayDaysOfMonth.length) {
    throw new Error(`${context}: paydayDaysOfMonth must not contain duplicate values`);
  }
}

function assertValidPaydayDaysOfMonth(paydayDaysOfMonth: readonly number[], context: string): readonly number[] {
  if (paydayDaysOfMonth.length === 0) {
    throw new Error(`${context}: must have at least one payday`);
  }
  for (const day of paydayDaysOfMonth) {
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      throw new Error(`${context}: each entry in paydayDaysOfMonth must be an integer from 1 to 31`);
    }
  }
  assertNoDuplicateDays(paydayDaysOfMonth, context);
  return paydayDaysOfMonth;
}

/**
 * Factory/validator for `PaydaySchedule`: trims and validates `name` is
 * non-empty, validates `paydayDaysOfMonth` is non-empty, each entry is an
 * integer from 1 to 31, and there are no duplicate entries.
 */
export function createPaydaySchedule(input: {
  id: PaydayScheduleId;
  name: string;
  paydayDaysOfMonth: readonly number[];
}): PaydaySchedule {
  return {
    id: input.id,
    name: assertNonEmptyName(input.name, "createPaydaySchedule"),
    paydayDaysOfMonth: assertValidPaydayDaysOfMonth(input.paydayDaysOfMonth, "createPaydaySchedule"),
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

function assertValidMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("paydaysInMonth: month must be an integer from 1 to 12");
  }
}

/**
 * Computes the actual payday `LedgerDate`s for `schedule` within `year`/
 * `month` (1-indexed, 1 = January). Each configured day-of-month is clamped
 * to that month's actual last day, then returned sorted ascending.
 */
export function paydaysInMonth(schedule: PaydaySchedule, year: number, month: number): readonly LedgerDate[] {
  assertValidMonth(month);

  const lastDayOfMonth = daysInMonth(year, month);
  const clampedDays = schedule.paydayDaysOfMonth.map((day) => Math.min(day, lastDayOfMonth));
  const sortedDays = [...clampedDays].sort((a, b) => a - b);

  return sortedDays.map((day) => ledgerDateFromString(formatLedgerDate(year, month, day)));
}
