import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { categoryIdFromString, createCategory, updateCategory } from "./category";

describe("categoryIdFromString", () => {
  it("accepts a normal non-empty string", () => {
    expect(categoryIdFromString("cat-1")).toBe("cat-1");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only (spaces)", "   "],
    ["whitespace-only (tab)", "\t"],
  ])("rejects %s (%p)", (_label, input) => {
    expect(() => categoryIdFromString(input)).toThrow();
  });
});

describe("categoryIdFromString property-based", () => {
  it("round-trips for any generated non-empty, non-whitespace-only string", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (input) => {
          expect(categoryIdFromString(input)).toBe(input);
        },
      ),
    );
  });
});

describe("createCategory", () => {
  const id = categoryIdFromString("cat-1");

  it("builds a valid Category, defaulting isIncome to false when omitted", () => {
    const category = createCategory({ id, name: "Groceries" });
    expect(category).toEqual({
      id,
      name: "Groceries",
      isIncome: false,
    });
  });

  it("respects an explicit isIncome: true", () => {
    const category = createCategory({ id, name: "Salary", isIncome: true });
    expect(category.isIncome).toBe(true);
  });

  it("respects an explicit isIncome: false", () => {
    const category = createCategory({ id, name: "Groceries", isIncome: false });
    expect(category.isIncome).toBe(false);
  });

  it("trims leading/trailing whitespace from name", () => {
    const category = createCategory({ id, name: "  Groceries  " });
    expect(category.name).toBe("Groceries");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
  ])("throws on %s name (%p)", (_label, name) => {
    expect(() => createCategory({ id, name })).toThrow();
  });
});

describe("updateCategory", () => {
  const id = categoryIdFromString("cat-1");
  const category = createCategory({ id, name: "Groceries", isIncome: false });

  it("updates only name, leaving isIncome/id unchanged", () => {
    const updated = updateCategory(category, { name: "Dining" });
    expect(updated.name).toBe("Dining");
    expect(updated.isIncome).toBe(category.isIncome);
    expect(updated.id).toBe(id);
  });

  it("updates only isIncome, leaving name/id unchanged", () => {
    const updated = updateCategory(category, { isIncome: true });
    expect(updated.isIncome).toBe(true);
    expect(updated.name).toBe(category.name);
    expect(updated.id).toBe(id);
  });

  it("updates both name and isIncome at once", () => {
    const updated = updateCategory(category, { name: "Salary", isIncome: true });
    expect(updated).toEqual({
      id,
      name: "Salary",
      isIncome: true,
    });
  });

  it("is a no-op when updates is an empty object", () => {
    const updated = updateCategory(category, {});
    expect(updated).toEqual(category);
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only", "   "],
  ])("throws on %s name (%p)", (_label, name) => {
    expect(() => updateCategory(category, { name })).toThrow();
  });

  it("never changes id, regardless of updates", () => {
    const updated = updateCategory(category, { name: "Whatever", isIncome: true });
    expect(updated.id).toBe(category.id);
  });
});
