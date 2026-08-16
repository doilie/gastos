// CardCycleSettlement: the "Settle cycle" batch flow (HLD §3.4, "Card cycle |
// Cut-off day (17th) | 'What do I owe this card, and from where?' | CC
// statement, payment split"). Since `req/what-i-want.txt` describes funding
// as "per expense" — every `CardPurchase` already carries exactly one
// `FundingSource`, there is no split *within* a purchase — the HLD's
// "payment split" is a batch operation over *multiple* purchases within one
// billing cycle, each settled independently via `settleCardPurchase`.
// "Settle cycle" attempts to settle every in-cycle purchase it can right
// now, and reports which ones it couldn't, so the caller/UI knows what still
// needs attention (a `FundingSource` to assign, or a concrete account/
// sub-envelope for the settling user to pick).
//
// This is a Domain-layer file: it may depend on Ledger Core, Reference,
// money, and other Domain files, per the layer map in
// `packages/config/README.md`.

import type { CardCycle } from "./card-cycle";
import { isDateWithinCardCycle } from "./card-cycle";
import type { CardPurchase } from "./card-purchase";
import { isUnfundedSource } from "./funding-source";
import type { SettleCardPurchaseInput } from "./card-settlement";
import { settleCardPurchase } from "./card-settlement";
import type { Transaction } from "../ledger-core/transaction";

/** Result of a "Settle cycle" batch attempt over one billing cycle. */
export interface CardCycleSettlementResult {
  /** Ledger transactions produced for purchases that were successfully
   * settled. */
  readonly settledTransactions: readonly Transaction[];
  /** In-cycle purchases that could not be settled right now — either
   * unfunded, or the caller chose to defer them. */
  readonly skippedPurchases: readonly CardPurchase[];
}

/**
 * Attempts to settle every purchase in `purchases` that falls within
 * `cycle`. For each in-cycle purchase, `resolveSettlementInput` is asked for
 * the concrete `SettleCardPurchaseInput` to settle it with; returning `null`
 * defers that purchase (pushed onto `skippedPurchases`, not an error).
 * Purchases with an unfunded `FundingSource` are skipped without even
 * calling `resolveSettlementInput`, since `settleCardPurchase` would reject
 * them. Purchases outside `cycle` are excluded from the result entirely.
 *
 * Any `SettleCardPurchaseInput` returned by `resolveSettlementInput` is
 * expected to be consistent with the purchase's declared `FundingSource`;
 * `settleCardPurchase` is allowed to throw if it isn't — that's a caller
 * bug, not a "couldn't settle yet" case, so it is not caught here.
 */
export function settleCardCycle(
  purchases: readonly CardPurchase[],
  cycle: CardCycle,
  resolveSettlementInput: (purchase: CardPurchase) => SettleCardPurchaseInput | null,
): CardCycleSettlementResult {
  const settledTransactions: Transaction[] = [];
  const skippedPurchases: CardPurchase[] = [];

  const inCyclePurchases = purchases.filter((purchase) =>
    isDateWithinCardCycle(purchase.date, cycle),
  );

  for (const purchase of inCyclePurchases) {
    if (isUnfundedSource(purchase.fundingSource)) {
      skippedPurchases.push(purchase);
      continue;
    }

    const input = resolveSettlementInput(purchase);
    if (input === null) {
      skippedPurchases.push(purchase);
      continue;
    }

    settledTransactions.push(settleCardPurchase(purchase, input));
  }

  return { settledTransactions, skippedPurchases };
}
