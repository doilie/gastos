import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ledgerDateFromString } from "../ledger-core/transaction";
import { createPaydaySchedule, paydayScheduleIdFromString } from "../reference/payday-schedule";
import { isDateWithinPaydayWindow, nextPaydayAfter, paydayWindowContaining } from "./payday-window";

const id = paydayScheduleIdFromString("schedule-1");
const monthlyOnly = createPaydaySchedule({ id, name: "Monthly", paydayDaysOfMonth: [15] });
const monthEnd = createPaydaySchedule({ id, name: "Month-end", paydayDaysOfMonth: [31] });

describe("paydayWindowContaining single-payday-per-month schedule", () => {
  it("spans roughly a full month, from one month's payday to the day before the next month's payday", () => {
    const window = paydayWindowContaining(monthlyOnly, ledgerDateFromString("2024-06-20"));
    expect(window).toEqual({
      start: ledgerDateFromString("2024-06-15"),
      end: ledgerDateFromString("2024-07-14"),
    });
  });

  it("a date before the configured day falls in the window starting the previous month's payday", () => {
    const window = paydayWindowContaining(monthlyOnly, ledgerDateFromString("2024-06-10"));
    expect(window).toEqual({
      start: ledgerDateFromString("2024-05-15"),
      end: ledgerDateFromString("2024-06-14"),
    });
  });

  it("a date exactly on a payday starts that payday's own window (not the window ending the day before it)", () => {
    const window = paydayWindowContaining(monthlyOnly, ledgerDateFromString("2024-06-15"));
    expect(window).toEqual({
      start: ledgerDateFromString("2024-06-15"),
      end: ledgerDateFromString("2024-07-14"),
    });
  });
});

describe("paydayWindowContaining month-end (day 31) clamping across a month boundary", () => {
  it("a date right after a clamped Feb payday (28, non-leap year) crosses into March correctly", () => {
    const window = paydayWindowContaining(monthEnd, ledgerDateFromString("2023-03-01"));
    expect(window).toEqual({
      start: ledgerDateFromString("2023-02-28"),
      end: ledgerDateFromString("2023-03-30"),
    });
  });

  it("a date exactly on the clamped Feb payday (leap year, 29) starts that payday's own window", () => {
    const window = paydayWindowContaining(monthEnd, ledgerDateFromString("2024-02-29"));
    expect(window).toEqual({
      start: ledgerDateFromString("2024-02-29"),
      end: ledgerDateFromString("2024-03-30"),
    });
  });
});

describe("isDateWithinPaydayWindow", () => {
  const window = paydayWindowContaining(monthlyOnly, ledgerDateFromString("2024-06-05"));

  it("the window's start date is within the window", () => {
    expect(isDateWithinPaydayWindow(window.start, window)).toBe(true);
  });

  it("the window's end date is within the window", () => {
    expect(isDateWithinPaydayWindow(window.end, window)).toBe(true);
  });

  it("a date strictly between start and end is within the window", () => {
    expect(isDateWithinPaydayWindow(ledgerDateFromString("2024-06-01"), window)).toBe(true);
  });

  it("a date one day before the window's start is not within the window", () => {
    expect(isDateWithinPaydayWindow(ledgerDateFromString("2024-05-14"), window)).toBe(false);
  });

  it("a date one day after the window's end is not within the window", () => {
    expect(isDateWithinPaydayWindow(ledgerDateFromString("2024-06-15"), window)).toBe(false);
  });
});

describe("nextPaydayAfter", () => {
  it("returns the next payday for a date strictly between two paydays", () => {
    expect(nextPaydayAfter(monthlyOnly, ledgerDateFromString("2024-06-20"))).toEqual(
      ledgerDateFromString("2024-07-15"),
    );
  });

  it("returns the FOLLOWING payday, not the date itself, when the date IS itself a payday", () => {
    expect(nextPaydayAfter(monthlyOnly, ledgerDateFromString("2024-06-15"))).toEqual(
      ledgerDateFromString("2024-07-15"),
    );
    // Confirm this is genuinely a different date than the input.
    expect(nextPaydayAfter(monthlyOnly, ledgerDateFromString("2024-06-15"))).not.toEqual(
      ledgerDateFromString("2024-06-15"),
    );
  });

  it("a single-payday-per-month schedule correctly reaches into the next calendar month", () => {
    expect(nextPaydayAfter(monthlyOnly, ledgerDateFromString("2024-06-20"))).toEqual(
      ledgerDateFromString("2024-07-15"),
    );
  });

  it("a month-end (day 31) schedule correctly resolves the clamped next payday across a month boundary", () => {
    expect(nextPaydayAfter(monthEnd, ledgerDateFromString("2023-03-01"))).toEqual(
      ledgerDateFromString("2023-03-31"),
    );
  });
});

describe("paydayWindowContaining property-based", () => {
  it("a date always falls within its own containing window (lexicographic YYYY-MM-DD comparison)", () => {
    const schedules = [monthlyOnly, monthEnd];
    const dates = [
      "2024-01-05",
      "2024-01-20",
      "2024-02-10",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
      "2023-02-15",
      "2023-02-28",
      "2024-06-14",
      "2024-06-15",
      "2024-06-30",
      "2024-07-01",
      "2024-12-31",
    ];

    fc.assert(
      fc.property(fc.constantFrom(...schedules), fc.constantFrom(...dates), (schedule, dateStr) => {
        const date = ledgerDateFromString(dateStr);
        const window = paydayWindowContaining(schedule, date);
        expect(isDateWithinPaydayWindow(date, window)).toBe(true);
      }),
    );
  });
});
