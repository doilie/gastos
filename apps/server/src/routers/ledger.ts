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
  transactionIdFromString,
  ledgerDateFromString,
} from "@gastos/shared";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { publicProcedure, router } from "../trpc";
import {
  addTransaction,
  getAccounts,
  getCategories,
  getSubEnvelopes,
  getTransactions,
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

/**
 * Read-only Ledger Core queries (Transaction list, Spendable envelope
 * balance, and parameterized account/sub-envelope balances), plus the
 * `addTransaction` mutation — the app's single "quick add" write path,
 * covering both the Spendable and envelope cases (structurally identical:
 * both are just a `Transaction` against some `accountId`+`subEnvelopeId`).
 */
export const ledgerRouter = router({
  transactions: publicProcedure.query(() => getTransactions()),
  spendableBalance: publicProcedure.query(() =>
    deriveSubEnvelopeBalance(getTransactions(), SPENDABLE_ENVELOPE_ID),
  ),
  accountBalance: publicProcedure
    .input(z.object({ accountId: z.string() }))
    .query(async ({ input }) => {
      const accountId: AccountId = accountIdFromString(input.accountId);
      assertIdExists(await getAccounts(), accountId, `Account "${accountId}" not found`);
      return deriveAccountBalance(getTransactions(), accountId);
    }),
  subEnvelopeBalance: publicProcedure
    .input(z.object({ subEnvelopeId: z.string() }))
    .query(async ({ input }) => {
      const subEnvelopeId: SubEnvelopeId = subEnvelopeIdFromString(input.subEnvelopeId);
      assertIdExists(
        await getSubEnvelopes(),
        subEnvelopeId,
        `Sub-envelope "${subEnvelopeId}" not found`,
      );
      return deriveSubEnvelopeBalance(getTransactions(), subEnvelopeId);
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
      addTransaction(transaction);
      return transaction;
    }),
});
