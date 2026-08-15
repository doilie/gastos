// CardPurchase: the record of an individual credit-card expense (HLD module
// M4, "Purchases" — the per-expense record that §3.4 asks "what do I owe
// this card, and from where?" about). This is a Domain-layer file: it may
// depend on Ledger Core, Reference, and money, per the layer map in
// `packages/config/README.md`.
//
// Scope note: this increment is the type/factory and cycle-total aggregation
// only. Wiring a `CardPurchase` into `Transaction`/ledger postings (HLD
// §2.2's "pre-funding writes a paired Transaction") and the "Settle cycle"
// payment-allocation flow (splitting a statement total across multiple
// `FundingSource`s) are separate, later increments.

import type { CreditCardId } from "../reference/credit-card";
import type { LedgerDate } from "../ledger-core/transaction";
import type { CategoryId } from "../reference/category";
import { type Cents, compareCents, isZeroCents, sumCents, ZERO_CENTS } from "../money";
import { type FundingSource, isUnfundedSource, UNFUNDED_SOURCE } from "./funding-source";
import { type CardCycle, isDateWithinCardCycle } from "./card-cycle";

/** Branded string type: a card-purchase identifier. */
export type CardPurchaseId = string & { readonly __brand: "CardPurchaseId" };

/**
 * Safe constructor: converts a raw `string` into `CardPurchaseId`, throwing
 * if it is empty or whitespace-only.
 */
export function cardPurchaseIdFromString(value: string): CardPurchaseId {
  if (value.trim().length === 0) {
    throw new Error("cardPurchaseIdFromString: value is empty or whitespace-only");
  }
  return value as CardPurchaseId;
}

/**
 * A single credit-card expense. `amount` is always a positive magnitude
 * (how much is owed on the card for this purchase) — this is distinct from
 * `Transaction.amount`'s signed inflow/outflow convention, since a
 * `CardPurchase` is not itself a ledger posting.
 */
export interface CardPurchase {
  readonly id: CardPurchaseId;
  /** Which card this was charged to. */
  readonly creditCardId: CreditCardId;
  readonly date: LedgerDate;
  readonly description: string;
  /** null: no category applies. */
  readonly categoryId: CategoryId | null;
  /** Always a positive magnitude: how much is owed. */
  readonly amount: Cents;
  /** How this purchase is expected to be paid (HLD: "credit card budget,
   * other sub-envelopes, or ... external payments"). */
  readonly fundingSource: FundingSource;
}

function assertNonEmptyDescription(description: string, context: string): string {
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    throw new Error(`${context}: description is empty or whitespace-only`);
  }
  return trimmed;
}

function assertPositiveAmount(amount: Cents, context: string): Cents {
  if (isZeroCents(amount) || compareCents(amount, ZERO_CENTS) < 0) {
    throw new Error(`${context}: amount must be a positive purchase amount`);
  }
  return amount;
}

/**
 * Factory/validator for `CardPurchase`: trims and validates `description` is
 * non-empty, validates `amount` is strictly positive, defaulting
 * `fundingSource` to `UNFUNDED_SOURCE` when omitted.
 */
export function createCardPurchase(input: {
  id: CardPurchaseId;
  creditCardId: CreditCardId;
  date: LedgerDate;
  description: string;
  categoryId: CategoryId | null;
  amount: Cents;
  fundingSource?: FundingSource;
}): CardPurchase {
  return {
    id: input.id,
    creditCardId: input.creditCardId,
    date: input.date,
    description: assertNonEmptyDescription(input.description, "createCardPurchase"),
    categoryId: input.categoryId,
    amount: assertPositiveAmount(input.amount, "createCardPurchase"),
    fundingSource: input.fundingSource ?? UNFUNDED_SOURCE,
  };
}

/** True iff `purchase`'s `fundingSource` is not the `"none"` variant. */
export function isFundedPurchase(purchase: CardPurchase): boolean {
  return !isUnfundedSource(purchase.fundingSource);
}

/**
 * Sums the `amount` of every purchase in `purchases` whose `date` falls
 * within `cycle` (decision A3: totals are always derived). Returns
 * `ZERO_CENTS` if there are no matching purchases.
 */
export function sumCardPurchasesInCycle(
  purchases: readonly CardPurchase[],
  cycle: CardCycle,
): Cents {
  return sumCents(
    purchases
      .filter((purchase) => isDateWithinCardCycle(purchase.date, cycle))
      .map((purchase) => purchase.amount),
  );
}
