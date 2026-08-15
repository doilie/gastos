import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { accountIdFromString } from "../reference/account";
import { subEnvelopeIdFromString } from "../reference/envelope";
import {
  fundingSourceFromAccount,
  fundingSourceFromEnvelope,
  fundingSourcesEqual,
  isAccountFundingSource,
  isEnvelopeFundingSource,
  isUnfundedSource,
  UNFUNDED_SOURCE,
  type FundingSource,
} from "./funding-source";

const acc1 = accountIdFromString("acc-1");
const acc2 = accountIdFromString("acc-2");
const sub1 = subEnvelopeIdFromString("sub-1");
const sub2 = subEnvelopeIdFromString("sub-2");

describe("fundingSourceFromAccount", () => {
  it("builds the expected { kind: 'account', accountId } shape", () => {
    expect(fundingSourceFromAccount(acc1)).toEqual({ kind: "account", accountId: acc1 });
  });
});

describe("fundingSourceFromEnvelope", () => {
  it("builds the expected { kind: 'envelope', subEnvelopeId } shape", () => {
    expect(fundingSourceFromEnvelope(sub1)).toEqual({ kind: "envelope", subEnvelopeId: sub1 });
  });
});

describe("UNFUNDED_SOURCE", () => {
  it("is { kind: 'none' }", () => {
    expect(UNFUNDED_SOURCE).toEqual({ kind: "none" });
  });
});

describe("type-guard predicates", () => {
  const accountSource = fundingSourceFromAccount(acc1);
  const envelopeSource = fundingSourceFromEnvelope(sub1);
  const unfundedSource = UNFUNDED_SOURCE;

  it("account source: isAccountFundingSource true, others false", () => {
    expect(isAccountFundingSource(accountSource)).toBe(true);
    expect(isEnvelopeFundingSource(accountSource)).toBe(false);
    expect(isUnfundedSource(accountSource)).toBe(false);
  });

  it("envelope source: isEnvelopeFundingSource true, others false", () => {
    expect(isAccountFundingSource(envelopeSource)).toBe(false);
    expect(isEnvelopeFundingSource(envelopeSource)).toBe(true);
    expect(isUnfundedSource(envelopeSource)).toBe(false);
  });

  it("unfunded source: isUnfundedSource true, others false", () => {
    expect(isAccountFundingSource(unfundedSource)).toBe(false);
    expect(isEnvelopeFundingSource(unfundedSource)).toBe(false);
    expect(isUnfundedSource(unfundedSource)).toBe(true);
  });
});

describe("fundingSourcesEqual", () => {
  it("two account sources with the same accountId are equal", () => {
    expect(
      fundingSourcesEqual(fundingSourceFromAccount(acc1), fundingSourceFromAccount(acc1)),
    ).toBe(true);
  });

  it("two account sources with different accountIds are not equal", () => {
    expect(
      fundingSourcesEqual(fundingSourceFromAccount(acc1), fundingSourceFromAccount(acc2)),
    ).toBe(false);
  });

  it("two envelope sources with the same subEnvelopeId are equal", () => {
    expect(
      fundingSourcesEqual(fundingSourceFromEnvelope(sub1), fundingSourceFromEnvelope(sub1)),
    ).toBe(true);
  });

  it("two envelope sources with different subEnvelopeIds are not equal", () => {
    expect(
      fundingSourcesEqual(fundingSourceFromEnvelope(sub1), fundingSourceFromEnvelope(sub2)),
    ).toBe(false);
  });

  it("two none sources are equal", () => {
    expect(fundingSourcesEqual(UNFUNDED_SOURCE, { kind: "none" })).toBe(true);
    expect(fundingSourcesEqual(UNFUNDED_SOURCE, UNFUNDED_SOURCE)).toBe(true);
  });

  it("account vs envelope is never equal, symmetrically", () => {
    const a = fundingSourceFromAccount(acc1);
    const b = fundingSourceFromEnvelope(sub1);
    expect(fundingSourcesEqual(a, b)).toBe(false);
    expect(fundingSourcesEqual(b, a)).toBe(false);
    expect(fundingSourcesEqual(a, b)).toBe(fundingSourcesEqual(b, a));
  });

  it("account vs none is never equal, symmetrically", () => {
    const a = fundingSourceFromAccount(acc1);
    const b = UNFUNDED_SOURCE;
    expect(fundingSourcesEqual(a, b)).toBe(false);
    expect(fundingSourcesEqual(b, a)).toBe(false);
    expect(fundingSourcesEqual(a, b)).toBe(fundingSourcesEqual(b, a));
  });

  it("envelope vs none is never equal, symmetrically", () => {
    const a = fundingSourceFromEnvelope(sub1);
    const b = UNFUNDED_SOURCE;
    expect(fundingSourcesEqual(a, b)).toBe(false);
    expect(fundingSourcesEqual(b, a)).toBe(false);
    expect(fundingSourcesEqual(a, b)).toBe(fundingSourcesEqual(b, a));
  });
});

describe("fundingSourcesEqual property-based", () => {
  const accountIds = [acc1, acc2];
  const subEnvelopeIds = [sub1, sub2];

  const fundingSourceArb: fc.Arbitrary<FundingSource> = fc.oneof(
    fc.constantFrom(...accountIds).map((accountId) => fundingSourceFromAccount(accountId)),
    fc
      .constantFrom(...subEnvelopeIds)
      .map((subEnvelopeId) => fundingSourceFromEnvelope(subEnvelopeId)),
    fc.constant(UNFUNDED_SOURCE),
  );

  it("is reflexive: fundingSourcesEqual(x, x) === true for any generated FundingSource", () => {
    fc.assert(
      fc.property(fundingSourceArb, (x) => {
        expect(fundingSourcesEqual(x, x)).toBe(true);
      }),
    );
  });

  it("is symmetric: fundingSourcesEqual(a, b) === fundingSourcesEqual(b, a)", () => {
    fc.assert(
      fc.property(fundingSourceArb, fundingSourceArb, (a, b) => {
        expect(fundingSourcesEqual(a, b)).toBe(fundingSourcesEqual(b, a));
      }),
    );
  });
});
