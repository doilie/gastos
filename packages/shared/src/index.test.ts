import { describe, expect, it } from "vitest";

import { SHARED_PACKAGE_NAME } from "./index";
import * as money from "./money/index";
import * as budgetPeriod from "./domain/budget-period";
import * as account from "./reference/account";
import * as category from "./reference/category";
import * as creditCard from "./reference/credit-card";
import * as currency from "./reference/currency";
import * as envelope from "./reference/envelope";
import * as paydaySchedule from "./reference/payday-schedule";
import * as transaction from "./ledger-core/transaction";
import * as cardCycle from "./domain/card-cycle";
import * as cardCycleSettlement from "./domain/card-cycle-settlement";
import * as cardPurchase from "./domain/card-purchase";
import * as cardSettlement from "./domain/card-settlement";
import * as fundingSource from "./domain/funding-source";
import * as paydayWindow from "./domain/payday-window";
import * as transfer from "./domain/transfer";

describe("@gastos/shared entry point", () => {
  it("exports SHARED_PACKAGE_NAME as a non-empty string", () => {
    expect(typeof SHARED_PACKAGE_NAME).toBe("string");
    expect(SHARED_PACKAGE_NAME.length).toBeGreaterThan(0);
    expect(SHARED_PACKAGE_NAME).toBe("@gastos/shared");
  });

  it("re-exports the money module through the package barrel", () => {
    // Full behavioral coverage of the money primitives lives in
    // src/money/index.test.ts; this just proves the barrel export wiring
    // (`export * from "./money/index"` in index.ts) stays intact.
    expect(money).toBeDefined();
    expect(typeof money.parseCents).toBe("function");
    expect(typeof money.formatCents).toBe("function");
  });

  it("re-exports the reference/currency module through the package barrel", () => {
    // Full behavioral coverage lives in src/reference/currency.test.ts; this
    // just proves the barrel export wiring stays intact.
    expect(currency).toBeDefined();
    expect(typeof currency.currencyCodeFromString).toBe("function");
  });

  it("re-exports the reference/account module through the package barrel", () => {
    // Full behavioral coverage lives in src/reference/account.test.ts; this
    // just proves the barrel export wiring stays intact.
    expect(account).toBeDefined();
    expect(typeof account.accountIdFromString).toBe("function");
    expect(typeof account.createAccount).toBe("function");
  });

  it("re-exports the reference/category module through the package barrel", () => {
    // Full behavioral coverage lives in src/reference/category.test.ts; this
    // just proves the barrel export wiring stays intact.
    expect(category).toBeDefined();
    expect(typeof category.categoryIdFromString).toBe("function");
    expect(typeof category.createCategory).toBe("function");
  });

  it("re-exports the reference/envelope module through the package barrel", () => {
    // Full behavioral coverage lives in src/reference/envelope.test.ts; this
    // just proves the barrel export wiring stays intact.
    expect(envelope).toBeDefined();
    expect(typeof envelope.createEnvelopeGroup).toBe("function");
    expect(typeof envelope.createSubEnvelope).toBe("function");
    expect(typeof envelope.createSpendableEnvelope).toBe("function");
  });

  it("re-exports the ledger-core/transaction module through the package barrel", () => {
    // Full behavioral coverage lives in src/ledger-core/transaction.test.ts;
    // this just proves the barrel export wiring stays intact.
    expect(transaction).toBeDefined();
    expect(typeof transaction.createTransaction).toBe("function");
    expect(typeof transaction.deriveAccountBalance).toBe("function");
  });

  it("re-exports the domain/funding-source module through the package barrel", () => {
    // Full behavioral coverage lives in src/domain/funding-source.test.ts;
    // this just proves the barrel export wiring stays intact.
    expect(fundingSource).toBeDefined();
    expect(typeof fundingSource.fundingSourceFromAccount).toBe("function");
    expect(typeof fundingSource.fundingSourcesEqual).toBe("function");
  });

  it("re-exports the domain/transfer module through the package barrel", () => {
    // Full behavioral coverage lives in src/domain/transfer.test.ts; this
    // just proves the barrel export wiring stays intact.
    expect(transfer).toBeDefined();
    expect(typeof transfer.createTransferPair).toBe("function");
    expect(typeof transfer.isPairedTransaction).toBe("function");
    expect(typeof transfer.findCounterTransaction).toBe("function");
  });

  it("re-exports the reference/credit-card module through the package barrel", () => {
    // Full behavioral coverage lives in src/reference/credit-card.test.ts;
    // this just proves the barrel export wiring stays intact.
    expect(creditCard).toBeDefined();
    expect(typeof creditCard.creditCardIdFromString).toBe("function");
    expect(typeof creditCard.createCreditCard).toBe("function");
  });

  it("re-exports the reference/payday-schedule module through the package barrel", () => {
    // Full behavioral coverage lives in src/reference/payday-schedule.test.ts;
    // this just proves the barrel export wiring stays intact.
    expect(paydaySchedule).toBeDefined();
    expect(typeof paydaySchedule.paydayScheduleIdFromString).toBe("function");
    expect(typeof paydaySchedule.createPaydaySchedule).toBe("function");
    expect(typeof paydaySchedule.paydaysInMonth).toBe("function");
  });
});

describe("@gastos/shared entry point (credit-card domain)", () => {
  it("re-exports the domain/card-cycle module through the package barrel", () => {
    // Full behavioral coverage lives in src/domain/card-cycle.test.ts; this
    // just proves the barrel export wiring stays intact.
    expect(cardCycle).toBeDefined();
    expect(typeof cardCycle.cardCycleContaining).toBe("function");
  });

  it("re-exports the domain/card-purchase module through the package barrel", () => {
    // Full behavioral coverage lives in src/domain/card-purchase.test.ts; this
    // just proves the barrel export wiring stays intact.
    expect(cardPurchase).toBeDefined();
    expect(typeof cardPurchase.createCardPurchase).toBe("function");
    expect(typeof cardPurchase.sumCardPurchasesInCycle).toBe("function");
  });

  it("re-exports the domain/card-settlement module through the package barrel", () => {
    // Full behavioral coverage lives in src/domain/card-settlement.test.ts;
    // this just proves the barrel export wiring stays intact.
    expect(cardSettlement).toBeDefined();
    expect(typeof cardSettlement.settleCardPurchase).toBe("function");
  });

  it("re-exports the domain/card-cycle-settlement module through the package barrel", () => {
    // Full behavioral coverage lives in src/domain/card-cycle-settlement.test.ts;
    // this just proves the barrel export wiring stays intact.
    expect(cardCycleSettlement).toBeDefined();
    expect(typeof cardCycleSettlement.settleCardCycle).toBe("function");
  });

  it("re-exports the domain/budget-period module through the package barrel", () => {
    // Full behavioral coverage lives in src/domain/budget-period.test.ts; this
    // just proves the barrel export wiring stays intact.
    expect(budgetPeriod).toBeDefined();
    expect(typeof budgetPeriod.budgetPeriodContaining).toBe("function");
    expect(typeof budgetPeriod.budgetPeriodRange).toBe("function");
    expect(typeof budgetPeriod.isDateWithinBudgetPeriod).toBe("function");
  });

  it("re-exports the domain/payday-window module through the package barrel", () => {
    // Full behavioral coverage lives in src/domain/payday-window.test.ts; this
    // just proves the barrel export wiring stays intact.
    expect(paydayWindow).toBeDefined();
    expect(typeof paydayWindow.paydayWindowContaining).toBe("function");
    expect(typeof paydayWindow.isDateWithinPaydayWindow).toBe("function");
  });
});
