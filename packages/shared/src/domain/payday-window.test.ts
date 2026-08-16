import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ledgerDateFromString } from "../ledger-core/transaction";
import { createPaydaySchedule, paydayScheduleIdFromString } from "../reference/payday-schedule";
import { isDateWithinPaydayWindow, paydayWindowContaining } from "./payday-window";

const id = paydayScheduleIdFromString("schedule-1");
const semiMonthly = createPaydaySchedule({ id, name: "Semi-monthly", paydayDaysOfMonth: [15, 31] });
const monthEndDuplicate = createPaydaySchedule({ id, name: "Month-end x2", paydayDaysOfMonth: [30, 31] });
const monthlyOnly = createPaydaySchedule({ id, name: "Monthly", paydayDaysOfMonth: [15] });

describe("paydayWindowContaining traced cases", () => {
  it("a date before the 15th falls in the window starting May's last payday", () => {
    const window = paydayWindowContaining(semiMonthly, ledgerDateFromString("2024-06-05"));
    expect(window).toEqual({
      start: ledgerDateFromString("2024-05-31"),
      end: ledgerDateFromString("2024-06-14"),
    });
  });

  it("a date after the 15th (within June) falls in the window starting June 15, clamped to June 29 (30-1)", () => {
    const window = paydayWindowContaining(semiMonthly, ledgerDateFromString("2024-06-20"));
    expect(window).toEqual({
      start: ledgerDateFromString("2024-06-15"),
      end: ledgerDateFromString("2024-06-29"),
    });
  });

  it("a date right after June's last (clamped) payday crosses the month boundary", () => {
    const window = paydayWindowContaining(semiMonthly, ledgerDateFromString("2024-07-01"));
    expect(window).toEqual({
      start: ledgerDateFromString("2024-06-30"),
      end: ledgerDateFromString("2024-07-14"),
    });
  });

  it("duplicate-clamped paydays (30 and 31 both -> Feb 28 in a non-leap year): a date before the duplicate", () => {
    const window = paydayWindowContaining(monthEndDuplicate, ledgerDateFromString("2023-02-15"));
    expect(window).toEqual({
      start: ledgerDateFromString("2023-01-31"),
      end: ledgerDateFromString("2023-02-27"),
    });
  });

  it("duplicate-clamped paydays: a date exactly on the duplicate-clamped payday starts a full window (strict > treats the duplicate pair as one boundary)", () => {
    const window = paydayWindowContaining(monthEndDuplicate, ledgerDateFromString("2023-02-28"));
    expect(window).toEqual({
      start: ledgerDateFromString("2023-02-28"),
      end: ledgerDateFromString("2023-03-29"),
    });
  });
});

describe("paydayWindowContaining on-payday-itself behavior", () => {
  it("a date exactly on a payday starts that payday's own window (not the window ending the day before it)", () => {
    const window = paydayWindowContaining(semiMonthly, ledgerDateFromString("2024-06-15"));
    expect(window).toEqual({
      start: ledgerDateFromString("2024-06-15"),
      end: ledgerDateFromString("2024-06-29"),
    });
  });
});

describe("paydayWindowContaining single-payday-per-month schedule", () => {
  it("spans roughly a full month, from one month's payday to the day before the next month's payday", () => {
    const window = paydayWindowContaining(monthlyOnly, ledgerDateFromString("2024-06-20"));
    expect(window).toEqual({
      start: ledgerDateFromString("2024-06-15"),
      end: ledgerDateFromString("2024-07-14"),
    });
  });
});

describe("isDateWithinPaydayWindow", () => {
  const window = paydayWindowContaining(semiMonthly, ledgerDateFromString("2024-06-05"));

  it("the window's start date is within the window", () => {
    expect(isDateWithinPaydayWindow(window.start, window)).toBe(true);
  });

  it("the window's end date is within the window", () => {
    expect(isDateWithinPaydayWindow(window.end, window)).toBe(true);
  });

  it("a date strictly between start and end is within the window", () => {
    expect(isDateWithinPaydayWindow(ledgerDateFromString("2024-06-07"), window)).toBe(true);
  });

  it("a date one day before the window's start is not within the window", () => {
    expect(isDateWithinPaydayWindow(ledgerDateFromString("2024-05-30"), window)).toBe(false);
  });

  it("a date one day after the window's end is not within the window", () => {
    expect(isDateWithinPaydayWindow(ledgerDateFromString("2024-06-15"), window)).toBe(false);
  });
});

describe("paydayWindowContaining property-based", () => {
  it("a date always falls within its own containing window (lexicographic YYYY-MM-DD comparison)", () => {
    const schedules = [semiMonthly, monthEndDuplicate, monthlyOnly];
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
