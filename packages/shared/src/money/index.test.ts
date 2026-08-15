import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  ZERO_CENTS,
  addCents,
  centsFromInt,
  compareCents,
  formatCents,
  isZeroCents,
  multiplyCents,
  negateCents,
  parseCents,
  subtractCents,
  sumCents,
  type Cents,
} from "./index";

describe("centsFromInt", () => {
  it.each([
    [0, 0],
    [1, 1],
    [-1, -1],
    [123456, 123456],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    [Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER],
  ])("accepts safe integer %p", (input, expected) => {
    expect(centsFromInt(input)).toBe(expected);
  });

  it.each([
    ["a non-integer", 1.5],
    ["NaN", Number.NaN],
    ["positive Infinity", Number.POSITIVE_INFINITY],
    ["negative Infinity", Number.NEGATIVE_INFINITY],
    ["above MAX_SAFE_INTEGER", Number.MAX_SAFE_INTEGER + 1],
    ["below MIN_SAFE_INTEGER", Number.MIN_SAFE_INTEGER - 1],
  ])("rejects %s", (_label, input) => {
    expect(() => centsFromInt(input)).toThrow();
  });
});

describe("parseCents / formatCents round-trip", () => {
  it.each([
    ["0", "0.00"],
    ["0.00", "0.00"],
    ["12", "12.00"],
    ["12.5", "12.50"],
    ["12.50", "12.50"],
    ["1234.56", "1234.56"],
    ["-12.50", "-12.50"],
    ["-0.01", "-0.01"],
    ["+12.34", "12.34"],
    ["0.1", "0.10"],
    ["0.01", "0.01"],
  ])("parses %p into cents that format back to %p", (input, expectedFormatted) => {
    const cents = parseCents(input);
    expect(formatCents(cents)).toBe(expectedFormatted);
  });

  it("parses whole numbers to a value with no remainder", () => {
    expect(parseCents("42")).toBe(4200);
  });

  it("parses a single fractional digit as tenths of a centavo unit", () => {
    expect(parseCents("1.5")).toBe(150);
  });

  it("formats zero without a sign", () => {
    expect(formatCents(ZERO_CENTS)).toBe("0.00");
  });

  it("formats a negative value with a leading minus", () => {
    expect(formatCents(centsFromInt(-500))).toBe("-5.00");
  });
});

describe("parseCents malformed input", () => {
  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
    ["multiple decimal points", "12.3.4"],
    ["non-numeric garbage", "abc"],
    ["more than 2 fractional digits", "1.234"],
    ["thousands separator", "1,234.56"],
    ["trailing decimal point with no digits", "12."],
    ["lone sign", "-"],
    ["lone decimal point", "."],
    ["double sign", "--12"],
    ["currency symbol", "$12.00"],
  ])("rejects %s (%p)", (_label, input) => {
    expect(() => parseCents(input)).toThrow();
  });
});

describe("addCents / subtractCents / negateCents / sumCents", () => {
  it("adds two positive values", () => {
    expect(addCents(centsFromInt(100), centsFromInt(50))).toBe(150);
  });

  it("adds a positive and a negative value", () => {
    expect(addCents(centsFromInt(100), centsFromInt(-30))).toBe(70);
  });

  it("subtracts b from a", () => {
    expect(subtractCents(centsFromInt(100), centsFromInt(30))).toBe(70);
  });

  it("subtracts to produce a negative result", () => {
    expect(subtractCents(centsFromInt(30), centsFromInt(100))).toBe(-70);
  });

  it("negates a positive value", () => {
    expect(negateCents(centsFromInt(100))).toBe(-100);
  });

  it("negates a negative value", () => {
    expect(negateCents(centsFromInt(-100))).toBe(100);
  });

  it("negates zero to zero", () => {
    // negateCents(0) may legitimately produce IEEE-754 -0 (numerically
    // equal to 0 via `===`, but distinct under `Object.is`/`toBe`).
    expect(negateCents(ZERO_CENTS) === 0).toBe(true);
  });

  it("sums an empty list to ZERO_CENTS", () => {
    expect(sumCents([])).toBe(ZERO_CENTS);
  });

  it("sums a list of mixed-sign values", () => {
    const values: Cents[] = [centsFromInt(100), centsFromInt(-25), centsFromInt(5)];
    expect(sumCents(values)).toBe(80);
  });

  it("sums a single-element list to that element", () => {
    expect(sumCents([centsFromInt(42)])).toBe(42);
  });
});

describe("overflow guards near the safe-integer boundary", () => {
  const maxSafe = centsFromInt(Number.MAX_SAFE_INTEGER);
  const minSafe = centsFromInt(Number.MIN_SAFE_INTEGER);

  it("addCents throws when the result exceeds MAX_SAFE_INTEGER", () => {
    expect(() => addCents(maxSafe, centsFromInt(1))).toThrow();
  });

  it("subtractCents throws when the result is below MIN_SAFE_INTEGER", () => {
    expect(() => subtractCents(minSafe, centsFromInt(1))).toThrow();
  });

  it("sumCents throws when the running total exceeds MAX_SAFE_INTEGER", () => {
    expect(() => sumCents([maxSafe, centsFromInt(10)])).toThrow();
  });

  it("multiplyCents throws when the rounded result exceeds MAX_SAFE_INTEGER", () => {
    expect(() => multiplyCents(maxSafe, 2)).toThrow();
  });

  it("addCents does not throw exactly at MAX_SAFE_INTEGER", () => {
    const almostMax = centsFromInt(Number.MAX_SAFE_INTEGER - 1);
    expect(addCents(almostMax, centsFromInt(1))).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("multiplyCents rounding: half away from zero", () => {
  it.each([
    [101, 0.5, 51],
    [103, 0.5, 52],
    [100, 0.5, 50],
    [1, 2.5, 3],
    [3, 2.5, 8],
  ])("rounds %p * %p to %p (positive, away from zero)", (value, factor, expected) => {
    expect(multiplyCents(centsFromInt(value), factor)).toBe(expected);
  });

  it.each([
    [-101, 0.5, -51],
    [-103, 0.5, -52],
    [-100, 0.5, -50],
  ])("rounds %p * %p to %p (negative, away from zero)", (value, factor, expected) => {
    expect(multiplyCents(centsFromInt(value), factor)).toBe(expected);
  });

  // Banker's rounding (round-half-to-even) and half-away-from-zero only
  // disagree at ties whose pre-rounding integer part is even (0.5, 2.5,
  // 4.5, ...): banker's rounds those down/toward the even neighbor, while
  // half-away-from-zero always rounds them away from zero. Ties like 1.5 or
  // 3.5 round the same way under both schemes, so they don't prove
  // anything about which algorithm is in use — these cases specifically do.
  it.each([
    [5, 0.5, 3], // 2.5 -> 3 (banker's would give 2)
    [1, 0.5, 1], // 0.5 -> 1 (banker's would give 0)
    [9, 0.5, 5], // 4.5 -> 5 (banker's would give 4)
  ])("multiplyCents(%p, %p) rounds the even-tie %p away from zero, not to even", (value, factor, expected) => {
    expect(multiplyCents(centsFromInt(value), factor)).toBe(expected);
  });

  it.each([
    [-5, 0.5, -3], // -2.5 -> -3 (banker's would give -2)
    [-1, 0.5, -1], // -0.5 -> -1 (banker's would give -0/0)
    [-9, 0.5, -5], // -4.5 -> -5 (banker's would give -4)
  ])("multiplyCents(%p, %p) rounds the negative even-tie %p away from zero, not to even", (value, factor, expected) => {
    expect(multiplyCents(centsFromInt(value), factor)).toBe(expected);
  });

  it("multiplies without rounding drama for exact results", () => {
    expect(multiplyCents(centsFromInt(200), 3)).toBe(600);
  });

  it("multiplies by zero to zero", () => {
    expect(multiplyCents(centsFromInt(500), 0)).toBe(0);
  });
});

describe("compareCents / isZeroCents", () => {
  it.each([
    [centsFromInt(1), centsFromInt(2), -1],
    [centsFromInt(2), centsFromInt(1), 1],
    [centsFromInt(5), centsFromInt(5), 0],
    [centsFromInt(-5), centsFromInt(5), -1],
    [centsFromInt(0), centsFromInt(0), 0],
  ])("compareCents(%p, %p) === %p", (a, b, expected) => {
    expect(compareCents(a, b)).toBe(expected);
  });

  it.each([
    [ZERO_CENTS, true],
    [centsFromInt(0), true],
    [centsFromInt(1), false],
    [centsFromInt(-1), false],
  ])("isZeroCents(%p) === %p", (value, expected) => {
    expect(isZeroCents(value)).toBe(expected);
  });
});

describe("property-based invariants", () => {
  // Keep generators well within the safe-integer range so no arithmetic
  // under test spuriously overflows: results of addCents/sumCents of two
  // bounded values stay far below Number.MAX_SAFE_INTEGER.
  const boundedCents = fc
    .integer({ min: -1_000_000_000, max: 1_000_000_000 })
    .map((n) => centsFromInt(n));

  it("formatCents(parseCents(x)) round-trips for generated decimal strings", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 99 }),
        (isNegative, wholeMagnitude, fractionUnits) => {
          const isZero = wholeMagnitude === 0 && fractionUnits === 0;
          const sign = isNegative && !isZero ? "-" : "";
          const fractionStr = fractionUnits.toString().padStart(2, "0");
          const input = `${sign}${wholeMagnitude}.${fractionStr}`;
          const cents = parseCents(input);
          expect(formatCents(cents)).toBe(input);
        },
      ),
    );
  });

  it("sumCents([a, b]) === addCents(a, b) for bounded generated values", () => {
    fc.assert(
      fc.property(boundedCents, boundedCents, (a, b) => {
        expect(sumCents([a, b])).toBe(addCents(a, b));
      }),
    );
  });

  it("addCents is associative for bounded generated values", () => {
    fc.assert(
      fc.property(boundedCents, boundedCents, boundedCents, (a, b, c) => {
        expect(addCents(addCents(a, b), c)).toBe(addCents(a, addCents(b, c)));
      }),
    );
  });

  it("negateCents is its own inverse for bounded generated values", () => {
    fc.assert(
      fc.property(boundedCents, (a) => {
        expect(negateCents(negateCents(a))).toBe(a);
      }),
    );
  });
});
