import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { accountIdFromString } from "./account";
import {
  createEnvelopeGroup,
  createSpendableEnvelope,
  createSubEnvelope,
  envelopeGroupIdFromString,
  isSpendableEnvelope,
  SPENDABLE_ENVELOPE_ID,
  SPENDABLE_ENVELOPE_NAME,
  subEnvelopeIdFromString,
} from "./envelope";

describe("envelopeGroupIdFromString", () => {
  it("accepts a normal non-empty string", () => {
    expect(envelopeGroupIdFromString("grp-1")).toBe("grp-1");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only (spaces)", "   "],
    ["whitespace-only (tab)", "\t"],
  ])("rejects %s (%p)", (_label, input) => {
    expect(() => envelopeGroupIdFromString(input)).toThrow();
  });
});

describe("envelopeGroupIdFromString property-based", () => {
  it("round-trips for any generated non-empty, non-whitespace-only string", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (input) => {
          expect(envelopeGroupIdFromString(input)).toBe(input);
        },
      ),
    );
  });
});

describe("createEnvelopeGroup", () => {
  const id = envelopeGroupIdFromString("grp-1");

  it("builds a valid EnvelopeGroup from valid input", () => {
    const group = createEnvelopeGroup({ id, name: "Bills" });
    expect(group).toEqual({ id, name: "Bills" });
  });

  it("trims leading/trailing whitespace from name", () => {
    const group = createEnvelopeGroup({ id, name: "  Bills  " });
    expect(group.name).toBe("Bills");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
  ])("throws on %s name (%p)", (_label, name) => {
    expect(() => createEnvelopeGroup({ id, name })).toThrow();
  });
});

describe("subEnvelopeIdFromString", () => {
  it("accepts a normal non-empty string", () => {
    expect(subEnvelopeIdFromString("sub-1")).toBe("sub-1");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only (spaces)", "   "],
    ["whitespace-only (tab)", "\t"],
  ])("rejects %s (%p)", (_label, input) => {
    expect(() => subEnvelopeIdFromString(input)).toThrow();
  });
});

describe("subEnvelopeIdFromString property-based", () => {
  it("round-trips for any generated non-empty, non-whitespace-only string", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (input) => {
          expect(subEnvelopeIdFromString(input)).toBe(input);
        },
      ),
    );
  });
});

describe("createSubEnvelope", () => {
  const id = subEnvelopeIdFromString("sub-1");
  const groupId = envelopeGroupIdFromString("grp-1");
  const acc1 = accountIdFromString("acc-1");
  const acc2 = accountIdFromString("acc-2");
  const acc3 = accountIdFromString("acc-3");

  it("builds a valid SubEnvelope, preserving groupId and accountIds", () => {
    const subEnvelope = createSubEnvelope({ id, name: "Groceries", groupId, accountIds: [acc1] });
    expect(subEnvelope).toEqual({
      id,
      name: "Groceries",
      groupId,
      accountIds: [acc1],
    });
  });

  it("trims leading/trailing whitespace from name", () => {
    const subEnvelope = createSubEnvelope({
      id,
      name: "  Groceries  ",
      groupId,
      accountIds: [acc1],
    });
    expect(subEnvelope.name).toBe("Groceries");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
  ])("throws on %s name (%p)", (_label, name) => {
    expect(() => createSubEnvelope({ id, name, groupId, accountIds: [acc1] })).toThrow();
  });

  it("throws when accountIds is empty", () => {
    expect(() => createSubEnvelope({ id, name: "Groceries", groupId, accountIds: [] })).toThrow();
  });

  it("throws when accountIds contains a duplicate account id", () => {
    expect(() =>
      createSubEnvelope({ id, name: "Groceries", groupId, accountIds: [acc1, acc1] }),
    ).toThrow();
  });

  it("accepts multiple distinct accountIds (allocated over several bank accounts)", () => {
    const subEnvelope = createSubEnvelope({
      id,
      name: "Groceries",
      groupId,
      accountIds: [acc1, acc2, acc3],
    });
    expect(subEnvelope.accountIds).toEqual([acc1, acc2, acc3]);
  });

  it("throws when id equals the reserved SPENDABLE_ENVELOPE_ID", () => {
    expect(() =>
      createSubEnvelope({
        id: SPENDABLE_ENVELOPE_ID,
        name: "Groceries",
        groupId,
        accountIds: [acc1],
      }),
    ).toThrow();
  });
});

describe("createSpendableEnvelope", () => {
  const acc1 = accountIdFromString("acc-1");
  const acc2 = accountIdFromString("acc-2");

  it("returns the reserved SubEnvelope shape with the passed accountIds", () => {
    const subEnvelope = createSpendableEnvelope([acc1, acc2]);
    expect(subEnvelope).toEqual({
      id: SPENDABLE_ENVELOPE_ID,
      name: SPENDABLE_ENVELOPE_NAME,
      groupId: null,
      accountIds: [acc1, acc2],
    });
  });

  it("throws when accountIds is empty", () => {
    expect(() => createSpendableEnvelope([])).toThrow();
  });

  it("throws when accountIds contains a duplicate account id", () => {
    expect(() => createSpendableEnvelope([acc1, acc1])).toThrow();
  });
});

describe("isSpendableEnvelope", () => {
  const acc1 = accountIdFromString("acc-1");

  it("returns true for the result of createSpendableEnvelope", () => {
    expect(isSpendableEnvelope(createSpendableEnvelope([acc1]))).toBe(true);
  });

  it("returns false for a normal, non-spendable sub-envelope", () => {
    const subEnvelope = createSubEnvelope({
      id: subEnvelopeIdFromString("sub-1"),
      name: "Groceries",
      groupId: envelopeGroupIdFromString("grp-1"),
      accountIds: [acc1],
    });
    expect(isSpendableEnvelope(subEnvelope)).toBe(false);
  });
});
