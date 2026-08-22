import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { accountIdFromString } from "./account";
import {
  archiveSubEnvelope,
  createEnvelopeGroup,
  createSpendableEnvelope,
  createSubEnvelope,
  envelopeGroupIdFromString,
  isSpendableEnvelope,
  SPENDABLE_ENVELOPE_ID,
  SPENDABLE_ENVELOPE_NAME,
  subEnvelopeIdFromString,
  unarchiveSubEnvelope,
  updateEnvelopeGroup,
  updateSubEnvelope,
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

describe("updateEnvelopeGroup", () => {
  const id = envelopeGroupIdFromString("grp-1");
  const original = createEnvelopeGroup({ id, name: "Bills" });

  it("updates name only, leaving id unchanged", () => {
    const updated = updateEnvelopeGroup(original, { name: "Renamed Bills" });
    expect(updated.id).toBe(original.id);
    expect(updated.name).toBe("Renamed Bills");
  });

  it("is a no-op for an empty updates object, returning an entity equal to the original", () => {
    const updated = updateEnvelopeGroup(original, {});
    expect(updated).toEqual(original);
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
  ])("throws on %s name (%p)", (_label, name) => {
    expect(() => updateEnvelopeGroup(original, { name })).toThrow();
  });

  it("never changes id, regardless of updates", () => {
    const updated = updateEnvelopeGroup(original, { name: "Something Else" });
    expect(updated.id).toBe(id);
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
      isArchived: false,
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

describe("updateSubEnvelope", () => {
  const id = subEnvelopeIdFromString("sub-1");
  const groupId = envelopeGroupIdFromString("grp-1");
  const acc1 = accountIdFromString("acc-1");
  const acc2 = accountIdFromString("acc-2");
  const original = createSubEnvelope({ id, name: "Groceries", groupId, accountIds: [acc1] });

  it("updates name only, leaving id/groupId/accountIds unchanged", () => {
    const updated = updateSubEnvelope(original, { name: "Renamed Groceries" });
    expect(updated.id).toBe(original.id);
    expect(updated.groupId).toBe(original.groupId);
    expect(updated.accountIds).toEqual(original.accountIds);
    expect(updated.name).toBe("Renamed Groceries");
  });

  it("updates accountIds only, leaving name/id/groupId unchanged", () => {
    const updated = updateSubEnvelope(original, { accountIds: [acc2] });
    expect(updated.id).toBe(original.id);
    expect(updated.groupId).toBe(original.groupId);
    expect(updated.name).toBe(original.name);
    expect(updated.accountIds).toEqual([acc2]);
  });

  it("updates both name and accountIds at once", () => {
    const updated = updateSubEnvelope(original, { name: "Renamed Both", accountIds: [acc1, acc2] });
    expect(updated.id).toBe(original.id);
    expect(updated.groupId).toBe(original.groupId);
    expect(updated.name).toBe("Renamed Both");
    expect(updated.accountIds).toEqual([acc1, acc2]);
  });

  it("is a no-op for an empty updates object, returning an entity equal to the original", () => {
    const updated = updateSubEnvelope(original, {});
    expect(updated).toEqual(original);
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
  ])("throws on %s name (%p)", (_label, name) => {
    expect(() => updateSubEnvelope(original, { name })).toThrow();
  });

  it("throws when accountIds is empty", () => {
    expect(() => updateSubEnvelope(original, { accountIds: [] })).toThrow();
  });

  it("throws when accountIds contains a duplicate account id", () => {
    expect(() => updateSubEnvelope(original, { accountIds: [acc1, acc1] })).toThrow();
  });

  it("never changes id or groupId, regardless of updates", () => {
    const updated = updateSubEnvelope(original, {
      name: "Something Else",
      accountIds: [acc2],
    });
    expect(updated.id).toBe(id);
    expect(updated.groupId).toBe(groupId);
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
      isArchived: false,
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

describe("archiveSubEnvelope", () => {
  const id = subEnvelopeIdFromString("sub-1");
  const groupId = envelopeGroupIdFromString("grp-1");
  const acc1 = accountIdFromString("acc-1");
  const subEnvelope = createSubEnvelope({ id, name: "Groceries", groupId, accountIds: [acc1] });

  it("sets isArchived to true, leaving id/name/groupId/accountIds unchanged", () => {
    const archived = archiveSubEnvelope(subEnvelope);
    expect(archived).toEqual({
      id,
      name: "Groceries",
      groupId,
      accountIds: [acc1],
      isArchived: true,
    });
  });

  it("is idempotent — archiving an already-archived sub-envelope stays isArchived: true", () => {
    const archived = archiveSubEnvelope(subEnvelope);
    const archivedAgain = archiveSubEnvelope(archived);
    expect(archivedAgain).toEqual(archived);
  });

  it("throws when called on the reserved Spendable envelope", () => {
    const spendable = createSpendableEnvelope([acc1]);
    expect(() => archiveSubEnvelope(spendable)).toThrow(
      'archiveSubEnvelope: id "spendable" is reserved for the Spendable envelope',
    );
  });
});

describe("unarchiveSubEnvelope", () => {
  const id = subEnvelopeIdFromString("sub-1");
  const groupId = envelopeGroupIdFromString("grp-1");
  const acc1 = accountIdFromString("acc-1");
  const subEnvelope = createSubEnvelope({ id, name: "Groceries", groupId, accountIds: [acc1] });
  const archivedSubEnvelope = archiveSubEnvelope(subEnvelope);

  it("sets isArchived to false, leaving id/name/groupId/accountIds unchanged", () => {
    const unarchived = unarchiveSubEnvelope(archivedSubEnvelope);
    expect(unarchived).toEqual({
      id,
      name: "Groceries",
      groupId,
      accountIds: [acc1],
      isArchived: false,
    });
  });

  it("is idempotent — unarchiving an already-unarchived sub-envelope stays isArchived: false", () => {
    const unarchived = unarchiveSubEnvelope(subEnvelope);
    const unarchivedAgain = unarchiveSubEnvelope(unarchived);
    expect(unarchivedAgain).toEqual(unarchived);
  });

  it("does not throw when called on the reserved Spendable envelope, and no-ops to isArchived: false", () => {
    const spendable = createSpendableEnvelope([acc1]);
    let unarchived: ReturnType<typeof unarchiveSubEnvelope> | undefined;
    expect(() => {
      unarchived = unarchiveSubEnvelope(spendable);
    }).not.toThrow();
    expect(unarchived).toEqual({ ...spendable, isArchived: false });
  });
});
