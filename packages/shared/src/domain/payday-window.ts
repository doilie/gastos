// Payday window: the derived "how much can I spend per day?" window (HLD
// §3.4, "Payday window | Payday → next payday − 1 (13–16 days, variable) |
// 'How much can I spend per day?' | Daily allowance") and §5's
// `PaydayWindow ──< derived from PaydaySchedule`. This is a Domain-layer
// file: it may depend on Ledger Core, Reference, and money, per the layer
// map in `packages/config/README.md`.
//
// A window runs from one payday (inclusive) through the day before the next
// payday (inclusive). Unlike `CardCycle` (always exactly one cutoff per
// month), a `PaydaySchedule` may configure multiple paydays per month (e.g.
// semi-monthly), so "the window containing this date" requires scanning a
// wider span of candidate paydays rather than just the current month's.

import { type LedgerDate, ledgerDateFromString } from "../ledger-core/transaction";
import { type PaydaySchedule, paydaysInMonth } from "../reference/payday-schedule";

const LEDGER_DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Small local equivalent of `matchLedgerDateShape`/parsing in
 * `ledger-core/transaction.ts` (not exported from there, so re-implemented
 * here, same technique as `domain/card-cycle.ts`/`domain/budget-period.ts`)
 * — extracts year/month/day as numbers from a `LedgerDate` string. */
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

function formatLedgerDate(year: number, month: number, day: number): string {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Adds `delta` months to `year`/`month` (1-indexed), rolling the year over in
 * either direction. Implemented with integer arithmetic, no looping. Same
 * technique as `domain/card-cycle.ts`'s private `shiftMonth`, reimplemented
 * locally per this codebase's convention of small duplication across domain
 * files rather than importing another file's private helpers.
 */
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroIndexedMonth = month - 1 + delta;
  const newMonth = ((zeroIndexedMonth % 12) + 12) % 12;
  const yearOffset = Math.floor(zeroIndexedMonth / 12);
  return { year: year + yearOffset, month: newMonth + 1 };
}

/** Returns the calendar day before `date`, via a `Date.UTC` round-trip — the
 * mirror image of `card-cycle.ts`'s `nextLedgerDay`. */
function previousLedgerDay(date: LedgerDate): LedgerDate {
  const { year, month, day } = parseLedgerDateParts(date);
  const priorDay = new Date(Date.UTC(year, month - 1, day - 1));
  return ledgerDateFromString(
    formatLedgerDate(priorDay.getUTCFullYear(), priorDay.getUTCMonth() + 1, priorDay.getUTCDate()),
  );
}

/** Returns the calendar day after `date`, via a `Date.UTC` round-trip — the
 * mirror image of `previousLedgerDay` above (and of `card-cycle.ts`'s own
 * private `nextLedgerDay`, reimplemented here per this file's established
 * per-file-duplication convention rather than importing another file's
 * private helper). */
function nextLedgerDay(date: LedgerDate): LedgerDate {
  const { year, month, day } = parseLedgerDateParts(date);
  const followingDay = new Date(Date.UTC(year, month - 1, day + 1));
  return ledgerDateFromString(
    formatLedgerDate(followingDay.getUTCFullYear(), followingDay.getUTCMonth() + 1, followingDay.getUTCDate()),
  );
}

/**
 * Returns the concatenation of the previous, current, and next months'
 * paydays for `schedule`, in that chronological order. Not sorted or
 * deduplicated further — each `paydaysInMonth` call already returns dates
 * sorted ascending, and the three months' ranges are chronologically
 * non-overlapping, so the concatenation is already globally sorted. Fetching
 * one month before/after is sufficient: since `date` always falls within the
 * "current" month by construction, the payday bracketing it can only ever be
 * found within {previous, current} or {current, next} — never further out,
 * given `PaydaySchedule` is validated to have at least one payday per month.
 */
function candidatePaydays(schedule: PaydaySchedule, year: number, month: number): readonly LedgerDate[] {
  const previous = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  return [
    ...paydaysInMonth(schedule, previous.year, previous.month),
    ...paydaysInMonth(schedule, year, month),
    ...paydaysInMonth(schedule, next.year, next.month),
  ];
}

/**
 * The largest candidate that is `<= date` — i.e. the payday that starts the
 * window containing `date`. `candidates` is already sorted ascending, so
 * this is the last element after filtering to entries `<= date`.
 */
function findWindowStart(candidates: readonly LedgerDate[], date: LedgerDate): LedgerDate {
  const eligible = candidates.filter((candidate) => candidate <= date);
  if (eligible.length === 0) {
    throw new Error(
      "findWindowStart: no payday found on or before the given date — this indicates a " +
        "PaydaySchedule/date mismatch that shouldn't occur in practice given at least one " +
        "payday per month is guaranteed",
    );
  }
  const start = eligible[eligible.length - 1];
  if (start === undefined) {
    throw new Error(
      "findWindowStart: no payday found on or before the given date — this indicates a " +
        "PaydaySchedule/date mismatch that shouldn't occur in practice given at least one " +
        "payday per month is guaranteed",
    );
  }
  return start;
}

/**
 * The smallest candidate that is strictly `> windowStart` — i.e. the next
 * payday after the window's start. Using a strict `>` comparison correctly
 * skips past any duplicate-valued entries at `windowStart` itself, without
 * needing a separate dedup step.
 */
function findNextPayday(candidates: readonly LedgerDate[], windowStart: LedgerDate): LedgerDate {
  const eligible = candidates.filter((candidate) => candidate > windowStart);
  const next = eligible[0];
  if (next === undefined) {
    throw new Error(
      "findNextPayday: no payday found after the window's start — this indicates a " +
        "PaydaySchedule/date mismatch that shouldn't occur in practice given at least one " +
        "payday per month is guaranteed",
    );
  }
  return next;
}

/** A payday window: from one payday (inclusive) through the day before the
 * next payday (inclusive). Same shape as `CardCycle` — a pure derived value,
 * no id. */
export interface PaydayWindow {
  readonly start: LedgerDate;
  readonly end: LedgerDate;
}

/**
 * Computes the payday window (start/end, both inclusive) that `date` falls
 * into for `schedule`. Unlike `cardCycleContaining` (always exactly one
 * cutoff per month), `schedule` may configure multiple paydays per month, so
 * candidates are gathered from the previous, current, and next month before
 * bracketing `date`.
 */
export function paydayWindowContaining(schedule: PaydaySchedule, date: LedgerDate): PaydayWindow {
  const { year, month } = parseLedgerDateParts(date);
  const candidates = candidatePaydays(schedule, year, month);
  const start = findWindowStart(candidates, date);
  const nextPayday = findNextPayday(candidates, start);
  const end = previousLedgerDay(nextPayday);
  return { start, end };
}

/**
 * True iff `date` falls within `window`'s span, inclusive on both ends.
 * `LedgerDate` is always a zero-padded `YYYY-MM-DD` string, so lexicographic
 * string comparison is equivalent to chronological comparison here.
 */
export function isDateWithinPaydayWindow(date: LedgerDate, window: PaydayWindow): boolean {
  return window.start <= date && date <= window.end;
}

/**
 * Returns the payday strictly after `date` for `schedule` — i.e. if `date`
 * IS itself a payday, this returns the *next* one, not `date` itself. This
 * falls out correctly with no special-casing: `paydayWindowContaining`'s
 * `window.end` is always the day before the true next payday by
 * construction, so stepping one day forward from it recovers that next
 * payday exactly.
 */
export function nextPaydayAfter(schedule: PaydaySchedule, date: LedgerDate): LedgerDate {
  const window = paydayWindowContaining(schedule, date);
  return nextLedgerDay(window.end);
}
