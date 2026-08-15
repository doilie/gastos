import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { currencyCodeFromString } from "./currency";

describe("currencyCodeFromString", () => {
  it.each(["PHP", "USD", "JPY", "EUR", "ABC", "ZZZ"])(
    "accepts valid 3-letter uppercase code %p",
    (input) => {
      expect(currencyCodeFromString(input)).toBe(input);
    },
  );

  it.each([
    ["lowercase", "php"],
    ["mixed case", "Php"],
    ["too short", "PH"],
    ["too long", "PHPX"],
    ["empty string", ""],
    ["digits", "US1"],
    ["all digits", "123"],
    ["leading whitespace", " PHP"],
    ["trailing whitespace", "PHP "],
    ["whitespace-only", "   "],
    ["accented letter", "PHÉ"],
    ["non-ASCII letters", "日本語"],
  ])("rejects %s (%p)", (_label, input) => {
    expect(() => currencyCodeFromString(input)).toThrow();
  });
});

describe("currencyCodeFromString property-based", () => {
  const upperLetter = fc.integer({ min: 65, max: 90 }).map((code) => String.fromCharCode(code));
  const threeUpperLetters = fc
    .tuple(upperLetter, upperLetter, upperLetter)
    .map(([a, b, c]) => `${a}${b}${c}`);

  it("round-trips for any generated 3-uppercase-letter string", () => {
    fc.assert(
      fc.property(threeUpperLetters, (input) => {
        expect(currencyCodeFromString(input)).toBe(input);
      }),
    );
  });
});
