import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { accountIdFromString, createAccount, updateAccount } from "./account";
import { currencyCodeFromString } from "./currency";

describe("accountIdFromString", () => {
  it("accepts a normal non-empty string", () => {
    expect(accountIdFromString("acc-1")).toBe("acc-1");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only (spaces)", "   "],
    ["whitespace-only (tab)", "\t"],
  ])("rejects %s (%p)", (_label, input) => {
    expect(() => accountIdFromString(input)).toThrow();
  });
});

describe("accountIdFromString property-based", () => {
  it("round-trips for any generated non-empty, non-whitespace-only string", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (input) => {
          expect(accountIdFromString(input)).toBe(input);
        },
      ),
    );
  });
});

describe("createAccount", () => {
  const id = accountIdFromString("acc-1");
  const currency = currencyCodeFromString("PHP");

  it("builds a valid Account from valid input, defaulting isArchived to false", () => {
    const account = createAccount({ id, name: "Checking", currency });
    expect(account).toEqual({
      id,
      name: "Checking",
      currency,
      isArchived: false,
    });
  });

  it("trims leading/trailing whitespace from name", () => {
    const account = createAccount({ id, name: "  Checking  ", currency });
    expect(account.name).toBe("Checking");
  });

  it("preserves the passed id and currency unchanged", () => {
    const account = createAccount({ id, name: "Checking", currency });
    expect(account.id).toBe(id);
    expect(account.currency).toBe(currency);
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
  ])("throws on %s name (%p)", (_label, name) => {
    expect(() => createAccount({ id, name, currency })).toThrow();
  });
});

describe("updateAccount", () => {
  const id = accountIdFromString("acc-1");
  const currency = currencyCodeFromString("PHP");
  const otherCurrency = currencyCodeFromString("USD");
  const account = createAccount({ id, name: "Checking", currency });

  it("updates only name, leaving currency/id/isArchived unchanged", () => {
    const updated = updateAccount(account, { name: "Savings" });
    expect(updated.name).toBe("Savings");
    expect(updated.currency).toBe(currency);
    expect(updated.id).toBe(id);
    expect(updated.isArchived).toBe(account.isArchived);
  });

  it("updates only currency, leaving name/id unchanged", () => {
    const updated = updateAccount(account, { currency: otherCurrency });
    expect(updated.currency).toBe(otherCurrency);
    expect(updated.name).toBe(account.name);
    expect(updated.id).toBe(id);
  });

  it("updates both name and currency at once", () => {
    const updated = updateAccount(account, { name: "Savings", currency: otherCurrency });
    expect(updated).toEqual({
      id,
      name: "Savings",
      currency: otherCurrency,
      isArchived: account.isArchived,
    });
  });

  it("is a no-op when updates is an empty object", () => {
    const updated = updateAccount(account, {});
    expect(updated).toEqual(account);
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
  ])("throws on %s name (%p)", (_label, name) => {
    expect(() => updateAccount(account, { name })).toThrow();
  });

  it("never changes id, regardless of updates", () => {
    const updated = updateAccount(account, { name: "Whatever", currency: otherCurrency });
    expect(updated.id).toBe(account.id);
  });
});
