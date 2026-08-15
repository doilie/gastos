import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createCreditCard, creditCardIdFromString } from "./credit-card";
import { currencyCodeFromString } from "./currency";

describe("creditCardIdFromString", () => {
  it("accepts a normal non-empty string", () => {
    expect(creditCardIdFromString("card-1")).toBe("card-1");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only (spaces)", "   "],
    ["whitespace-only (tab)", "\t"],
  ])("rejects %s (%p)", (_label, input) => {
    expect(() => creditCardIdFromString(input)).toThrow();
  });
});

describe("creditCardIdFromString property-based", () => {
  it("round-trips for any generated non-empty, non-whitespace-only string", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (input) => {
          expect(creditCardIdFromString(input)).toBe(input);
        },
      ),
    );
  });
});

describe("createCreditCard", () => {
  const id = creditCardIdFromString("card-1");
  const currency = currencyCodeFromString("PHP");

  it("builds a valid CreditCard from valid input, defaulting isArchived to false", () => {
    const creditCard = createCreditCard({ id, name: "Visa", currency, cutoffDay: 17 });
    expect(creditCard).toEqual({
      id,
      name: "Visa",
      currency,
      cutoffDay: 17,
      isArchived: false,
    });
  });

  it("trims leading/trailing whitespace from name", () => {
    const creditCard = createCreditCard({ id, name: "  Visa  ", currency, cutoffDay: 17 });
    expect(creditCard.name).toBe("Visa");
  });

  it("preserves the passed id, currency, and cutoffDay unchanged", () => {
    const creditCard = createCreditCard({ id, name: "Visa", currency, cutoffDay: 17 });
    expect(creditCard.id).toBe(id);
    expect(creditCard.currency).toBe(currency);
    expect(creditCard.cutoffDay).toBe(17);
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
  ])("throws on %s name (%p)", (_label, name) => {
    expect(() => createCreditCard({ id, name, currency, cutoffDay: 17 })).toThrow();
  });

  it.each([
    ["the lower boundary (1)", 1],
    ["the upper boundary (31)", 31],
  ])("accepts a boundary-valid cutoffDay: %s", (_label, cutoffDay) => {
    const creditCard = createCreditCard({ id, name: "Visa", currency, cutoffDay });
    expect(creditCard.cutoffDay).toBe(cutoffDay);
  });

  it.each([
    ["zero", 0],
    ["above the upper boundary (32)", 32],
    ["a non-integer (15.5)", 15.5],
    ["negative (-1)", -1],
  ])("throws on an invalid cutoffDay: %s (%p)", (_label, cutoffDay) => {
    expect(() => createCreditCard({ id, name: "Visa", currency, cutoffDay })).toThrow();
  });
});
