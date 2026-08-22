import {
  type Account,
  type AccountId,
  accountIdFromString,
  archiveAccount,
  type Category,
  type CategoryId,
  categoryIdFromString,
  createAccount,
  createCategory,
  currencyCodeFromString,
  unarchiveAccount,
  updateAccount,
  updateCategory,
} from "@gastos/shared";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { publicProcedure, router } from "../trpc";
import {
  addAccount,
  addCategory,
  deleteCategory,
  getAccounts,
  getCardPurchases,
  getCategories,
  getEnvelopeGroups,
  getSubEnvelopes,
  getTransactions,
  replaceAccount,
  replaceCategory,
} from "../store";

/**
 * Throws a `NOT_FOUND` TRPCError unless some item in `items` has the given
 * `id`. Small per-file copy of the same "look it up, 404 if missing" helper
 * `ledger.ts`/`budget.ts` define — this codebase's established convention is
 * per-file duplication of this kind of helper rather than sharing it across
 * routers.
 */
function assertIdExists(
  items: readonly { readonly id: unknown }[],
  id: unknown,
  notFoundMessage: string,
): void {
  const exists = items.some((item) => item.id === id);
  if (!exists) {
    throw new TRPCError({ code: "NOT_FOUND", message: notFoundMessage });
  }
}

/**
 * Read-only Reference-layer queries (Account/Category/EnvelopeGroup/
 * SubEnvelope), plus `createAccount`/`createCategory`/`updateAccount`/
 * `updateCategory`/`archiveAccount`/`unarchiveAccount`/`deleteCategory`
 * mutations — this completes the server side of the "More tab CRUD" thread.
 * An account's "delete" is implemented as a reversible archive
 * (`isArchived: true`/`false`) rather than a hard delete, since historical
 * `Transaction.accountId` values must keep resolving. A category's "delete"
 * is a real removal from the store, but only when no `Transaction` or
 * `CardPurchase` still references it — otherwise it's rejected with
 * `BAD_REQUEST`. Thin wrappers over the in-memory store — no business logic
 * here, that all lives in `@gastos/shared`.
 */
export const referenceRouter = router({
  accounts: publicProcedure.query(() => getAccounts()),
  categories: publicProcedure.query(() => getCategories()),
  envelopeGroups: publicProcedure.query(() => getEnvelopeGroups()),
  subEnvelopes: publicProcedure.query(() => getSubEnvelopes()),
  createAccount: publicProcedure
    .input(z.object({ name: z.string(), currency: z.string() }))
    .mutation(({ input }) => {
      const account: Account = createAccount({
        id: accountIdFromString(randomUUID()),
        name: input.name,
        currency: currencyCodeFromString(input.currency),
      });
      addAccount(account);
      return account;
    }),
  createCategory: publicProcedure
    .input(z.object({ name: z.string(), isIncome: z.boolean().optional() }))
    .mutation(({ input }) => {
      const category: Category = createCategory({
        id: categoryIdFromString(randomUUID()),
        name: input.name,
        ...(input.isIncome === undefined ? {} : { isIncome: input.isIncome }),
      });
      addCategory(category);
      return category;
    }),
  updateAccount: publicProcedure
    .input(
      z.object({ id: z.string(), name: z.string().optional(), currency: z.string().optional() }),
    )
    .mutation(({ input }) => {
      const id: AccountId = accountIdFromString(input.id);
      assertIdExists(getAccounts(), id, `Account "${id}" not found`);

      const existing = getAccounts().find((account) => account.id === id);
      if (existing === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Account "${id}" not found` });
      }

      const updated = updateAccount(existing, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.currency === undefined
          ? {}
          : { currency: currencyCodeFromString(input.currency) }),
      });
      replaceAccount(updated);
      return updated;
    }),
  updateCategory: publicProcedure
    .input(
      z.object({ id: z.string(), name: z.string().optional(), isIncome: z.boolean().optional() }),
    )
    .mutation(({ input }) => {
      const id: CategoryId = categoryIdFromString(input.id);
      assertIdExists(getCategories(), id, `Category "${id}" not found`);

      const existing = getCategories().find((category) => category.id === id);
      if (existing === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Category "${id}" not found` });
      }

      const updated = updateCategory(existing, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.isIncome === undefined ? {} : { isIncome: input.isIncome }),
      });
      replaceCategory(updated);
      return updated;
    }),
  archiveAccount: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    const id: AccountId = accountIdFromString(input.id);
    const existing = getAccounts().find((account) => account.id === id);
    if (existing === undefined) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Account "${id}" not found` });
    }

    const updated = archiveAccount(existing);
    replaceAccount(updated);
    return updated;
  }),
  unarchiveAccount: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    const id: AccountId = accountIdFromString(input.id);
    const existing = getAccounts().find((account) => account.id === id);
    if (existing === undefined) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Account "${id}" not found` });
    }

    const updated = unarchiveAccount(existing);
    replaceAccount(updated);
    return updated;
  }),
  deleteCategory: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    const id: CategoryId = categoryIdFromString(input.id);
    const existing = getCategories().find((category) => category.id === id);
    if (existing === undefined) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Category "${id}" not found` });
    }

    const isReferenced =
      getTransactions().some((transaction) => transaction.categoryId === id) ||
      getCardPurchases().some((purchase) => purchase.categoryId === id);
    if (isReferenced) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Category "${id}" is still in use and cannot be deleted`,
      });
    }

    deleteCategory(id);
    return { id };
  }),
});
