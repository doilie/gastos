// Cents type and money math.
//
// Per repo convention (see CLAUDE.md): all money values use a branded `Cents`
// integer type. No raw `number` arithmetic on currency values, no
// `parseFloat`/`Number()` on a money string outside the parser in this file,
// and no cross-currency addition without an explicit `FxRate` (not yet
// implemented — that lives in the Reference layer). Every amount here is an
// integer count of centavos (2 minor units), currency-agnostic.

/** Branded integer type: a count of centavos. Never assign a raw `number`. */
export type Cents = number & { readonly __brand: "Cents" };

/** Zero, as a `Cents` value. */
export const ZERO_CENTS = 0 as Cents;

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MIN_SAFE = Number.MIN_SAFE_INTEGER;

/**
 * Safe constructor: converts a raw integer `number` into `Cents`, throwing if
 * it is not a safe integer (rejects floats, NaN, Infinity, and anything
 * outside `Number.MAX_SAFE_INTEGER`/`MIN_SAFE_INTEGER`).
 */
export function centsFromInt(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `centsFromInt: expected a safe integer, got ${String(value)}`,
    );
  }
  return value as Cents;
}

function assertSafeResult(value: number, context: string): Cents {
  if (value > MAX_SAFE || value < MIN_SAFE) {
    throw new Error(`${context}: result ${value} exceeds safe integer range`);
  }
  return value as Cents;
}

interface ParsedDecimal {
  readonly sign: 1 | -1;
  readonly wholeDigits: string;
  readonly fractionDigits: string;
}

/**
 * Splits a decimal money string into sign/whole/fraction digit groups
 * without ever routing through floating-point parsing. Throws a descriptive
 * `Error` on any malformed input.
 */
function splitDecimalString(input: string): ParsedDecimal {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(input);
  if (!match) {
    throw new Error(`parseCents: malformed decimal string ${JSON.stringify(input)}`);
  }
  const [, signPart, wholeDigits, fractionDigits = ""] = match;
  if (fractionDigits.length > 2) {
    throw new Error(
      `parseCents: too many decimal digits in ${JSON.stringify(input)} (max 2)`,
    );
  }
  const sign: 1 | -1 = signPart === "-" ? -1 : 1;
  return { sign, wholeDigits: wholeDigits ?? "", fractionDigits };
}

/**
 * Parses a decimal money string like `"1234.56"`, `"-12.5"`, `"0"`, `"+12"`
 * into integer centavos. Rejects malformed input (empty string, non-numeric,
 * multiple decimal points, more than 2 fractional digits, whitespace-only)
 * by throwing a descriptive `Error`. Never uses `parseFloat`/`Number()` on
 * the fractional part.
 */
export function parseCents(input: string): Cents {
  if (input.trim().length === 0) {
    throw new Error("parseCents: input is empty or whitespace-only");
  }
  const { sign, wholeDigits, fractionDigits } = splitDecimalString(input.trim());
  const paddedFraction = fractionDigits.padEnd(2, "0");
  const digits = `${wholeDigits}${paddedFraction}`;
  const magnitude = Number.parseInt(digits, 10);
  return centsFromInt(sign * magnitude);
}

/**
 * Inverse of `parseCents`: renders `Cents` as a decimal string with exactly
 * 2 fractional digits, e.g. `123456` -> `"1234.56"`, `-1250` -> `"-12.50"`.
 */
export function formatCents(value: Cents): string {
  const isNegative = value < 0;
  const magnitude = Math.abs(value);
  const whole = Math.trunc(magnitude / 100);
  const fraction = magnitude % 100;
  const fractionStr = fraction.toString().padStart(2, "0");
  return `${isNegative ? "-" : ""}${whole}.${fractionStr}`;
}

/** Adds two `Cents` values, throwing on unsafe-integer overflow. */
export function addCents(a: Cents, b: Cents): Cents {
  return assertSafeResult(a + b, "addCents");
}

/** Subtracts `b` from `a`, throwing on unsafe-integer overflow. */
export function subtractCents(a: Cents, b: Cents): Cents {
  return assertSafeResult(a - b, "subtractCents");
}

/** Negates a `Cents` value. */
export function negateCents(a: Cents): Cents {
  return assertSafeResult(-a, "negateCents");
}

/** Sums a list of `Cents` values; an empty array sums to `ZERO_CENTS`. */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return assertSafeResult(total, "sumCents");
}

/**
 * Multiplies `value` by an arbitrary numeric `factor` (e.g. a percentage
 * share for a split/allocation), rounding the result HALF AWAY FROM ZERO
 * (standard commercial rounding, not banker's rounding) to the nearest whole
 * centavo. Throws on unsafe-integer overflow.
 */
export function multiplyCents(value: Cents, factor: number): Cents {
  const raw = value * factor;
  const rounded = raw >= 0 ? Math.round(raw) : -Math.round(-raw);
  return assertSafeResult(rounded, "multiplyCents");
}

/** Compares two `Cents` values: -1 if `a < b`, 0 if equal, 1 if `a > b`. */
export function compareCents(a: Cents, b: Cents): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** True if `value` is exactly zero. */
export function isZeroCents(value: Cents): boolean {
  return value === 0;
}
