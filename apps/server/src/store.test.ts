import { describe, expect, it } from "vitest";
import {
  centsFromInt,
  deriveSubEnvelopeBalance,
  isAccountFundingSource,
  isEnvelopeFundingSource,
  isSpendableEnvelope,
  isUnfundedSource,
  paydaysInMonth,
  SPENDABLE_ENVELOPE_ID,
  subEnvelopeIdFromString,
} from "@gastos/shared";

import {
  getAccounts,
  getBudgetLines,
  getCardPurchases,
  getCategories,
  getCreditCards,
  getEnvelopeGroups,
  getPaydaySchedules,
  getSubEnvelopes,
  getTransactions,
} from "./store";

describe("store: accounts", () => {
  it("returns exactly the 2 expected seed accounts", () => {
    const accounts = getAccounts();
    expect(accounts).toHaveLength(2);
    const ids = accounts.map((account) => account.id);
    expect(ids).toContain("account-checking");
    expect(ids).toContain("account-savings");
  });
});

describe("store: categories", () => {
  it("returns exactly 3 categories, exactly one of which is isIncome: true", () => {
    const categories = getCategories();
    expect(categories).toHaveLength(3);

    const incomeCategories = categories.filter((category) => category.isIncome);
    const nonIncomeCategories = categories.filter((category) => !category.isIncome);

    expect(incomeCategories).toHaveLength(1);
    expect(incomeCategories[0]?.id).toBe("category-income");
    expect(nonIncomeCategories).toHaveLength(2);
  });
});

describe("store: envelope groups", () => {
  it("returns exactly 1 envelope group", () => {
    expect(getEnvelopeGroups()).toHaveLength(1);
  });
});

describe("store: sub-envelopes", () => {
  it("returns exactly 2 sub-envelopes, exactly one of which is the reserved Spendable envelope", () => {
    const subEnvelopes = getSubEnvelopes();
    expect(subEnvelopes).toHaveLength(2);

    const spendableEnvelopes = subEnvelopes.filter(isSpendableEnvelope);
    expect(spendableEnvelopes).toHaveLength(1);
    expect(spendableEnvelopes[0]?.id).toBe(SPENDABLE_ENVELOPE_ID);
  });
});

describe("store: referential integrity", () => {
  it("every SubEnvelope.accountIds entry corresponds to a real seeded account", () => {
    const accountIds = new Set(getAccounts().map((account) => account.id));
    for (const subEnvelope of getSubEnvelopes()) {
      for (const accountId of subEnvelope.accountIds) {
        expect(accountIds).toContain(accountId);
      }
    }
  });

  it("every non-null SubEnvelope.groupId corresponds to a real seeded envelope group", () => {
    const groupIds = new Set(getEnvelopeGroups().map((group) => group.id));
    for (const subEnvelope of getSubEnvelopes()) {
      if (subEnvelope.groupId !== null) {
        expect(groupIds).toContain(subEnvelope.groupId);
      }
    }
  });

  it("every Transaction.accountId corresponds to a real seeded account", () => {
    const accountIds = new Set(getAccounts().map((account) => account.id));
    for (const transaction of getTransactions()) {
      expect(accountIds).toContain(transaction.accountId);
    }
  });

  it("every Transaction.subEnvelopeId corresponds to a real seeded sub-envelope", () => {
    const subEnvelopeIds = new Set(getSubEnvelopes().map((subEnvelope) => subEnvelope.id));
    for (const transaction of getTransactions()) {
      expect(subEnvelopeIds).toContain(transaction.subEnvelopeId);
    }
  });

  it("every non-null Transaction.categoryId corresponds to a real seeded category", () => {
    const categoryIds = new Set(getCategories().map((category) => category.id));
    for (const transaction of getTransactions()) {
      if (transaction.categoryId !== null) {
        expect(categoryIds).toContain(transaction.categoryId);
      }
    }
  });
});

describe("store: credit cards", () => {
  it("returns exactly 1 credit card", () => {
    expect(getCreditCards()).toHaveLength(1);
  });
});

describe("store: card purchases", () => {
  it("returns exactly 3 card purchases", () => {
    expect(getCardPurchases()).toHaveLength(3);
  });

  it("includes exactly one of each FundingSource kind (account/envelope/none)", () => {
    const purchases = getCardPurchases();
    const accountFunded = purchases.filter((purchase) =>
      isAccountFundingSource(purchase.fundingSource),
    );
    const envelopeFunded = purchases.filter((purchase) =>
      isEnvelopeFundingSource(purchase.fundingSource),
    );
    const unfunded = purchases.filter((purchase) => isUnfundedSource(purchase.fundingSource));

    expect(accountFunded).toHaveLength(1);
    expect(envelopeFunded).toHaveLength(1);
    expect(unfunded).toHaveLength(1);
  });
});

describe("store: credit-card referential integrity", () => {
  it("every CardPurchase.creditCardId corresponds to a real seeded credit card", () => {
    const creditCardIds = new Set(getCreditCards().map((creditCard) => creditCard.id));
    for (const purchase of getCardPurchases()) {
      expect(creditCardIds).toContain(purchase.creditCardId);
    }
  });

  it("every non-null CardPurchase.categoryId corresponds to a real seeded category", () => {
    const categoryIds = new Set(getCategories().map((category) => category.id));
    for (const purchase of getCardPurchases()) {
      if (purchase.categoryId !== null) {
        expect(categoryIds).toContain(purchase.categoryId);
      }
    }
  });

  it("every account-funded CardPurchase.fundingSource.accountId corresponds to a real seeded account", () => {
    const accountIds = new Set(getAccounts().map((account) => account.id));
    for (const purchase of getCardPurchases()) {
      if (isAccountFundingSource(purchase.fundingSource)) {
        expect(accountIds).toContain(purchase.fundingSource.accountId);
      }
    }
  });

  it("every envelope-funded CardPurchase.fundingSource.subEnvelopeId corresponds to a real seeded sub-envelope", () => {
    const subEnvelopeIds = new Set(getSubEnvelopes().map((subEnvelope) => subEnvelope.id));
    for (const purchase of getCardPurchases()) {
      if (isEnvelopeFundingSource(purchase.fundingSource)) {
        expect(subEnvelopeIds).toContain(purchase.fundingSource.subEnvelopeId);
      }
    }
  });
});

describe("store: sign-convention sanity check (derived balances)", () => {
  it("derives the Spendable envelope's balance from seeded transactions", () => {
    // txn-salary +5000000, txn-groceries-1 -120050, txn-transport-1 -5000,
    // txn-groceries-2 -84000 => 5000000 - 120050 - 5000 - 84000 = 4790950
    const balance = deriveSubEnvelopeBalance(getTransactions(), SPENDABLE_ENVELOPE_ID);
    expect(balance).toBe(centsFromInt(4790950));
  });

  it("derives the Groceries Fund envelope's balance from seeded transactions", () => {
    // Confirm the envelope is really in the seeded set before deriving its balance.
    const groceriesFundId = subEnvelopeIdFromString("sub-envelope-groceries-fund");
    const subEnvelopeIds = getSubEnvelopes().map((subEnvelope) => subEnvelope.id);
    expect(subEnvelopeIds).toContain(groceriesFundId);

    // Only txn-groceries-fund-allocation touches this envelope: +300000
    const balance = deriveSubEnvelopeBalance(getTransactions(), groceriesFundId);
    expect(balance).toBe(centsFromInt(300000));
  });
});

describe("store: payday schedules", () => {
  it("returns exactly 1 payday schedule", () => {
    expect(getPaydaySchedules()).toHaveLength(1);
  });
});

describe("store: budget lines", () => {
  it("returns exactly 2 budget lines", () => {
    expect(getBudgetLines()).toHaveLength(2);
  });
});

describe("store: budget referential integrity", () => {
  it("every BudgetLine.subEnvelopeId corresponds to a real seeded sub-envelope", () => {
    const subEnvelopeIds = new Set(getSubEnvelopes().map((subEnvelope) => subEnvelope.id));
    for (const line of getBudgetLines()) {
      expect(subEnvelopeIds).toContain(line.subEnvelopeId);
    }
  });
});

describe("store: budget seed-data sanity check", () => {
  it("every seeded BudgetLine.paydayDate actually is a payday under the seeded default PaydaySchedule", () => {
    const [defaultSchedule] = getPaydaySchedules();
    expect(defaultSchedule).toBeDefined();
    if (defaultSchedule === undefined) {
      return;
    }

    for (const line of getBudgetLines()) {
      const paydaysThatMonth = paydaysInMonth(
        defaultSchedule,
        line.budgetPeriod.year,
        line.budgetPeriod.month,
      );
      expect(paydaysThatMonth).toContain(line.paydayDate);
    }
  });
});
