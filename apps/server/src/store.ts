// Temporary in-memory seed store: process-memory only, no persistence, no
// auth, resets on restart. This stands in for a real database until one is
// introduced in a later increment.

import {
  type Account,
  accountIdFromString,
  type CardPurchase,
  cardPurchaseIdFromString,
  type Category,
  categoryIdFromString,
  centsFromInt,
  createAccount,
  createCardPurchase,
  createCategory,
  createCreditCard,
  createEnvelopeGroup,
  createSpendableEnvelope,
  createSubEnvelope,
  createTransaction,
  type CreditCard,
  creditCardIdFromString,
  currencyCodeFromString,
  type EnvelopeGroup,
  envelopeGroupIdFromString,
  fundingSourceFromAccount,
  fundingSourceFromEnvelope,
  ledgerDateFromString,
  type SubEnvelope,
  subEnvelopeIdFromString,
  type Transaction,
  transactionIdFromString,
} from "@gastos/shared";

const PHP = currencyCodeFromString("PHP");

const checkingAccount: Account = createAccount({
  id: accountIdFromString("account-checking"),
  name: "Checking",
  currency: PHP,
});

const savingsAccount: Account = createAccount({
  id: accountIdFromString("account-savings"),
  name: "Savings",
  currency: PHP,
});

const accounts: readonly Account[] = [checkingAccount, savingsAccount];

const incomeCategory: Category = createCategory({
  id: categoryIdFromString("category-income"),
  name: "Income",
  isIncome: true,
});

const groceriesCategory: Category = createCategory({
  id: categoryIdFromString("category-groceries"),
  name: "Groceries",
});

const transportCategory: Category = createCategory({
  id: categoryIdFromString("category-transport"),
  name: "Transport",
});

const categories: readonly Category[] = [incomeCategory, groceriesCategory, transportCategory];

const everydayGroup: EnvelopeGroup = createEnvelopeGroup({
  id: envelopeGroupIdFromString("envelope-group-everyday"),
  name: "Everyday",
});

const envelopeGroups: readonly EnvelopeGroup[] = [everydayGroup];

const groceriesFundEnvelope: SubEnvelope = createSubEnvelope({
  id: subEnvelopeIdFromString("sub-envelope-groceries-fund"),
  name: "Groceries Fund",
  groupId: everydayGroup.id,
  accountIds: [savingsAccount.id],
});

const spendableEnvelope: SubEnvelope = createSpendableEnvelope([checkingAccount.id]);

const subEnvelopes: readonly SubEnvelope[] = [spendableEnvelope, groceriesFundEnvelope];

const transactions: Transaction[] = [
  createTransaction({
    id: transactionIdFromString("txn-salary"),
    date: ledgerDateFromString("2026-08-01"),
    description: "Salary",
    categoryId: incomeCategory.id,
    accountId: checkingAccount.id,
    subEnvelopeId: spendableEnvelope.id,
    amount: centsFromInt(5000000),
  }),
  createTransaction({
    id: transactionIdFromString("txn-groceries-1"),
    date: ledgerDateFromString("2026-08-03"),
    description: "Weekly groceries",
    categoryId: groceriesCategory.id,
    accountId: checkingAccount.id,
    subEnvelopeId: spendableEnvelope.id,
    amount: centsFromInt(-120050),
  }),
  createTransaction({
    id: transactionIdFromString("txn-transport-1"),
    date: ledgerDateFromString("2026-08-05"),
    description: "Jeepney fare",
    categoryId: transportCategory.id,
    accountId: checkingAccount.id,
    subEnvelopeId: spendableEnvelope.id,
    amount: centsFromInt(-5000),
  }),
  createTransaction({
    id: transactionIdFromString("txn-groceries-2"),
    date: ledgerDateFromString("2026-08-08"),
    description: "Market run",
    categoryId: groceriesCategory.id,
    accountId: checkingAccount.id,
    subEnvelopeId: spendableEnvelope.id,
    amount: centsFromInt(-84000),
  }),
  createTransaction({
    id: transactionIdFromString("txn-groceries-fund-allocation"),
    date: ledgerDateFromString("2026-08-10"),
    description: "Allocate to Groceries Fund",
    categoryId: null,
    accountId: savingsAccount.id,
    subEnvelopeId: groceriesFundEnvelope.id,
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
    categoryId: transportCategory.id,
    amount: centsFromInt(45000),
    fundingSource: fundingSourceFromAccount(checkingAccount.id),
  }),
  createCardPurchase({
    id: cardPurchaseIdFromString("card-purchase-groceries-1"),
    creditCardId: visaCard.id,
    date: ledgerDateFromString("2026-08-02"),
    description: "Supermarket run",
    categoryId: groceriesCategory.id,
    amount: centsFromInt(210000),
    fundingSource: fundingSourceFromEnvelope(groceriesFundEnvelope.id),
  }),
  createCardPurchase({
    id: cardPurchaseIdFromString("card-purchase-groceries-2"),
    creditCardId: visaCard.id,
    date: ledgerDateFromString("2026-08-12"),
    description: "Convenience store snacks",
    categoryId: groceriesCategory.id,
    amount: centsFromInt(15000),
  }),
];

/** Returns the seeded accounts. */
export function getAccounts(): readonly Account[] {
  return accounts;
}

/** Returns the seeded categories. */
export function getCategories(): readonly Category[] {
  return categories;
}

/** Returns the seeded envelope groups. */
export function getEnvelopeGroups(): readonly EnvelopeGroup[] {
  return envelopeGroups;
}

/** Returns the seeded sub-envelopes (including the reserved Spendable envelope). */
export function getSubEnvelopes(): readonly SubEnvelope[] {
  return subEnvelopes;
}

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
