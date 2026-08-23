// Seed store: the Reference layer (Account/Category/EnvelopeGroup/
// SubEnvelope) is now real, Postgres-backed data — see ./db.ts's
// `referenceStore` (built via ./reference-store.ts's `createReferenceStore`)
// and its idempotent `seedReferenceData`. Everything else here
// (Transaction/CreditCard/CardPurchase/PaydaySchedule/BudgetLine) is still
// process-memory only, no persistence, resets on restart — that swap to a
// real database is deferred to later increments, one layer at a time.

import {
  type BudgetLine,
  budgetLineIdFromString,
  type CardPurchase,
  cardPurchaseIdFromString,
  centsFromInt,
  createBudgetLine,
  createCardPurchase,
  createCreditCard,
  createPaydaySchedule,
  createTransaction,
  type CreditCard,
  creditCardIdFromString,
  currencyCodeFromString,
  fundingSourceFromAccount,
  fundingSourceFromEnvelope,
  ledgerDateFromString,
  type PaydaySchedule,
  paydayScheduleIdFromString,
  SPENDABLE_ENVELOPE_ID,
  type Transaction,
  transactionIdFromString,
} from "@gastos/shared";

import {
  CHECKING_ACCOUNT_ID,
  GROCERIES_CATEGORY_ID,
  GROCERIES_FUND_ENVELOPE_ID,
  INCOME_CATEGORY_ID,
  referenceStore,
  SAVINGS_ACCOUNT_ID,
  TRANSPORT_CATEGORY_ID,
} from "./db";

export const {
  getAccounts,
  addAccount,
  replaceAccount,
  getCategories,
  addCategory,
  replaceCategory,
  deleteCategory,
  getEnvelopeGroups,
  addEnvelopeGroup,
  replaceEnvelopeGroup,
  deleteEnvelopeGroup,
  getSubEnvelopes,
  addSubEnvelope,
  replaceSubEnvelope,
} = referenceStore;

const PHP = currencyCodeFromString("PHP");

const transactions: Transaction[] = [
  createTransaction({
    id: transactionIdFromString("txn-salary"),
    date: ledgerDateFromString("2026-08-01"),
    description: "Salary",
    categoryId: INCOME_CATEGORY_ID,
    accountId: CHECKING_ACCOUNT_ID,
    subEnvelopeId: SPENDABLE_ENVELOPE_ID,
    amount: centsFromInt(5000000),
  }),
  createTransaction({
    id: transactionIdFromString("txn-groceries-1"),
    date: ledgerDateFromString("2026-08-03"),
    description: "Weekly groceries",
    categoryId: GROCERIES_CATEGORY_ID,
    accountId: CHECKING_ACCOUNT_ID,
    subEnvelopeId: SPENDABLE_ENVELOPE_ID,
    amount: centsFromInt(-120050),
  }),
  createTransaction({
    id: transactionIdFromString("txn-transport-1"),
    date: ledgerDateFromString("2026-08-05"),
    description: "Jeepney fare",
    categoryId: TRANSPORT_CATEGORY_ID,
    accountId: CHECKING_ACCOUNT_ID,
    subEnvelopeId: SPENDABLE_ENVELOPE_ID,
    amount: centsFromInt(-5000),
  }),
  createTransaction({
    id: transactionIdFromString("txn-groceries-2"),
    date: ledgerDateFromString("2026-08-08"),
    description: "Market run",
    categoryId: GROCERIES_CATEGORY_ID,
    accountId: CHECKING_ACCOUNT_ID,
    subEnvelopeId: SPENDABLE_ENVELOPE_ID,
    amount: centsFromInt(-84000),
  }),
  createTransaction({
    id: transactionIdFromString("txn-groceries-fund-allocation"),
    date: ledgerDateFromString("2026-08-10"),
    description: "Allocate to Groceries Fund",
    categoryId: null,
    accountId: SAVINGS_ACCOUNT_ID,
    subEnvelopeId: GROCERIES_FUND_ENVELOPE_ID,
    amount: centsFromInt(300000),
  }),
];

const visaCard: CreditCard = createCreditCard({
  id: creditCardIdFromString("credit-card-visa"),
  name: "Visa",
  currency: PHP,
  cutoffDay: 17,
});

const creditCards: readonly CreditCard[] = [visaCard];

const cardPurchases: readonly CardPurchase[] = [
  createCardPurchase({
    id: cardPurchaseIdFromString("card-purchase-transport-1"),
    creditCardId: visaCard.id,
    date: ledgerDateFromString("2026-07-20"),
    description: "Grab ride",
    categoryId: TRANSPORT_CATEGORY_ID,
    amount: centsFromInt(45000),
    fundingSource: fundingSourceFromAccount(CHECKING_ACCOUNT_ID),
  }),
  createCardPurchase({
    id: cardPurchaseIdFromString("card-purchase-groceries-1"),
    creditCardId: visaCard.id,
    date: ledgerDateFromString("2026-08-02"),
    description: "Supermarket run",
    categoryId: GROCERIES_CATEGORY_ID,
    amount: centsFromInt(210000),
    fundingSource: fundingSourceFromEnvelope(GROCERIES_FUND_ENVELOPE_ID),
  }),
  createCardPurchase({
    id: cardPurchaseIdFromString("card-purchase-groceries-2"),
    creditCardId: visaCard.id,
    date: ledgerDateFromString("2026-08-12"),
    description: "Convenience store snacks",
    categoryId: GROCERIES_CATEGORY_ID,
    amount: centsFromInt(15000),
  }),
];

const defaultPaydaySchedule: PaydaySchedule = createPaydaySchedule({
  id: paydayScheduleIdFromString("payday-schedule-default"),
  name: "Semi-monthly",
  paydayDaysOfMonth: [15, 31],
});

const paydaySchedules: readonly PaydaySchedule[] = [defaultPaydaySchedule];

const augustPaydayDate = ledgerDateFromString("2026-08-15");
const augustBudgetPeriod = { year: 2026, month: 8 };

const budgetLines: BudgetLine[] = [
  createBudgetLine({
    id: budgetLineIdFromString("budget-line-groceries-fund-august-15"),
    budgetPeriod: augustBudgetPeriod,
    paydayDate: augustPaydayDate,
    subEnvelopeId: GROCERIES_FUND_ENVELOPE_ID,
    amount: centsFromInt(500000),
    description: "Payday allocation — Groceries Fund",
  }),
  createBudgetLine({
    id: budgetLineIdFromString("budget-line-spendable-august-15"),
    budgetPeriod: augustBudgetPeriod,
    paydayDate: augustPaydayDate,
    subEnvelopeId: SPENDABLE_ENVELOPE_ID,
    amount: centsFromInt(2000000),
    description: "Payday allocation — Spendable",
  }),
];

/** Returns the seeded transactions. */
export function getTransactions(): readonly Transaction[] {
  return transactions;
}

/** Appends `transaction` to the in-memory store. */
export function addTransaction(transaction: Transaction): void {
  transactions.push(transaction);
}

/** Returns the seeded credit cards. */
export function getCreditCards(): readonly CreditCard[] {
  return creditCards;
}

/** Returns the seeded card purchases. */
export function getCardPurchases(): readonly CardPurchase[] {
  return cardPurchases;
}

/** Returns the seeded payday schedules. */
export function getPaydaySchedules(): readonly PaydaySchedule[] {
  return paydaySchedules;
}

/** Returns the seeded budget lines. */
export function getBudgetLines(): readonly BudgetLine[] {
  return budgetLines;
}

/**
 * Overwrites the existing budget line with the same `id` as `line`. Trusts
 * the caller (the router) already validated the id exists — no NOT_FOUND
 * handling here, mirroring the Reference-layer store's exact "store just
 * does the mechanical operation" split.
 */
export function replaceBudgetLine(line: BudgetLine): void {
  const index = budgetLines.findIndex((existing) => existing.id === line.id);
  budgetLines[index] = line;
}
