import {
  type Account,
  type AccountId,
  accountIdFromString,
  archiveAccount,
  archiveSubEnvelope,
  type Category,
  type CategoryId,
  categoryIdFromString,
  createAccount,
  createCategory,
  createEnvelopeGroup,
  createSubEnvelope,
  currencyCodeFromString,
  type EnvelopeGroup,
  type EnvelopeGroupId,
  envelopeGroupIdFromString,
  type SubEnvelope,
  type SubEnvelopeId,
  subEnvelopeIdFromString,
  unarchiveAccount,
  unarchiveSubEnvelope,
  updateAccount,
  updateCategory,
  updateEnvelopeGroup,
  updateSubEnvelope,
} from "@gastos/shared";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { publicProcedure, router } from "../trpc";
import {
  addAccount,
  addCategory,
  addEnvelopeGroup,
  addSubEnvelope,
  deleteCategory,
  deleteEnvelopeGroup,
  getAccounts,
  getCardPurchases,
  getCategories,
  getEnvelopeGroups,
  getSubEnvelopes,
  getTransactions,
  replaceAccount,
  replaceCategory,
  replaceEnvelopeGroup,
  replaceSubEnvelope,
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
 * mutations (the "More tab CRUD" thread), plus `createEnvelopeGroup`/
 * `createSubEnvelope`/`updateEnvelopeGroup`/`updateSubEnvelope`/
 * `archiveSubEnvelope`/`unarchiveSubEnvelope`/`deleteEnvelopeGroup`
 * mutations — the full "Envelope CRUD" thread. `updateSubEnvelope` never
 * reassigns `groupId` — moving a sub-envelope to a different group is a
 * separate, not-yet-scoped increment. An account's "delete" is implemented as a
 * reversible archive (`isArchived: true`/`false`) rather than a hard delete,
 * since historical `Transaction.accountId` values must keep resolving; a
 * sub-envelope's "delete" mirrors this exactly (`Transaction.subEnvelopeId`
 * is likewise required/non-null), except the reserved Spendable envelope can
 * never be archived. A category's "delete" is a real removal from the
 * store, but only when no `Transaction` or `CardPurchase` still references
 * it — otherwise it's rejected with `BAD_REQUEST`; an envelope group's
 * "delete" mirrors this exactly, rejected when any `SubEnvelope` still has a
 * matching `groupId` (nothing in the ledger references `EnvelopeGroupId`
 * directly). Thin wrappers over the in-memory store — no business logic
 * here, that all lives in `@gastos/shared`.
 */
export const referenceRouter = router({
  accounts: publicProcedure.query(() => getAccounts()),
  categories: publicProcedure.query(() => getCategories()),
  envelopeGroups: publicProcedure.query(() => getEnvelopeGroups()),
  subEnvelopes: publicProcedure.query(() => getSubEnvelopes()),
  createAccount: publicProcedure
    .input(z.object({ name: z.string(), currency: z.string() }))
    .mutation(async ({ input }) => {
      const account: Account = createAccount({
        id: accountIdFromString(randomUUID()),
        name: input.name,
        currency: currencyCodeFromString(input.currency),
      });
      await addAccount(account);
      return account;
    }),
  createCategory: publicProcedure
    .input(z.object({ name: z.string(), isIncome: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const category: Category = createCategory({
        id: categoryIdFromString(randomUUID()),
        name: input.name,
        ...(input.isIncome === undefined ? {} : { isIncome: input.isIncome }),
      });
      await addCategory(category);
      return category;
    }),
  updateAccount: publicProcedure
    .input(
      z.object({ id: z.string(), name: z.string().optional(), currency: z.string().optional() }),
    )
    .mutation(async ({ input }) => {
      const id: AccountId = accountIdFromString(input.id);
      const existing = (await getAccounts()).find((account) => account.id === id);
      if (existing === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Account "${id}" not found` });
      }

      const updated = updateAccount(existing, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.currency === undefined
          ? {}
          : { currency: currencyCodeFromString(input.currency) }),
      });
      await replaceAccount(updated);
      return updated;
    }),
  updateCategory: publicProcedure
    .input(
      z.object({ id: z.string(), name: z.string().optional(), isIncome: z.boolean().optional() }),
    )
    .mutation(async ({ input }) => {
      const id: CategoryId = categoryIdFromString(input.id);
      const existing = (await getCategories()).find((category) => category.id === id);
      if (existing === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Category "${id}" not found` });
      }

      const updated = updateCategory(existing, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.isIncome === undefined ? {} : { isIncome: input.isIncome }),
      });
      await replaceCategory(updated);
      return updated;
    }),
  archiveAccount: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const id: AccountId = accountIdFromString(input.id);
    const existing = (await getAccounts()).find((account) => account.id === id);
    if (existing === undefined) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Account "${id}" not found` });
    }

    const updated = archiveAccount(existing);
    await replaceAccount(updated);
    return updated;
  }),
  unarchiveAccount: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const id: AccountId = accountIdFromString(input.id);
      const existing = (await getAccounts()).find((account) => account.id === id);
      if (existing === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Account "${id}" not found` });
      }

      const updated = unarchiveAccount(existing);
      await replaceAccount(updated);
      return updated;
    }),
  deleteCategory: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const id: CategoryId = categoryIdFromString(input.id);
      const existing = (await getCategories()).find((category) => category.id === id);
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

      await deleteCategory(id);
      return { id };
    }),
  createEnvelopeGroup: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      const envelopeGroup: EnvelopeGroup = createEnvelopeGroup({
        id: envelopeGroupIdFromString(randomUUID()),
        name: input.name,
      });
      await addEnvelopeGroup(envelopeGroup);
      return envelopeGroup;
    }),
  createSubEnvelope: publicProcedure
    .input(
      z.object({
        name: z.string(),
        groupId: z.string(),
        accountIds: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const groupId: EnvelopeGroupId = envelopeGroupIdFromString(input.groupId);
      assertIdExists(await getEnvelopeGroups(), groupId, `Envelope group "${groupId}" not found`);

      const knownAccounts = await getAccounts();
      const accountIds: AccountId[] = input.accountIds.map((rawAccountId) => {
        const accountId: AccountId = accountIdFromString(rawAccountId);
        assertIdExists(knownAccounts, accountId, `Account "${accountId}" not found`);
        return accountId;
      });

      const subEnvelope: SubEnvelope = createSubEnvelope({
        id: subEnvelopeIdFromString(randomUUID()),
        name: input.name,
        groupId,
        accountIds,
      });
      await addSubEnvelope(subEnvelope);
      return subEnvelope;
    }),
  updateEnvelopeGroup: publicProcedure
    .input(z.object({ id: z.string(), name: z.string().optional() }))
    .mutation(async ({ input }) => {
      const id: EnvelopeGroupId = envelopeGroupIdFromString(input.id);
      const existing = (await getEnvelopeGroups()).find(
        (envelopeGroup) => envelopeGroup.id === id,
      );
      if (existing === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Envelope group "${id}" not found` });
      }

      const updated = updateEnvelopeGroup(existing, {
        ...(input.name === undefined ? {} : { name: input.name }),
      });
      await replaceEnvelopeGroup(updated);
      return updated;
    }),
  updateSubEnvelope: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        accountIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const id: SubEnvelopeId = subEnvelopeIdFromString(input.id);
      const existing = (await getSubEnvelopes()).find((subEnvelope) => subEnvelope.id === id);
      if (existing === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Sub-envelope "${id}" not found` });
      }

      let accountIds: AccountId[] | undefined;
      if (input.accountIds !== undefined) {
        const knownAccounts = await getAccounts();
        accountIds = input.accountIds.map((rawAccountId) => {
          const accountId: AccountId = accountIdFromString(rawAccountId);
          assertIdExists(knownAccounts, accountId, `Account "${accountId}" not found`);
          return accountId;
        });
      }

      const updated = updateSubEnvelope(existing, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(accountIds === undefined ? {} : { accountIds }),
      });
      await replaceSubEnvelope(updated);
      return updated;
    }),
  archiveSubEnvelope: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const id: SubEnvelopeId = subEnvelopeIdFromString(input.id);
      const existing = (await getSubEnvelopes()).find((subEnvelope) => subEnvelope.id === id);
      if (existing === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Sub-envelope "${id}" not found` });
      }

      const updated = archiveSubEnvelope(existing);
      await replaceSubEnvelope(updated);
      return updated;
    }),
  unarchiveSubEnvelope: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const id: SubEnvelopeId = subEnvelopeIdFromString(input.id);
      const existing = (await getSubEnvelopes()).find((subEnvelope) => subEnvelope.id === id);
      if (existing === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Sub-envelope "${id}" not found` });
      }

      const updated = unarchiveSubEnvelope(existing);
      await replaceSubEnvelope(updated);
      return updated;
    }),
  deleteEnvelopeGroup: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const id: EnvelopeGroupId = envelopeGroupIdFromString(input.id);
      const existing = (await getEnvelopeGroups()).find(
        (envelopeGroup) => envelopeGroup.id === id,
      );
      if (existing === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Envelope group "${id}" not found` });
      }

      const isReferenced = (await getSubEnvelopes()).some(
        (subEnvelope) => subEnvelope.groupId === id,
      );
      if (isReferenced) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Envelope group "${id}" is still in use and cannot be deleted`,
        });
      }

      await deleteEnvelopeGroup(id);
      return { id };
    }),
});
