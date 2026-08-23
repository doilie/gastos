// Daily spendable allowance: the derived "how much can I spend per day?"
// figure (HLD §3.4, "Payday window | Payday → next payday − 1 (13–16 days,
// variable) | 'How much can I spend per day?' | Daily allowance" —
// `payday-window.ts` builds the window itself; this file is the piece that
// actually computes that number, previously undocumented in code). This is
// a Domain-layer file: it may depend on Ledger Core, Reference, and money,
// per the layer map in `packages/config/README.md`.

import { budgetPeriodContaining, budgetPeriodRange } from "./budget-period";
import { nextPaydayAfter } from "./payday-window";
import type { PaydaySchedule } from "../reference/payday-schedule";
import { daysBetweenLedgerDates, type LedgerDate } from "../ledger-core/transaction";
import { divideCents, type Cents } from "../money";

/**
 * The last date the Spendable envelope's current balance needs to last through:
 * whichever comes first, the next payday or the end of the current calendar month.
 * Falls back to month-end alone when no `schedule` is available (e.g. no
 * PaydaySchedule configured yet). `LedgerDate` is zero-padded `YYYY-MM-DD`, so
 * lexicographic string comparison is equivalent to chronological comparison —
 * same trick `payday-window.ts`'s `isDateWithinPaydayWindow` already relies on.
 */
export function spendableRunwayEnd(
  schedule: PaydaySchedule | undefined,
  referenceDate: LedgerDate,
): LedgerDate {
  const monthEnd = budgetPeriodRange(budgetPeriodContaining(referenceDate)).end;
  if (schedule === undefined) {
    return monthEnd;
  }
  const nextPayday = nextPaydayAfter(schedule, referenceDate);
  return nextPayday < monthEnd ? nextPayday : monthEnd;
}

/**
 * Days remaining from `referenceDate` through `spendableRunwayEnd`, floored at 1 (so
 * the boundary day itself — referenceDate === the runway end — still divides by 1,
 * not 0).
 */
export function daysRemainingToSpend(
  schedule: PaydaySchedule | undefined,
  referenceDate: LedgerDate,
): number {
  const runwayEnd = spendableRunwayEnd(schedule, referenceDate);
  return Math.max(1, daysBetweenLedgerDates(referenceDate, runwayEnd));
}

/**
 * The Spendable envelope's `balance` divided evenly across the days remaining until
 * money either runs out (month end) or gets replenished (the next payday) —
 * whichever is sooner. This is the one function callers actually need; the two above
 * are exported separately since each is independently useful/testable.
 */
export function dailySpendableAllowance(
  balance: Cents,
  schedule: PaydaySchedule | undefined,
  referenceDate: LedgerDate,
): Cents {
  return divideCents(balance, daysRemainingToSpend(schedule, referenceDate));
}
