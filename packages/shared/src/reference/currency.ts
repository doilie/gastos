// Currency code reference type.
//
// Per repo convention (see CLAUDE.md): the set of supported currencies is
// open-ended (HLD decision A7 — "8 currencies exist today, not 2"), so this
// module fixes only the ISO 4217 *shape* (3 uppercase ASCII letters) and does
// not hardcode an enum of specific codes.

/** Branded string type: a 3-letter ISO 4217-shaped currency code, e.g. "PHP". */
export type CurrencyCode = string & { readonly __brand: "CurrencyCode" };

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

/**
 * Safe constructor: converts a raw `string` into `CurrencyCode`, throwing if
 * it is not exactly 3 uppercase ASCII letters.
 */
export function currencyCodeFromString(value: string): CurrencyCode {
  if (!CURRENCY_CODE_PATTERN.test(value)) {
    throw new Error(
      `currencyCodeFromString: expected 3 uppercase ASCII letters, got ${JSON.stringify(value)}`,
    );
  }
  return value as CurrencyCode;
}
