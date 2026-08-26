import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ledgerDateFromString } from "../ledger-core/transaction";
import {
  createPaydaySchedule,
  paydayScheduleIdFromString,
  paydaysInMonth,
  updatePaydaySchedule,
} from "./payday-schedule";

describe("paydayScheduleIdFromString", () => {
  it("accepts a normal non-empty string", () => {
    expect(paydayScheduleIdFromString("schedule-1")).toBe("schedule-1");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only (spaces)", "   "],
    ["whitespace-only (tab)", "\t"],
  ])("rejects %s (%p)", (_label, input) => {
    expect(() => paydayScheduleIdFromString(input)).toThrow();
  });
});

describe("paydayScheduleIdFromString property-based", () => {
  it("round-trips for any generated non-empty, non-whitespace-only string", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (input) => {
          expect(paydayScheduleIdFromString(input)).toBe(input);
        },
      ),
    );
  });
});

describe("createPaydaySchedule", () => {
  const id = paydayScheduleIdFromString("schedule-1");

  it("builds a valid PaydaySchedule from valid input, preserving id and paydayDaysOfMonth unchanged", () => {
    const schedule = createPaydaySchedule({ id, name: "Semi-monthly", paydayDaysOfMonth: [15, 31] });
    expect(schedule).toEqual({
      id,
      name: "Semi-monthly",
      paydayDaysOfMonth: [15, 31],
    });
  });

  it("trims leading/trailing whitespace from name", () => {
    const schedule = createPaydaySchedule({ id, name: "  Semi-monthly  ", paydayDaysOfMonth: [15] });
    expect(schedule.name).toBe("Semi-monthly");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
  ])("throws on %s name (%p)", (_label, name) => {
    expect(() => createPaydaySchedule({ id, name, paydayDaysOfMonth: [15] })).toThrow();
  });

  it("throws when paydayDaysOfMonth is empty", () => {
    expect(() => createPaydaySchedule({ id, name: "Empty", paydayDaysOfMonth: [] })).toThrow();
  });

  it.each([
    ["the lower boundary (1)", 1],
    ["the upper boundary (31)", 31],
  ])("accepts a boundary-valid single payday day: %s", (_label, day) => {
    const schedule = createPaydaySchedule({ id, name: "Monthly", paydayDaysOfMonth: [day] });
    expect(schedule.paydayDaysOfMonth).toEqual([day]);
  });

  it.each([
    ["zero", 0],
    ["above the upper boundary (32)", 32],
    ["a non-integer (15.5)", 15.5],
    ["negative (-1)", -1],
  ])("throws on an invalid payday day: %s (%p)", (_label, day) => {
    expect(() => createPaydaySchedule({ id, name: "Monthly", paydayDaysOfMonth: [day] })).toThrow();
  });

  it("throws when paydayDaysOfMonth contains a duplicate value", () => {
    expect(() => createPaydaySchedule({ id, name: "Duplicate", paydayDaysOfMonth: [15, 15] })).toThrow();
  });

  it("accepts multiple distinct valid days (the semi-monthly case)", () => {
    const schedule = createPaydaySchedule({ id, name: "Semi-monthly", paydayDaysOfMonth: [15, 31] });
    expect(schedule.paydayDaysOfMonth).toEqual([15, 31]);
  });
});

describe("updatePaydaySchedule", () => {
  const id = paydayScheduleIdFromString("schedule-1");
  const original = createPaydaySchedule({ id, name: "Semi-monthly", paydayDaysOfMonth: [15, 31] });

  it("applies a partial name-only update, leaving paydayDaysOfMonth unchanged", () => {
    const updated = updatePaydaySchedule(original, { name: "Renamed" });
    expect(updated).toEqual({ ...original, name: "Renamed" });
  });

  it("applies a partial paydayDaysOfMonth-only update, leaving name unchanged", () => {
    const updated = updatePaydaySchedule(original, { paydayDaysOfMonth: [1] });
    expect(updated).toEqual({ ...original, paydayDaysOfMonth: [1] });
  });

  it("applies both fields at once when both are given", () => {
    const updated = updatePaydaySchedule(original, { name: "Monthly", paydayDaysOfMonth: [1] });
    expect(updated).toEqual({ id, name: "Monthly", paydayDaysOfMonth: [1] });
  });

  it("never touches id", () => {
    const updated = updatePaydaySchedule(original, { name: "Renamed" });
    expect(updated.id).toBe(id);
  });

  it("trims a provided name", () => {
    const updated = updatePaydaySchedule(original, { name: "  Renamed  " });
    expect(updated.name).toBe("Renamed");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
  ])("throws on %s name (%p)", (_label, name) => {
    expect(() => updatePaydaySchedule(original, { name })).toThrow();
  });

  it("throws when paydayDaysOfMonth is empty", () => {
    expect(() => updatePaydaySchedule(original, { paydayDaysOfMonth: [] })).toThrow();
  });

  it.each([
    ["zero", 0],
    ["above the upper boundary (32)", 32],
    ["a non-integer (15.5)", 15.5],
  ])("throws on an invalid payday day: %s (%p)", (_label, day) => {
    expect(() => updatePaydaySchedule(original, { paydayDaysOfMonth: [day] })).toThrow();
  });

  it("throws when paydayDaysOfMonth contains a duplicate value", () => {
    expect(() => updatePaydaySchedule(original, { paydayDaysOfMonth: [15, 15] })).toThrow();
  });
});

describe("paydaysInMonth general behavior", () => {
  const id = paydayScheduleIdFromString("schedule-1");
  const semiMonthly = createPaydaySchedule({ id, name: "Semi-monthly", paydayDaysOfMonth: [15, 31] });

  it("a 31-day month (January) returns both configured days unclamped, ascending", () => {
    const paydays = paydaysInMonth(semiMonthly, 2024, 1);
    expect(paydays).toEqual([ledgerDateFromString("2024-01-15"), ledgerDateFromString("2024-01-31")]);
  });

  it("a 30-day month (April) clamps 31 to 30", () => {
    const paydays = paydaysInMonth(semiMonthly, 2024, 4);
    expect(paydays).toEqual([ledgerDateFromString("2024-04-15"), ledgerDateFromString("2024-04-30")]);
  });

  it("February of a non-leap year clamps 31 to 28", () => {
    const paydays = paydaysInMonth(semiMonthly, 2023, 2);
    expect(paydays).toEqual([ledgerDateFromString("2023-02-15"), ledgerDateFromString("2023-02-28")]);
  });

  it("February of a leap year clamps 31 to 29", () => {
    const paydays = paydaysInMonth(semiMonthly, 2024, 2);
    expect(paydays).toEqual([ledgerDateFromString("2024-02-15"), ledgerDateFromString("2024-02-29")]);
  });

  it("returns days sorted ascending even when the schedule's input order is descending", () => {
    const outOfOrder = createPaydaySchedule({ id, name: "Out of order", paydayDaysOfMonth: [31, 1] });
    const paydays = paydaysInMonth(outOfOrder, 2024, 1);
    expect(paydays).toEqual([ledgerDateFromString("2024-01-01"), ledgerDateFromString("2024-01-31")]);
  });

  it("two different configured days that clamp to the same actual date both appear in the result (no de-duplication)", () => {
    const bothMonthEnd = createPaydaySchedule({ id, name: "Month-end x2", paydayDaysOfMonth: [30, 31] });
    const paydays = paydaysInMonth(bothMonthEnd, 2023, 2);
    expect(paydays).toEqual([ledgerDateFromString("2023-02-28"), ledgerDateFromString("2023-02-28")]);
    expect(paydays).toHaveLength(2);
  });

  it.each([
    ["zero", 0],
    ["thirteen", 13],
    ["a non-integer (6.5)", 6.5],
  ])("throws on an invalid month: %s (%p)", (_label, month) => {
    expect(() => paydaysInMonth(semiMonthly, 2024, month)).toThrow();
  });
});

describe("paydaysInMonth property-based", () => {
  it("always returns one date per configured payday day, all within the requested year/month", () => {
    const id = paydayScheduleIdFromString("schedule-1");
    const schedule = createPaydaySchedule({ id, name: "Semi-monthly", paydayDaysOfMonth: [15, 31] });
    const year = 2024;

    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), (month) => {
        const paydays = paydaysInMonth(schedule, year, month);
        expect(paydays).toHaveLength(schedule.paydayDaysOfMonth.length);
        const expectedPrefix = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
        for (const payday of paydays) {
          expect(payday.startsWith(expectedPrefix)).toBe(true);
        }
      }),
    );
  });
});
