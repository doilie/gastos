import { deriveSubEnvelopeBalance, SPENDABLE_ENVELOPE_ID } from "@gastos/shared";

import { publicProcedure, router } from "../trpc";
import { getTransactions } from "../store";

/**
 * Read-only Ledger Core queries (Transaction list, Spendable envelope
 * balance). Thin wrappers over the in-memory store — no business logic
 * here, that all lives in `@gastos/shared`. No mutation procedures yet, and
 * no parameterized queries (those need Zod input validation, deferred to a
 * later increment).
 */
export const ledgerRouter = router({
  transactions: publicProcedure.query(() => getTransactions()),
  spendableBalance: publicProcedure.query(() =>
    deriveSubEnvelopeBalance(getTransactions(), SPENDABLE_ENVELOPE_ID),
  ),
});
