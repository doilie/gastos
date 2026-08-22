import {
  type Account,
  accountIdFromString,
  type Category,
  categoryIdFromString,
  createAccount,
  createCategory,
  currencyCodeFromString,
} from "@gastos/shared";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { publicProcedure, router } from "../trpc";
import {
  addAccount,
  addCategory,
  getAccounts,
  getCategories,
  getEnvelopeGroups,
  getSubEnvelopes,
} from "../store";

/**
 * Read-only Reference-layer queries (Account/Category/EnvelopeGroup/
 * SubEnvelope), plus `createAccount`/`createCategory` mutations — the "More
 * tab CRUD" thread's Create-only slice. Update/Archive/Delete are deferred to
 * later increments. Thin wrappers over the in-memory store — no business
 * logic here, that all lives in `@gastos/shared`.
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
});
