import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ledgerDateFromString } from "../ledger-core/transaction";
import { cardCycleContaining, isDateWithinCardCycle } from "./card-cycle";

describe("cardCycleContaining general behavior", () => {
  it("a date on or before the cutoff falls in the cycle ending this month's cutoff", () => {
    const cycle = cardCycleContaining(17, ledgerDateFromString("2024-06-10"));
    expect(cycle).toEqual({
      start: ledgerDateFromString("2024-05-18"),
      end: ledgerDateFromString("2024-06-17"),
    });
  });

  it("a date after the cutoff falls in the cycle ending next month's cutoff", () => {
    const cycle = cardCycleContaining(17, ledgerDateFromString("2024-06-20"));
    expect(cycle).toEqual({
      start: ledgerDateFromString("2024-06-18"),
      end: ledgerDateFromString("2024-07-17"),
    });
  });

  it("a date exactly on the cutoff day falls in the cycle ending that day (not starting the next one)", () => {
    const cycle = cardCycleContaining(17, ledgerDateFromString("2024-06-17"));
    expect(cycle).toEqual({
      start: ledgerDateFromString("2024-05-18"),
      end: ledgerDateFromString("2024-06-17"),
    });
  });
});

describe("cardCycleContaining month/year rollover", () => {
  it("rolls the cycle's start back into December of the previous year", () => {
    const cycle = cardCycleContaining(1, ledgerDateFromString("2024-01-01"));
    expect(cycle).toEqual({
      start: ledgerDateFromString("2023-12-02"),
      end: ledgerDateFromString("2024-01-01"),
    });
  });

  it("rolls the cycle's end into January of the next year", () => {
    const cycle = cardCycleContaining(20, ledgerDateFromString("2024-12-25"));
    expect(cycle).toEqual({
      start: ledgerDateFromString("2024-12-21"),
      end: ledgerDateFromString("2025-01-20"),
    });
  });
});

describe("cardCycleContaining clamping to short months", () => {
  it("clamps cutoffDay 31 to February 29 in a leap year", () => {
    const cycle = cardCycleContaining(31, ledgerDateFromString("2024-02-15"));
    expect(cycle).toEqual({
      start: ledgerDateFromString("2024-02-01"),
      end: ledgerDateFromString("2024-02-29"),
    });
  });

  it("clamps cutoffDay 31 to February 28 in a non-leap year", () => {
    const cycle = cardCycleContaining(31, ledgerDateFromString("2023-02-15"));
    expect(cycle).toEqual({
      start: ledgerDateFromString("2023-02-01"),
      end: ledgerDateFromString("2023-02-28"),
    });
  });

  it("clamps cutoffDay 30 to the last day of February (28 in a non-leap year)", () => {
    const cycle = cardCycleContaining(30, ledgerDateFromString("2023-02-15"));
    expect(cycle.end).toBe(ledgerDateFromString("2023-02-28"));
  });
});

describe("cardCycleContaining validation", () => {
  it.each([
    ["zero", 0],
    ["above the upper boundary (32)", 32],
    ["a non-integer (15.5)", 15.5],
    ["negative (-1)", -1],
  ])("throws on an invalid cutoffDay: %s (%p)", (_label, cutoffDay) => {
    expect(() => cardCycleContaining(cutoffDay, ledgerDateFromString("2024-06-10"))).toThrow();
  });
});

describe("isDateWithinCardCycle", () => {
  const cycle = cardCycleContaining(17, ledgerDateFromString("2024-06-10"));

  it("a date equal to cycle.start is within the cycle", () => {
    expect(isDateWithinCardCycle(cycle.start, cycle)).toBe(true);
  });

  it("a date equal to cycle.end is within the cycle", () => {
    expect(isDateWithinCardCycle(cycle.end, cycle)).toBe(true);
  });

  it("a date strictly between cycle.start and cycle.end is within the cycle", () => {
    expect(isDateWithinCardCycle(ledgerDateFromString("2024-06-01"), cycle)).toBe(true);
  });

  it("a date one day before cycle.start is not within the cycle", () => {
    expect(isDateWithinCardCycle(ledgerDateFromString("2024-05-17"), cycle)).toBe(false);
  });

  it("a date one day after cycle.end is not within the cycle", () => {
    expect(isDateWithinCardCycle(ledgerDateFromString("2024-06-18"), cycle)).toBe(false);
  });
});

describe("cardCycleContaining property-based", () => {
  it("date always falls within [cycle.start, cycle.end] inclusive (lexicographic YYYY-MM-DD comparison)", () => {
    const cutoffDays = [1, 15, 28];
    const dates = [
      "2024-01-05",
      "2024-01-20",
      "2024-02-10",
      "2024-02-28",
      "2024-03-01",
      "2024-06-17",
      "2024-06-18",
      "2024-11-30",
      "2024-12-01",
      "2024-12-31",
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...cutoffDays),
        fc.constantFrom(...dates),
        (cutoffDay, dateStr) => {
          const date = ledgerDateFromString(dateStr);
          const cycle = cardCycleContaining(cutoffDay, date);
          expect(cycle.start <= date).toBe(true);
          expect(date <= cycle.end).toBe(true);
        },
      ),
    );
  });
});
