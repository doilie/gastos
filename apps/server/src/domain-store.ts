// Real, Postgres-backed implementation of the remaining Domain/Reference
// store surface (CreditCard/PaydaySchedule/CardPurchase/BudgetLine) —
// mirrors apps/server/src/reference-store.ts's exact shape. `CreditCard`
// and `PaydaySchedule` are schema-wise Reference-layer tables, but
// apps/server/src/store.ts has always grouped them alongside
// CardPurchase/BudgetLine as "not yet DB-backed", so this file keeps doing
// the same rather than folding them into reference-store.ts. `addCardPurchase`
// is the first `add`/`replace`-style mutation for any of these four types —
// wired up for the new `cards.createCardPurchase` tRPC mutation; there is
// still no `add`/`replace` for CreditCard/PaydaySchedule, since no mutation
// for those exists in this app yet.

import { budgetLines, cardPurchases, creditCards, paydaySchedules, type Db } from "@gastos/db";
import {
  accountIdFromString,
  type BudgetLine,
  budgetLineIdFromString,
  type CardPurchase,
  cardPurchaseIdFromString,
  categoryIdFromString,
  centsFromInt,
  type CreditCard,
  creditCardIdFromString,
  currencyCodeFromString,
  type FundingSource,
  fundingSourceFromAccount,
  fundingSourceFromEnvelope,
  ledgerDateFromString,
  type PaydaySchedule,
  paydayScheduleIdFromString,
  subEnvelopeIdFromString,
  UNFUNDED_SOURCE,
} from "@gastos/shared";
import { eq } from "drizzle-orm";

/** The async remaining-Domain-layer store surface, backed by a real Postgres `Db`. */
export interface DomainStore {
  getCreditCards(): Promise<readonly CreditCard[]>;
  getPaydaySchedules(): Promise<readonly PaydaySchedule[]>;
  getCardPurchases(): Promise<readonly CardPurchase[]>;
  addCardPurchase(purchase: CardPurchase): Promise<void>;
  getBudgetLines(): Promise<readonly BudgetLine[]>;
  replaceBudgetLine(line: BudgetLine): Promise<void>;
}

function toCreditCard(row: typeof creditCards.$inferSelect): CreditCard {
  return {
    id: creditCardIdFromString(row.id),
    name: row.name,
    currency: currencyCodeFromString(row.currency),
    cutoffDay: row.cutoffDay,
    isArchived: row.isArchived,
  };
}

async function getCreditCardsImpl(db: Db): Promise<readonly CreditCard[]> {
  const rows = await db.select().from(creditCards);
  return rows.map(toCreditCard);
}

function toPaydaySchedule(row: typeof paydaySchedules.$inferSelect): PaydaySchedule {
  return {
    id: paydayScheduleIdFromString(row.id),
    name: row.name,
    paydayDaysOfMonth: row.paydayDaysOfMonth,
  };
}

async function getPaydaySchedulesImpl(db: Db): Promise<readonly PaydaySchedule[]> {
  const rows = await db.select().from(paydaySchedules);
  return rows.map(toPaydaySchedule);
}

/**
 * Reconstructs a `CardPurchase`'s `FundingSource` from its three flattened
 * columns (`fundingSourceKind` plus one nullable id column per variant —
 * see `packages/db/src/schema/domain.ts`). The account/envelope id columns
 * are asserted non-null when their kind is selected: guaranteed by this
 * app's own write path, even though the columns are nullable at the schema
 * level (only one variant's column is ever populated per row).
 */
function toFundingSource(row: typeof cardPurchases.$inferSelect): FundingSource {
  if (row.fundingSourceKind === "account") {
    if (row.fundingSourceAccountId === null) {
      throw new Error("toFundingSource: account-funded row missing fundingSourceAccountId");
    }
    return fundingSourceFromAccount(accountIdFromString(row.fundingSourceAccountId));
  }
  if (row.fundingSourceKind === "envelope") {
    if (row.fundingSourceEnvelopeId === null) {
      throw new Error("toFundingSource: envelope-funded row missing fundingSourceEnvelopeId");
    }
    return fundingSourceFromEnvelope(subEnvelopeIdFromString(row.fundingSourceEnvelopeId));
  }
  return UNFUNDED_SOURCE;
}

function toCardPurchase(row: typeof cardPurchases.$inferSelect): CardPurchase {
  return {
    id: cardPurchaseIdFromString(row.id),
    creditCardId: creditCardIdFromString(row.creditCardId),
    date: ledgerDateFromString(row.date),
    description: row.description,
    categoryId: row.categoryId === null ? null : categoryIdFromString(row.categoryId),
    amount: centsFromInt(row.amount),
    fundingSource: toFundingSource(row),
  };
}

async function getCardPurchasesImpl(db: Db): Promise<readonly CardPurchase[]> {
  const rows = await db.select().from(cardPurchases);
  return rows.map(toCardPurchase);
}

/**
 * The inverse of `toFundingSource`: flattens a domain `FundingSource` into
 * the three columns `cardPurchases` stores it as — only one of
 * `fundingSourceAccountId`/`fundingSourceEnvelopeId` is ever populated per
 * row, matching the variant `fundingSourceKind` selects.
 */
function fundingSourceColumns(source: FundingSource): {
  fundingSourceKind: string;
  fundingSourceAccountId: string | null;
  fundingSourceEnvelopeId: string | null;
} {
  switch (source.kind) {
    case "account":
      return {
        fundingSourceKind: "account",
        fundingSourceAccountId: source.accountId,
        fundingSourceEnvelopeId: null,
      };
    case "envelope":
      return {
        fundingSourceKind: "envelope",
        fundingSourceAccountId: null,
        fundingSourceEnvelopeId: source.subEnvelopeId,
      };
    case "none":
      return {
        fundingSourceKind: "none",
        fundingSourceAccountId: null,
        fundingSourceEnvelopeId: null,
      };
  }
}

async function addCardPurchaseImpl(db: Db, purchase: CardPurchase): Promise<void> {
  await db.insert(cardPurchases).values({
    id: purchase.id,
    creditCardId: purchase.creditCardId,
    date: purchase.date,
    description: purchase.description,
    categoryId: purchase.categoryId,
    amount: purchase.amount,
    ...fundingSourceColumns(purchase.fundingSource),
  });
}

function toBudgetLine(row: typeof budgetLines.$inferSelect): BudgetLine {
  return {
    id: budgetLineIdFromString(row.id),
    budgetPeriod: { year: row.budgetPeriodYear, month: row.budgetPeriodMonth },
    paydayDate: ledgerDateFromString(row.paydayDate),
    subEnvelopeId: subEnvelopeIdFromString(row.subEnvelopeId),
    amount: centsFromInt(row.amount),
    description: row.description,
    isApplied: row.isApplied,
  };
}

async function getBudgetLinesImpl(db: Db): Promise<readonly BudgetLine[]> {
  const rows = await db.select().from(budgetLines);
  return rows.map(toBudgetLine);
}

async function replaceBudgetLineImpl(db: Db, line: BudgetLine): Promise<void> {
  await db
    .update(budgetLines)
    .set({
      budgetPeriodYear: line.budgetPeriod.year,
      budgetPeriodMonth: line.budgetPeriod.month,
      paydayDate: line.paydayDate,
      subEnvelopeId: line.subEnvelopeId,
      amount: line.amount,
      description: line.description,
      isApplied: line.isApplied,
    })
    .where(eq(budgetLines.id, line.id));
}

/**
 * Builds a `DomainStore` backed by `db` — a real Postgres connection for
 * production use (see `apps/server/src/db.ts`), or any other `Db` instance
 * for anyone else who needs one.
 */
export function createDomainStore(db: Db): DomainStore {
  return {
    getCreditCards: () => getCreditCardsImpl(db),
    getPaydaySchedules: () => getPaydaySchedulesImpl(db),
    getCardPurchases: () => getCardPurchasesImpl(db),
    addCardPurchase: (purchase) => addCardPurchaseImpl(db, purchase),
    getBudgetLines: () => getBudgetLinesImpl(db),
    replaceBudgetLine: (line) => replaceBudgetLineImpl(db, line),
  };
}
