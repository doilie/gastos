// Pure re-export barrel over ./db's store singletons — no local state at
// all. Every table this app reads/writes (Account/Category/EnvelopeGroup/
// SubEnvelope via `referenceStore`, Transaction via `ledgerStore`,
// CreditCard/PaydaySchedule/CardPurchase/BudgetLine via `domainStore`) is
// now real, Postgres-backed data (see ./reference-store.ts, ./ledger-store.ts,
// ./domain-store.ts, and ./db.ts's idempotent `seedReferenceData`/
// `seedRemainingFixtureData`). Routers import from this file rather than
// from ./db directly so the store surface stays a single, stable import
// path regardless of which layer's data happens to live behind it.

import { domainStore, ledgerStore, referenceStore } from "./db";

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

export const { getTransactions, addTransaction } = ledgerStore;

export const {
  getCreditCards,
  getPaydaySchedules,
  getCardPurchases,
  getBudgetLines,
  replaceBudgetLine,
} = domainStore;
