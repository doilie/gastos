// Budget period: the calendar-month budgeting window (HLD §3.4, "Budget
// month | Calendar month | 'How do I allocate this month's pay?'"). This is
// a Domain-layer file: it may depend on Ledger Core, Reference, and money,
// per the layer map in `packages/config/README.md`.
//
// Per decision A2 ("Three independent period types, all first-class"), this
// is a genuinely distinct concept from `PaydaySchedule`/`CardCycle` — do not
// conflate them. Unlike a card cycle or (eventual) payday window, a budget
// period never straddles a month boundary: it IS the calendar month, so no
// cutoff-day clamping or cross-month shifting is needed.

import { type LedgerDate, ledgerDateFromString } from "../ledger-core/transaction";

const LEDGER_DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Small local equivalent of `matchLedgerDateShape`/parsing in
 * `ledger-core/transaction.ts` (not exported from there, so re-implemented
 * here, same technique as `domain/card-cycle.ts`) — extracts year/month/day
 * as numbers from a `LedgerDate` string. */
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
 * A budget period: a single calendar month, fully identified by its
 * year/month (no separate id — unlike `CreditCard`/`PaydaySchedule`, which
 * are named/configured Reference entities, a `BudgetPeriod` is a pure
 * derived value, more like `CardCycle`'s `{start, end}` shape).
 */
export interface BudgetPeriod {
  readonly year: number;
  readonly month: number;
}

/** Returns the `BudgetPeriod` (calendar month) that `date` falls within. */
export function budgetPeriodContaining(date: LedgerDate): BudgetPeriod {
  const { year, month } = parseLedgerDateParts(date);
  return { year, month };
}

/**
 * Returns the first and last calendar day of `period` as `LedgerDate`s
 * (e.g. `{ year: 2024, month: 2 }` → `{ start: "2024-02-01", end:
 * "2024-02-29" }` in a leap year).
 */
export function budgetPeriodRange(period: BudgetPeriod): { readonly start: LedgerDate; readonly end: LedgerDate } {
  const lastDay = daysInMonth(period.year, period.month);
  return {
    start: ledgerDateFromString(formatLedgerDate(period.year, period.month, 1)),
    end: ledgerDateFromString(formatLedgerDate(period.year, period.month, lastDay)),
  };
}

/**
 * True iff `date`'s year and month match `period.year`/`period.month`
 * exactly. Implemented via a direct parsed-field comparison, not via
 * `budgetPeriodRange` + string comparison.
 */
export function isDateWithinBudgetPeriod(date: LedgerDate, period: BudgetPeriod): boolean {
  const { year, month } = parseLedgerDateParts(date);
  return year === period.year && month === period.month;
}
