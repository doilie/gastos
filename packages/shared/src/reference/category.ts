// Category reference type.
//
// Per `req/what-i-want.txt`: "initial category is special and used for salary
// and other incoming money" — `isIncome` models that. By convention there is
// exactly one income category, but this type does not enforce singleton-ness;
// that belongs to a future Reference-layer registry/store, not this type.

/** Branded string type: a category identifier. */
export type CategoryId = string & { readonly __brand: "CategoryId" };

/**
 * Safe constructor: converts a raw `string` into `CategoryId`, throwing if it
 * is empty or whitespace-only.
 */
export function categoryIdFromString(value: string): CategoryId {
  if (value.trim().length === 0) {
    throw new Error("categoryIdFromString: value is empty or whitespace-only");
  }
  return value as CategoryId;
}

/** A spending/income category. Income categories are flagged via `isIncome`. */
export interface Category {
  readonly id: CategoryId;
  readonly name: string;
  readonly isIncome: boolean;
}

function assertNonEmptyName(name: string, context: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error(`${context}: name is empty or whitespace-only`);
  }
  return trimmed;
}

/**
 * Factory/validator for `Category`: trims and validates `name` is non-empty,
 * defaulting `isIncome` to `false`.
 */
export function createCategory(input: {
  id: CategoryId;
  name: string;
  isIncome?: boolean;
}): Category {
  return {
    id: input.id,
    name: assertNonEmptyName(input.name, "createCategory"),
    isIncome: input.isIncome ?? false,
  };
}
