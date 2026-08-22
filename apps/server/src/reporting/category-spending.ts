// Category spending report: "spending per category per month vs income per
// month" (`req/what-i-want.txt`). This is the first slice of the Reporting
// layer — the topmost layer in this codebase's one-directional layering
// (Reporting -> Domain -> Ledger Core -> Reference, enforced by
// `eslint-plugin-boundaries`; see `packages/config/eslint.config.mjs`). Pure,
// testable aggregation only — no server router or UI yet, mirroring how the
// Budget thread started with `packages/shared/src/domain/budget-line.ts`
// before any server/UI work landed.

import {
  addCents,
  type BudgetPeriod,
  type Category,
  type CategoryId,
  centsFromInt,
  type Cents,
  isDateWithinBudgetPeriod,
  type Transaction,
} from "@gastos/shared";

/** One category's total for the report period. See `buildCategorySpendingReport` for the sign convention. */
export interface CategorySpendingEntry {
  readonly categoryId: CategoryId;
  readonly total: Cents;
}

/**
 * "Spending per category per month vs income per month" — the report itself.
 * `spendingByCategory` only lists categories with at least one contributing
 * transaction (no invented zero-entries), sorted by `categoryId` ascending.
 */
export interface CategorySpendingReport {
  readonly period: BudgetPeriod;
  readonly spendingByCategory: readonly CategorySpendingEntry[];
  readonly incomeTotal: Cents;
}

/** Running accumulators mutated in place while walking the transaction list. */
interface Accumulators {
  incomeTotal: Cents;
  readonly spendingByCategory: Map<CategoryId, Cents>;
}

/**
 * Resolves `transaction`'s category (skipping it if `categoryId` is null or
 * doesn't match any given `Category` — not an error, per this function's
 * pure-aggregator contract) and folds its signed `amount` into the correct
 * accumulator: `incomeTotal` for an income category, or the category's
 * running total in `spendingByCategory` otherwise.
 */
function foldTransaction(
  transaction: Transaction,
  categoriesById: ReadonlyMap<CategoryId, Category>,
  accumulators: Accumulators,
): void {
  if (transaction.categoryId === null) {
    return;
  }
  const category = categoriesById.get(transaction.categoryId);
  if (category === undefined) {
    return;
  }

  if (category.isIncome) {
    accumulators.incomeTotal = addCents(accumulators.incomeTotal, transaction.amount);
    return;
  }

  const priorTotal = accumulators.spendingByCategory.get(category.id) ?? centsFromInt(0);
  accumulators.spendingByCategory.set(category.id, addCents(priorTotal, transaction.amount));
}

function toSortedEntries(spendingByCategory: ReadonlyMap<CategoryId, Cents>): CategorySpendingEntry[] {
  return Array.from(spendingByCategory, ([categoryId, total]) => ({ categoryId, total })).sort((a, b) =>
    a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0,
  );
}

/**
 * Builds the category-spending-vs-income report for `period`.
 *
 * IMPORTANT sign convention: totals are signed sums following this
 * codebase's established `Transaction.amount` convention (positive =
 * credit/inflow, negative = debit/outflow) — this function does NOT flip the
 * sign for "spending" categories. A spending category's total will typically
 * come out negative, and that's correct/expected, matching how every other
 * derived balance in this codebase (`deriveAccountBalance`,
 * `deriveSubEnvelopeBalance`) stays signed rather than converting to an
 * absolute "amount spent" figure.
 */
export function buildCategorySpendingReport(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  period: BudgetPeriod,
): CategorySpendingReport {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const accumulators: Accumulators = {
    incomeTotal: centsFromInt(0),
    spendingByCategory: new Map<CategoryId, Cents>(),
  };

  for (const transaction of transactions) {
    if (!isDateWithinBudgetPeriod(transaction.date, period)) {
      continue;
    }
    foldTransaction(transaction, categoriesById, accumulators);
  }

  return {
    period,
    spendingByCategory: toSortedEntries(accumulators.spendingByCategory),
    incomeTotal: accumulators.incomeTotal,
  };
}
