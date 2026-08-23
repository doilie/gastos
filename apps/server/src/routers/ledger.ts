import {
  type AccountId,
  accountIdFromString,
  type CategoryId,
  categoryIdFromString,
  createTransaction,
  deriveAccountBalance,
  deriveSubEnvelopeBalance,
  parseCents,
  SPENDABLE_ENVELOPE_ID,
  type SubEnvelopeId,
  subEnvelopeIdFromString,
  type Transaction,
  type TransactionId,
  transactionIdFromString,
  ledgerDateFromString,
  updateTransaction as updateTransactionInLedger,
} from "@gastos/shared";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { publicProcedure, router } from "../trpc";
import {
  addTransaction,
  deleteTransaction,
  getAccounts,
  getCategories,
  getSubEnvelopes,
  getTransactions,
  replaceTransaction,
} from "../store";

/**
 * Throws a `NOT_FOUND` TRPCError unless some item in `items` has the given
 * `id`. Shared by `accountBalance`/`subEnvelopeBalance` so the "look it up,
 * 404 if missing" check isn't duplicated per procedure.
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

const addTransactionInputSchema = z.object({
  date: z.string(),
  description: z.string(),
  categoryId: z.string().nullable(),
  accountId: z.string(),
  subEnvelopeId: z.string(),
  amount: z.string(), // a signed decimal string, e.g. "150.00" or "-150.00"
});

type AddTransactionInput = z.infer<typeof addTransactionInputSchema>;

/**
 * Parses and validates the id-shaped fields of an `addTransaction` input
 * against the store, throwing `NOT_FOUND` (via `assertIdExists`) for any
 * reference that doesn't resolve to a seeded entity. Fetches each
 * Reference-layer list at most once (now real DB round trips).
 */
async function resolveTransactionInput(input: AddTransactionInput): Promise<{
  accountId: AccountId;
  subEnvelopeId: SubEnvelopeId;
  categoryId: CategoryId | null;
}> {
  const [accountsList, subEnvelopesList, categoriesList] = await Promise.all([
    getAccounts(),
    getSubEnvelopes(),
    getCategories(),
  ]);

  const accountId: AccountId = accountIdFromString(input.accountId);
  assertIdExists(accountsList, accountId, `Account "${accountId}" not found`);

  const subEnvelopeId: SubEnvelopeId = subEnvelopeIdFromString(input.subEnvelopeId);
  assertIdExists(subEnvelopesList, subEnvelopeId, `Sub-envelope "${subEnvelopeId}" not found`);

  const categoryId: CategoryId | null =
    input.categoryId === null ? null : categoryIdFromString(input.categoryId);
  if (categoryId !== null) {
    assertIdExists(categoriesList, categoryId, `Category "${categoryId}" not found`);
  }

  return { accountId, subEnvelopeId, categoryId };
}

const updateTransactionInputSchema = z.object({
  id: z.string(),
  date: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  accountId: z.string().optional(),
  subEnvelopeId: z.string().optional(),
  amount: z.string().optional(), // a signed decimal string, same convention as addTransaction
});

type UpdateTransactionInput = z.infer<typeof updateTransactionInputSchema>;

/**
 * Parses and validates the optionally-provided id-shaped fields of an
 * `updateTransaction` input against the store, throwing `NOT_FOUND` (via
 * `assertIdExists`) for any reference that doesn't resolve to a seeded
 * entity. Mirrors `resolveTransactionInput`, but every field is optional —
 * `undefined` means "not provided," matching `updateTransactionInLedger`'s
 * own "don't touch this field" convention.
 */
function resolveUpdateTransactionIds(
  input: UpdateTransactionInput,
  lists: {
    accounts: readonly { readonly id: unknown }[];
    subEnvelopes: readonly { readonly id: unknown }[];
    categories: readonly { readonly id: unknown }[];
  },
): {
  accountId: AccountId | undefined;
  subEnvelopeId: SubEnvelopeId | undefined;
  categoryId: CategoryId | null | undefined;
} {
  let accountId: AccountId | undefined;
  if (input.accountId !== undefined) {
    accountId = accountIdFromString(input.accountId);
    assertIdExists(lists.accounts, accountId, `Account "${accountId}" not found`);
  }

  let subEnvelopeId: SubEnvelopeId | undefined;
  if (input.subEnvelopeId !== undefined) {
    subEnvelopeId = subEnvelopeIdFromString(input.subEnvelopeId);
    assertIdExists(lists.subEnvelopes, subEnvelopeId, `Sub-envelope "${subEnvelopeId}" not found`);
  }

  let categoryId: CategoryId | null | undefined;
  if (input.categoryId !== undefined) {
    categoryId = input.categoryId === null ? null : categoryIdFromString(input.categoryId);
    if (categoryId !== null) {
      assertIdExists(lists.categories, categoryId, `Category "${categoryId}" not found`);
    }
  }

  return { accountId, subEnvelopeId, categoryId };
}

/**
 * Read-only Ledger Core queries (Transaction list, Spendable envelope
 * balance, and parameterized account/sub-envelope balances), plus the
 * `addTransaction` mutation — the app's single "quick add" write path,
 * covering both the Spendable and envelope cases (structurally identical:
 * both are just a `Transaction` against some `accountId`+`subEnvelopeId`) —
 * and `updateTransaction`/`deleteTransaction`, completing the Transaction
 * CRUD thread. `updateTransaction` never touches `counterTransactionId`
 * (transfer-pair editing is out of scope); `deleteTransaction` is a plain
 * hard delete with no referential-integrity check, since nothing else in
 * this schema references a `Transaction.id`.
 */
export const ledgerRouter = router({
  transactions: publicProcedure.query(async () => getTransactions()),
  spendableBalance: publicProcedure.query(async () =>
    deriveSubEnvelopeBalance(await getTransactions(), SPENDABLE_ENVELOPE_ID),
  ),
  accountBalance: publicProcedure
    .input(z.object({ accountId: z.string() }))
    .query(async ({ input }) => {
      const accountId: AccountId = accountIdFromString(input.accountId);
      const [accounts, transactions] = await Promise.all([getAccounts(), getTransactions()]);
      assertIdExists(accounts, accountId, `Account "${accountId}" not found`);
      return deriveAccountBalance(transactions, accountId);
    }),
  subEnvelopeBalance: publicProcedure
    .input(z.object({ subEnvelopeId: z.string() }))
    .query(async ({ input }) => {
      const subEnvelopeId: SubEnvelopeId = subEnvelopeIdFromString(input.subEnvelopeId);
      const [subEnvelopes, transactions] = await Promise.all([
        getSubEnvelopes(),
        getTransactions(),
      ]);
      assertIdExists(subEnvelopes, subEnvelopeId, `Sub-envelope "${subEnvelopeId}" not found`);
      return deriveSubEnvelopeBalance(transactions, subEnvelopeId);
    }),
  addTransaction: publicProcedure
    .input(addTransactionInputSchema)
    .mutation(async ({ input }) => {
      const { accountId, subEnvelopeId, categoryId } = await resolveTransactionInput(input);
      const transaction: Transaction = createTransaction({
        id: transactionIdFromString(randomUUID()),
        date: ledgerDateFromString(input.date),
        description: input.description,
        categoryId,
        accountId,
        subEnvelopeId,
        amount: parseCents(input.amount),
      });
      await addTransaction(transaction);
      return transaction;
    }),
  updateTransaction: publicProcedure
    .input(updateTransactionInputSchema)
    .mutation(async ({ input }) => {
      const id: TransactionId = transactionIdFromString(input.id);
      const [accounts, subEnvelopes, categories, transactions] = await Promise.all([
        getAccounts(),
        getSubEnvelopes(),
        getCategories(),
        getTransactions(),
      ]);

      const existing = transactions.find((transaction) => transaction.id === id);
      if (existing === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Transaction "${id}" not found` });
      }

      const { accountId, subEnvelopeId, categoryId } = resolveUpdateTransactionIds(input, {
        accounts,
        subEnvelopes,
        categories,
      });

      const updated = updateTransactionInLedger(existing, {
        ...(input.date === undefined ? {} : { date: ledgerDateFromString(input.date) }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(categoryId === undefined ? {} : { categoryId }),
        ...(accountId === undefined ? {} : { accountId }),
        ...(subEnvelopeId === undefined ? {} : { subEnvelopeId }),
        ...(input.amount === undefined ? {} : { amount: parseCents(input.amount) }),
      });
      await replaceTransaction(updated);
      return updated;
    }),
  deleteTransaction: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const id: TransactionId = transactionIdFromString(input.id);
      const existing = (await getTransactions()).find((transaction) => transaction.id === id);
      if (existing === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Transaction "${id}" not found` });
      }

      await deleteTransaction(id);
      return { id };
    }),
});
