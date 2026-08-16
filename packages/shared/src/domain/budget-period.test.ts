import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ledgerDateFromString } from "../ledger-core/transaction";
import { budgetPeriodContaining, budgetPeriodRange, isDateWithinBudgetPeriod } from "./budget-period";

describe("budgetPeriodContaining", () => {
  it("a date in the middle of a month returns that month's period", () => {
    expect(budgetPeriodContaining(ledgerDateFromString("2024-06-15"))).toEqual({ year: 2024, month: 6 });
  });

  it("a date on the first day of a month returns that month's period (not the previous one)", () => {
    expect(budgetPeriodContaining(ledgerDateFromString("2024-06-01"))).toEqual({ year: 2024, month: 6 });
  });

  it("a date on the last day of a month returns that month's period (not the next one)", () => {
    expect(budgetPeriodContaining(ledgerDateFromString("2024-06-30"))).toEqual({ year: 2024, month: 6 });
  });

  it("a January date returns month 1", () => {
    expect(budgetPeriodContaining(ledgerDateFromString("2024-01-15"))).toEqual({ year: 2024, month: 1 });
  });

  it("a December date returns month 12", () => {
    expect(budgetPeriodContaining(ledgerDateFromString("2024-12-15"))).toEqual({ year: 2024, month: 12 });
  });
});

describe("budgetPeriodRange", () => {
  it("a 31-day month (January) spans the first to the last day", () => {
    expect(budgetPeriodRange({ year: 2024, month: 1 })).toEqual({
      start: ledgerDateFromString("2024-01-01"),
      end: ledgerDateFromString("2024-01-31"),
    });
  });

  it("a 30-day month (April) spans the first to the last day", () => {
    expect(budgetPeriodRange({ year: 2024, month: 4 })).toEqual({
      start: ledgerDateFromString("2024-04-01"),
      end: ledgerDateFromString("2024-04-30"),
    });
  });

  it("February in a non-leap year ends on the 28th", () => {
    expect(budgetPeriodRange({ year: 2023, month: 2 })).toEqual({
      start: ledgerDateFromString("2023-02-01"),
      end: ledgerDateFromString("2023-02-28"),
    });
  });

  it("February in a leap year ends on the 29th", () => {
    expect(budgetPeriodRange({ year: 2024, month: 2 })).toEqual({
      start: ledgerDateFromString("2024-02-01"),
      end: ledgerDateFromString("2024-02-29"),
    });
  });
});

describe("isDateWithinBudgetPeriod", () => {
  const period = { year: 2024, month: 6 };

  it("the first day of the period's month is within the period", () => {
    expect(isDateWithinBudgetPeriod(ledgerDateFromString("2024-06-01"), period)).toBe(true);
  });

  it("a date in the middle of the period's month is within the period", () => {
    expect(isDateWithinBudgetPeriod(ledgerDateFromString("2024-06-15"), period)).toBe(true);
  });

  it("the last day of the period's month is within the period", () => {
    expect(isDateWithinBudgetPeriod(ledgerDateFromString("2024-06-30"), period)).toBe(true);
  });

  it("one day before the period's start (last day of the previous month) is not within the period", () => {
    expect(isDateWithinBudgetPeriod(ledgerDateFromString("2024-05-31"), period)).toBe(false);
  });

  it("one day after the period's end (first day of the next month) is not within the period", () => {
    expect(isDateWithinBudgetPeriod(ledgerDateFromString("2024-07-01"), period)).toBe(false);
  });

  it("the same month number but a different year is not within the period", () => {
    expect(isDateWithinBudgetPeriod(ledgerDateFromString("2023-06-15"), period)).toBe(false);
  });
});

describe("budget-period cross-check consistency", () => {
  it("a hand-picked February leap-year date is within its own containing period and range", () => {
    const date = ledgerDateFromString("2024-02-29");
    const period = budgetPeriodContaining(date);
    const range = budgetPeriodRange(period);
    expect(isDateWithinBudgetPeriod(date, period)).toBe(true);
    expect(range.start <= date).toBe(true);
    expect(date <= range.end).toBe(true);
  });

  it("property: any date always falls within its own containing period, and within that period's range (lexicographic YYYY-MM-DD comparison)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (year, month, day) => {
          const yyyy = String(year).padStart(4, "0");
          const mm = String(month).padStart(2, "0");
          const dd = String(day).padStart(2, "0");
          const date = ledgerDateFromString(`${yyyy}-${mm}-${dd}`);

          const period = budgetPeriodContaining(date);
          expect(isDateWithinBudgetPeriod(date, period)).toBe(true);

          const range = budgetPeriodRange(period);
          expect(range.start <= date).toBe(true);
          expect(date <= range.end).toBe(true);
        },
      ),
    );
  });
});
