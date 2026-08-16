import { publicProcedure, router } from "../trpc";
import { getCardPurchases, getCreditCards } from "../store";

/**
 * Read-only Credit Card queries (CreditCard/CardPurchase). Thin wrappers over
 * the in-memory store — no business logic here, that all lives in
 * `@gastos/shared`. No mutation procedures, no cycle-computation endpoints
 * (a client calls `cardCycleContaining`/`sumCardPurchasesInCycle` from
 * `@gastos/shared` directly against the raw data returned here) yet.
 */
export const cardsRouter = router({
  creditCards: publicProcedure.query(() => getCreditCards()),
  cardPurchases: publicProcedure.query(() => getCardPurchases()),
});
