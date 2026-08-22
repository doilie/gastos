import { describe, expect, it } from "vitest";

import { buildServer } from "../index";
import { getAccounts, getCategories, getEnvelopeGroups, getSubEnvelopes } from "../store";

interface TrpcQueryResponse<T> {
  result: { data: T };
}

interface TrpcErrorResponse {
  error: {
    message: string;
    data: {
      code: string;
      httpStatus: number;
      [key: string]: unknown;
    };
  };
}

async function queryReference<T>(
  app: ReturnType<typeof buildServer>,
  procedure: string,
): Promise<T> {
  const response = await app.inject({
    method: "GET",
    url: `/trpc/reference.${procedure}`,
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

/**
 * tRPC v11 mutations go over POST with the raw input as the JSON body (no
 * `{ input: ... }` wrapper) — same pattern established in `ledger.test.ts`'s
 * `mutateLedger`/`budget.test.ts`'s `mutateBudget` helpers, adapted here for
 * the `reference` router.
 */
async function mutateReference<T>(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: object,
): Promise<T> {
  const response = await app.inject({
    method: "POST",
    url: `/trpc/reference.${procedure}`,
    payload: input,
  });
  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body) as TrpcQueryResponse<T>;
  return body.result.data;
}

/**
 * Like `mutateReference`, but for error-path tests: doesn't assert a 200
 * status up front, just returns the raw HTTP status and the decoded tRPC
 * error envelope so the caller can assert on both — mirrors
 * `budget.test.ts`'s `mutateBudgetExpectingError`.
 */
async function mutateReferenceExpectingError(
  app: ReturnType<typeof buildServer>,
  procedure: string,
  input: object,
): Promise<{ statusCode: number; error: TrpcErrorResponse["error"] }> {
  const response = await app.inject({
    method: "POST",
    url: `/trpc/reference.${procedure}`,
    payload: input,
  });
  const body = JSON.parse(response.body) as TrpcErrorResponse;
  return { statusCode: response.statusCode, error: body.error };
}

interface CreatedAccount {
  id: string;
  name: string;
  currency: string;
  isArchived: boolean;
}

interface CreatedCategory {
  id: string;
  name: string;
  isIncome: boolean;
}

describe("reference router", () => {
  it("reference.accounts returns exactly what store.getAccounts() returns", async () => {
    const app = buildServer();
    const data = await queryReference(app, "accounts");
    expect(data).toEqual(getAccounts());
    await app.close();
  });

  it("reference.categories returns exactly what store.getCategories() returns", async () => {
    const app = buildServer();
    const data = await queryReference(app, "categories");
    expect(data).toEqual(getCategories());
    await app.close();
  });

  it("reference.envelopeGroups returns exactly what store.getEnvelopeGroups() returns", async () => {
    const app = buildServer();
    const data = await queryReference(app, "envelopeGroups");
    expect(data).toEqual(getEnvelopeGroups());
    await app.close();
  });

  it("reference.subEnvelopes returns exactly what store.getSubEnvelopes() returns", async () => {
    const app = buildServer();
    const data = await queryReference(app, "subEnvelopes");
    expect(data).toEqual(getSubEnvelopes());
    await app.close();
  });
});

// NOTE: reference.createAccount/createCategory genuinely mutate the shared
// in-memory store (singleton arrays, same as ledger.addTransaction/
// budget.applyBudgetLine — see store.ts's `accounts`/`categories`). Tests
// below therefore never assert an absolute total count; they check for the
// presence/absence of the specific record they created, so they're safe
// regardless of test order or how many other tests in this file/run already
// mutated the store.

describe("reference.createAccount — success", () => {
  it("creates and returns an Account with a generated id, correct name/currency, isArchived false", async () => {
    const app = buildServer();
    const data = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Emergency Fund",
      currency: "PHP",
    });

    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.name).toBe("Emergency Fund");
    expect(data.currency).toBe("PHP");
    expect(data.isArchived).toBe(false);
    await app.close();
  });

  it("persists the new account, visible in a fresh reference.accounts request", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Vacation Fund",
      currency: "PHP",
    });

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    const found = allAccounts.find((account) => account.id === created.id);
    expect(found).toEqual(created);
    await app.close();
  });
});

describe("reference.createAccount — validation errors", () => {
  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an invalid lowercase currency code, and does not persist it", async () => {
    const app = buildServer();
    // currencyCodeFromString throws a plain Error (not a TRPCError) for a
    // malformed code — this codebase's established convention lets it
    // propagate unwrapped, which tRPC surfaces as 500/INTERNAL_SERVER_ERROR,
    // not 400/BAD_REQUEST (unlike the Zod-shape-validation failures).
    const { statusCode, error } = await mutateReferenceExpectingError(app, "createAccount", {
      name: "Bad Currency Account",
      currency: "usd",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    expect(allAccounts.some((account) => account.name === "Bad Currency Account")).toBe(false);
    await app.close();
  });

  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for a 4-letter currency code, and does not persist it", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "createAccount", {
      name: "Bad Currency Account 2",
      currency: "USDX",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    expect(allAccounts.some((account) => account.name === "Bad Currency Account 2")).toBe(false);
    await app.close();
  });

  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an empty/whitespace-only name, and does not persist it", async () => {
    const app = buildServer();
    // The underlying createAccount factory throws a plain Error for a
    // blank name — same unwrapped-propagation convention as above.
    const { statusCode, error } = await mutateReferenceExpectingError(app, "createAccount", {
      name: "   ",
      currency: "PHP",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    expect(allAccounts.some((account) => account.name.trim() === "")).toBe(false);
    await app.close();
  });
});

describe("reference.createCategory — success", () => {
  it("defaults isIncome to false when omitted, and persists it", async () => {
    const app = buildServer();
    const data = await mutateReference<CreatedCategory>(app, "createCategory", {
      name: "Utilities",
    });

    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.name).toBe("Utilities");
    expect(data.isIncome).toBe(false);

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    const found = allCategories.find((category) => category.id === data.id);
    expect(found).toEqual(data);
    await app.close();
  });

  it("respects isIncome: true when explicitly provided", async () => {
    const app = buildServer();
    const data = await mutateReference<CreatedCategory>(app, "createCategory", {
      name: "Freelance Income",
      isIncome: true,
    });

    expect(data.isIncome).toBe(true);
    await app.close();
  });
});

describe("reference.createCategory — validation errors", () => {
  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an empty/whitespace-only name, and does not persist it", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "createCategory", {
      name: "   ",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    expect(allCategories.some((category) => category.name.trim() === "")).toBe(false);
    await app.close();
  });
});

// NOTE: reference.updateAccount/updateCategory tests below each create a
// FRESH account/category via createAccount/createCategory first, then update
// THAT record — never a seeded one (e.g. account-checking) — to avoid
// leaking mutated state into other tests sharing this singleton in-memory
// store, per this file's existing createAccount/createCategory precedent.

describe("reference.updateAccount — success", () => {
  it("updates name only, leaving currency/isArchived/id unchanged, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Original Name",
      currency: "PHP",
    });

    const updated = await mutateReference<CreatedAccount>(app, "updateAccount", {
      id: created.id,
      name: "Renamed Account",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Renamed Account");
    expect(updated.currency).toBe(created.currency);
    expect(updated.isArchived).toBe(created.isArchived);

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    const found = allAccounts.find((account) => account.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });

  it("updates currency only, leaving name/id unchanged, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Currency Test Account",
      currency: "PHP",
    });

    const updated = await mutateReference<CreatedAccount>(app, "updateAccount", {
      id: created.id,
      currency: "USD",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe(created.name);
    expect(updated.currency).toBe("USD");

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    const found = allAccounts.find((account) => account.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });

  it("updates both name and currency at once, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Both Fields Account",
      currency: "PHP",
    });

    const updated = await mutateReference<CreatedAccount>(app, "updateAccount", {
      id: created.id,
      name: "Renamed Both",
      currency: "USD",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Renamed Both");
    expect(updated.currency).toBe("USD");

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    const found = allAccounts.find((account) => account.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });
});

describe("reference.updateAccount — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "updateAccount", {
      id: "account-does-not-exist",
      name: "Doesn't Matter",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an invalid lowercase currency code, and does not change the account", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedAccount>(app, "createAccount", {
      name: "Invalid Currency Update Account",
      currency: "PHP",
    });

    const { statusCode, error } = await mutateReferenceExpectingError(app, "updateAccount", {
      id: created.id,
      currency: "usd",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allAccounts = await queryReference<CreatedAccount[]>(app, "accounts");
    const found = allAccounts.find((account) => account.id === created.id);
    expect(found?.currency).toBe("PHP");
    await app.close();
  });
});

describe("reference.updateCategory — success", () => {
  it("updates name only, leaving isIncome/id unchanged, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedCategory>(app, "createCategory", {
      name: "Original Category Name",
    });

    const updated = await mutateReference<CreatedCategory>(app, "updateCategory", {
      id: created.id,
      name: "Renamed Category",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Renamed Category");
    expect(updated.isIncome).toBe(created.isIncome);

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    const found = allCategories.find((category) => category.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });

  it("updates isIncome only, leaving name/id unchanged, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedCategory>(app, "createCategory", {
      name: "IsIncome Test Category",
    });

    const updated = await mutateReference<CreatedCategory>(app, "updateCategory", {
      id: created.id,
      isIncome: true,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe(created.name);
    expect(updated.isIncome).toBe(true);

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    const found = allCategories.find((category) => category.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });

  it("updates both name and isIncome at once, and persists it", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedCategory>(app, "createCategory", {
      name: "Both Fields Category",
    });

    const updated = await mutateReference<CreatedCategory>(app, "updateCategory", {
      id: created.id,
      name: "Renamed Both Category",
      isIncome: true,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Renamed Both Category");
    expect(updated.isIncome).toBe(true);

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    const found = allCategories.find((category) => category.id === created.id);
    expect(found).toEqual(updated);
    await app.close();
  });
});

describe("reference.updateCategory — validation errors", () => {
  it("returns NOT_FOUND (404) for a well-formed but nonexistent id", async () => {
    const app = buildServer();
    const { statusCode, error } = await mutateReferenceExpectingError(app, "updateCategory", {
      id: "category-does-not-exist",
      name: "Doesn't Matter",
    });
    expect(statusCode).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
    await app.close();
  });

  it("returns a non-2xx (INTERNAL_SERVER_ERROR/500) for an empty/whitespace-only name, and does not change the category", async () => {
    const app = buildServer();
    const created = await mutateReference<CreatedCategory>(app, "createCategory", {
      name: "Empty Name Update Category",
    });

    const { statusCode, error } = await mutateReferenceExpectingError(app, "updateCategory", {
      id: created.id,
      name: "   ",
    });
    expect(statusCode).toBe(500);
    expect(error.data.code).toBe("INTERNAL_SERVER_ERROR");

    const allCategories = await queryReference<CreatedCategory[]>(app, "categories");
    const found = allCategories.find((category) => category.id === created.id);
    expect(found?.name).toBe("Empty Name Update Category");
    await app.close();
  });
});
