import { describe, expect, it } from "vitest";

import { centsFromInt } from "../money";
import { ledgerDateFromString } from "../ledger-core/transaction";
import { createPaydaySchedule, paydayScheduleIdFromString } from "../reference/payday-schedule";
import { budgetPeriodContaining, budgetPeriodRange } from "./budget-period";
import { dailySpendableAllowance, daysRemainingToSpend, spendableRunwayEnd } from "./daily-spendable";

// Mirrors the seeded-style semi-monthly schedule used elsewhere (e.g.
// payday-window.test.ts's `semiMonthly` fixture): paydays on the 15th and
// the last day of the month (31 clamps to the actual last day).
const semiMonthlySchedule = createPaydaySchedule({
  id: paydayScheduleIdFromString("schedule-semi-monthly"),
  name: "Semi-monthly",
  paydayDaysOfMonth: [15, 31],
});

// A schedule whose single configured payday does NOT land on month-end in a
// 30/31-day month — this is the fixture that proves spendableRunwayEnd's
// "whichever comes first" rule generalizes beyond the seed data's
// coincidental day-31-clamps-to-month-end alignment.
const singlePaydaySchedule = createPaydaySchedule({
  id: paydayScheduleIdFromString("schedule-single-payday"),
  name: "Monthly on the 10th",
  paydayDaysOfMonth: [10],
});

describe("spendableRunwayEnd — no schedule (undefined)", () => {
  it("falls back to month-end only, regardless of where in the month referenceDate falls", () => {
    const referenceDate = ledgerDateFromString("2024-06-10");
    const monthEnd = budgetPeriodRange(budgetPeriodContaining(referenceDate)).end;
    expect(monthEnd).toBe("2024-06-30");
    expect(spendableRunwayEnd(undefined, referenceDate)).toBe(monthEnd);
  });
});

describe("spendableRunwayEnd — seeded-style [15, 31] schedule", () => {
  it("resolves to the 15th when referenceDate is before it", () => {
    const referenceDate = ledgerDateFromString("2024-06-05");
    expect(spendableRunwayEnd(semiMonthlySchedule, referenceDate)).toBe("2024-06-15");
  });

  it("resolves to month-end when referenceDate is after the 15th but before month-end (the day-31 payday clamps to coincide with month-end in this schedule)", () => {
    const referenceDate = ledgerDateFromString("2024-06-20");
    const monthEnd = budgetPeriodRange(budgetPeriodContaining(referenceDate)).end;
    expect(monthEnd).toBe("2024-06-30");
    expect(spendableRunwayEnd(semiMonthlySchedule, referenceDate)).toBe("2024-06-30");
  });
});

describe("spendableRunwayEnd — a schedule whose payday does NOT land on month-end", () => {
  it("returns genuine month-end (not a coincidentally-equal next-month payday) once the configured payday has already passed", () => {
    // singlePaydaySchedule pays only on the 10th. At 2024-06-20 (after
    // June 10 has already passed), the *next* payday is July 10 — but the
    // runway end must still be June 30 (month-end comes first).
    const referenceDate = ledgerDateFromString("2024-06-20");
    const monthEnd = budgetPeriodRange(budgetPeriodContaining(referenceDate)).end;
    expect(monthEnd).toBe("2024-06-30");

    const runwayEnd = spendableRunwayEnd(singlePaydaySchedule, referenceDate);
    expect(runwayEnd).toBe("2024-06-30");
    expect(runwayEnd).not.toBe("2024-07-10");
  });
});

describe("daysRemainingToSpend / dailySpendableAllowance — boundary day (Math.max(1, ...) floor)", () => {
  it("returns exactly 1 when referenceDate IS month-end itself, with no schedule configured", () => {
    const referenceDate = ledgerDateFromString("2024-06-30");
    expect(spendableRunwayEnd(undefined, referenceDate)).toBe(referenceDate);
    expect(daysRemainingToSpend(undefined, referenceDate)).toBe(1);

    const balance = centsFromInt(9999);
    expect(dailySpendableAllowance(balance, undefined, referenceDate)).toBe(balance);
  });

  it("returns exactly 1 when referenceDate IS month-end itself, with a schedule whose payday also coincides with month-end", () => {
    // semiMonthlySchedule's second payday (day 31, clamped) coincides
    // exactly with June's month-end (June 30) — referenceDate here equals
    // BOTH the runway end candidates simultaneously.
    const referenceDate = ledgerDateFromString("2024-06-30");
    expect(spendableRunwayEnd(semiMonthlySchedule, referenceDate)).toBe(referenceDate);
    expect(daysRemainingToSpend(semiMonthlySchedule, referenceDate)).toBe(1);
  });

  it("returns exactly 1 when referenceDate IS month-end, even for a schedule whose payday does NOT naturally coincide with month-end", () => {
    // singlePaydaySchedule's next payday after June 30 is July 10 (the
    // payday on the 10th has already passed this month) — the runway end
    // still resolves to month-end (June 30) via the "whichever comes
    // first" rule, which happens to equal referenceDate itself here,
    // proving the Math.max(1, ...) floor triggers via the month-end path
    // regardless of the schedule's specific configuration.
    const referenceDate = ledgerDateFromString("2024-06-30");
    expect(spendableRunwayEnd(singlePaydaySchedule, referenceDate)).toBe(referenceDate);
    expect(daysRemainingToSpend(singlePaydaySchedule, referenceDate)).toBe(1);

    const balance = centsFromInt(12345);
    expect(dailySpendableAllowance(balance, singlePaydaySchedule, referenceDate)).toBe(balance);
  });
});

describe("dailySpendableAllowance — end-to-end, hand-computed expectation", () => {
  it("divides the balance across the days remaining until month-end (single-payday schedule, payday already passed)", () => {
    // singlePaydaySchedule pays on the 10th only. At 2024-06-27 (after
    // June 10 already passed), the next payday is July 10, but month-end
    // (June 30) comes first, so the runway is June 27 -> June 30: 3 days.
    const referenceDate = ledgerDateFromString("2024-06-27");
    expect(spendableRunwayEnd(singlePaydaySchedule, referenceDate)).toBe("2024-06-30");
    expect(daysRemainingToSpend(singlePaydaySchedule, referenceDate)).toBe(3);

    // Hand-computed independently of the code under test:
    // balance = 1000 cents ($10.00), spread over 3 days = 333.33... cents/day,
    // which rounds HALF AWAY FROM ZERO down to 333 cents ($3.33/day) since
    // 333.33 is below the halfway point to 334.
    const balance = centsFromInt(1000);
    expect(dailySpendableAllowance(balance, singlePaydaySchedule, referenceDate)).toBe(333);
  });
});
