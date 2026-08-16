import { publicProcedure, router } from "../trpc";
import { getAccounts, getCategories, getEnvelopeGroups, getSubEnvelopes } from "../store";

/**
 * Read-only Reference-layer queries (Account/Category/EnvelopeGroup/
 * SubEnvelope). Thin wrappers over the in-memory store — no business logic
 * here, that all lives in `@gastos/shared`. No mutation procedures yet.
 */
export const referenceRouter = router({
  accounts: publicProcedure.query(() => getAccounts()),
  categories: publicProcedure.query(() => getCategories()),
  envelopeGroups: publicProcedure.query(() => getEnvelopeGroups()),
  subEnvelopes: publicProcedure.query(() => getSubEnvelopes()),
});
