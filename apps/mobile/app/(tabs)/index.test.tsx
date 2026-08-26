import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    ledger: {
      spendableBalance: {
        useQuery: jest.fn(),
      },
      subEnvelopeBalance: {
        useQuery: jest.fn(),
      },
      addTransaction: {
        useMutation: jest.fn(),
      },
      transactions: {
        useQuery: jest.fn(),
      },
      updateTransaction: {
        useMutation: jest.fn(),
      },
      deleteTransaction: {
        useMutation: jest.fn(),
      },
    },
    reference: {
      subEnvelopes: {
        useQuery: jest.fn(),
      },
      categories: {
        useQuery: jest.fn(),
      },
      accounts: {
        useQuery: jest.fn(),
      },
    },
    budget: {
      paydaySchedules: {
        useQuery: jest.fn(),
      },
    },
    cards: {
      creditCards: {
        useQuery: jest.fn(),
      },
      createCardPurchase: {
        useMutation: jest.fn(),
      },
    },
    useUtils: jest.fn(),
  },
}));

import {
  accountIdFromString,
  categoryIdFromString,
  centsFromInt,
  createCategory,
  createPaydaySchedule,
  createTransaction,
  dailySpendableAllowance,
  formatCents,
  ledgerDateFromString,
  paydayScheduleIdFromString,
  subEnvelopeIdFromString,
  transactionIdFromString,
  type Category,
  type PaydaySchedule,
  type Transaction,
} from "@gastos/shared";

import { trpc } from "../../lib/trpc";
import TodayScreen from "./index";

// The component only reads `isPending`, `isError`, and `data` off the query
// result, so the mock only needs to supply those fields — not a full
// `UseQueryResult<Cents, unknown>` shape.
interface MockQueryResult<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}

// Minimal shape of a `SubEnvelope` as read by `findSpendableAccountId` —
// a plain object literal is fine here since this suite tests `TodayScreen`'s
// wiring, not `@gastos/shared`'s validation.
interface MockSubEnvelope {
  id: string;
  name: string;
  groupId: string | null;
  accountIds: string[];
}

// Minimal shape of a `PaydaySchedule` as read by `dailySpendableAllowance` —
// same "just the fields the component/function needs" style as
// `MockSubEnvelope` above.
interface MockPaydaySchedule {
  id: string;
  name: string;
  paydayDaysOfMonth: readonly number[];
}

// Minimal shapes read by `QuickAddForm`'s own hooks (unconditionally called on every
// render, even while the form is collapsed) — same "just the fields needed" style as
// `MockSubEnvelope`/`MockPaydaySchedule` above. These existing tests never open the
// form, so their contents are never asserted on, just present so the hooks don't crash.
interface MockAccount {
  id: string;
  name: string;
  currency: string;
}

interface MockCreditCard {
  id: string;
  name: string;
  currency: string;
  cutoffDay: number;
}

interface MockMutationResult {
  mutate: jest.Mock;
  isPending: boolean;
  isError: boolean;
  reset: jest.Mock;
}

const mockUseQuery = trpc.ledger.spendableBalance
  .useQuery as unknown as jest.Mock<MockQueryResult<number>>;
const mockSubEnvelopesUseQuery = trpc.reference.subEnvelopes
  .useQuery as unknown as jest.Mock<MockQueryResult<MockSubEnvelope[]>>;
const mockAddTransactionUseMutation = trpc.ledger.addTransaction
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockTransactionsUseQuery = trpc.ledger.transactions
  .useQuery as unknown as jest.Mock<MockQueryResult<Transaction[]>>;
const mockCategoriesUseQuery = trpc.reference.categories
  .useQuery as unknown as jest.Mock<MockQueryResult<Category[]>>;
const mockUpdateTransactionUseMutation = trpc.ledger.updateTransaction
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockDeleteTransactionUseMutation = trpc.ledger.deleteTransaction
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockPaydaySchedulesUseQuery = trpc.budget.paydaySchedules
  .useQuery as unknown as jest.Mock<MockQueryResult<MockPaydaySchedule[]>>;
const mockSubEnvelopeBalanceUseQuery = trpc.ledger.subEnvelopeBalance
  .useQuery as unknown as jest.Mock<MockQueryResult<number>>;
const mockAccountsUseQuery = trpc.reference.accounts
  .useQuery as unknown as jest.Mock<MockQueryResult<MockAccount[]>>;
const mockCreditCardsUseQuery = trpc.cards.creditCards
  .useQuery as unknown as jest.Mock<MockQueryResult<MockCreditCard[]>>;
const mockCreateCardPurchaseUseMutation = trpc.cards.createCardPurchase
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockUseUtils = trpc.useUtils as unknown as jest.Mock<{
  ledger: {
    spendableBalance: { invalidate: jest.Mock };
    transactions: { invalidate: jest.Mock };
  };
  cards: {
    cardPurchases: { invalidate: jest.Mock };
  };
}>;

/** A pending query result, used for the "still loading" states. */
function pending<T>(): MockQueryResult<T> {
  return { isPending: true, isError: false, data: undefined };
}

/** A successful query result carrying `data`. */
function success<T>(data: T): MockQueryResult<T> {
  return { isPending: false, isError: false, data };
}

/** An errored query result. */
function errored<T>(): MockQueryResult<T> {
  return { isPending: false, isError: true, data: undefined };
}

function mockMutationResult(
  overrides: Partial<MockMutationResult> = {},
): MockMutationResult {
  return {
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    reset: jest.fn(),
    ...overrides,
  };
}

/** A successful `spendableBalance` result — the shared default most tests below need. */
function successfulBalance(amount = 0): MockQueryResult<number> {
  return success(centsFromInt(amount));
}

/**
 * The default `PaydaySchedule` fixture used by `beforeEach` below and by the
 * daily-allowance assertions further down — a realistic single-schedule
 * shape (matching what's actually seeded server-side), built through the
 * real `createPaydaySchedule` factory so it's guaranteed valid, and reused
 * as the single source of truth for both the mocked query response and the
 * hand-computed expectation (via the real `dailySpendableAllowance`).
 */
const paydayScheduleFixture: PaydaySchedule = createPaydaySchedule({
  id: paydayScheduleIdFromString("payday-schedule-default"),
  name: "Semi-monthly",
  paydayDaysOfMonth: [15, 31],
});

beforeEach(() => {
  // Default wiring for `QuickAddForm`'s own hooks — these existing tests
  // exercise `TodayScreen`'s three balance states, not the quick-add form
  // itself (that's covered in QuickAddForm.test.tsx), so these are
  // harmless no-ops plus one Spendable-shaped sub-envelope so the "+ Add"
  // button ends up enabled.
  mockSubEnvelopesUseQuery.mockReturnValue({
    isPending: false,
    isError: false,
    data: [
      {
        id: "spendable",
        name: "Spendable",
        groupId: null,
        accountIds: ["acc-1"],
      },
    ],
  });
  mockAddTransactionUseMutation.mockReturnValue(mockMutationResult());
  // Default wiring for `TransactionsSection`'s own hooks — an empty
  // transaction list keeps the 3 existing `TodayScreen` balance tests
  // below behaviorally unchanged (an empty list renders a "Transactions"
  // heading with nothing under it, not a loading/error state that could
  // interfere with the balance assertions).
  mockTransactionsUseQuery.mockReturnValue(success([]));
  mockCategoriesUseQuery.mockReturnValue(success([]));
  mockUpdateTransactionUseMutation.mockReturnValue(mockMutationResult());
  mockDeleteTransactionUseMutation.mockReturnValue(mockMutationResult());
  // Default wiring for `TodayScreen`'s two new header-gating queries — a
  // realistic single-schedule fixture (matching what's actually seeded
  // server-side) and a plausible zero Credit Card Budget balance, so the 3
  // pre-existing balance-display tests (and every other existing test in
  // this file) keep passing unmodified.
  mockPaydaySchedulesUseQuery.mockReturnValue(success([paydayScheduleFixture]));
  mockSubEnvelopeBalanceUseQuery.mockReturnValue(success(centsFromInt(0)));
  mockAccountsUseQuery.mockReturnValue(success([]));
  mockCreditCardsUseQuery.mockReturnValue(success([]));
  mockCreateCardPurchaseUseMutation.mockReturnValue(mockMutationResult());
  mockUseUtils.mockReturnValue({
    ledger: {
      spendableBalance: { invalidate: jest.fn() },
      transactions: { invalidate: jest.fn() },
    },
    cards: {
      cardPurchases: { invalidate: jest.fn() },
    },
  });
});

afterEach(() => {
  mockUseQuery.mockReset();
  mockSubEnvelopesUseQuery.mockReset();
  mockAddTransactionUseMutation.mockReset();
  mockTransactionsUseQuery.mockReset();
  mockCategoriesUseQuery.mockReset();
  mockUpdateTransactionUseMutation.mockReset();
  mockDeleteTransactionUseMutation.mockReset();
  mockPaydaySchedulesUseQuery.mockReset();
  mockSubEnvelopeBalanceUseQuery.mockReset();
  mockAccountsUseQuery.mockReset();
  mockCreditCardsUseQuery.mockReset();
  mockCreateCardPurchaseUseMutation.mockReset();
  mockUseUtils.mockReset();
});

describe("TodayScreen", () => {
  it("renders a loading state while the query is pending", async () => {
    mockUseQuery.mockReturnValue(pending());

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });

  it("renders an error state when the query fails", async () => {
    mockUseQuery.mockReturnValue(errored());

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });

  it("renders the formatted spendable balance on success", async () => {
    const balance = centsFromInt(4790950);
    mockUseQuery.mockReturnValue(success(balance));

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Today")).toBeTruthy();
    expect(getByText(formatCents(balance))).toBeTruthy();
  });
});

describe("TransactionsSection loading state", () => {
  it("shows Loading… under the Transactions heading while transactions is pending, independently of the balance header", async () => {
    mockUseQuery.mockReturnValue(successfulBalance(1000));
    mockTransactionsUseQuery.mockReturnValue(pending());

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Today")).toBeTruthy();
    expect(getByText("Transactions")).toBeTruthy();
    expect(getByText("Loading…")).toBeTruthy();
  });

  it("shows Loading… while categories is pending (not transactions)", async () => {
    mockUseQuery.mockReturnValue(successfulBalance(1000));
    mockCategoriesUseQuery.mockReturnValue(pending());

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });
});

describe("TransactionsSection error state", () => {
  it("shows Something went wrong. under the Transactions heading when transactions errors", async () => {
    mockUseQuery.mockReturnValue(successfulBalance(1000));
    mockTransactionsUseQuery.mockReturnValue(errored());

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Transactions")).toBeTruthy();
    expect(getByText("Something went wrong.")).toBeTruthy();
  });

  it("shows Something went wrong. when categories errors (not transactions)", async () => {
    mockUseQuery.mockReturnValue(successfulBalance(1000));
    mockCategoriesUseQuery.mockReturnValue(errored());

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });
});

const groceriesCategory: Category = createCategory({
  id: categoryIdFromString("cat-groceries"),
  name: "Groceries",
  isIncome: false,
});

const salaryCategory: Category = createCategory({
  id: categoryIdFromString("cat-salary"),
  name: "Salary",
  isIncome: true,
});

function buildTransaction(overrides: {
  id: string;
  date: string;
  description: string;
  amount: number;
  categoryId?: string | null;
  accountId?: string;
  subEnvelopeId?: string;
}): Transaction {
  return createTransaction({
    id: transactionIdFromString(overrides.id),
    date: ledgerDateFromString(overrides.date),
    description: overrides.description,
    categoryId:
      overrides.categoryId === undefined
        ? null
        : overrides.categoryId === null
          ? null
          : categoryIdFromString(overrides.categoryId),
    accountId: accountIdFromString(overrides.accountId ?? "acc-1"),
    subEnvelopeId: subEnvelopeIdFromString(overrides.subEnvelopeId ?? "spendable"),
    amount: centsFromInt(overrides.amount),
  });
}

const rentTransaction = buildTransaction({
  id: "tx-rent",
  date: "2026-08-01",
  description: "Rent",
  amount: -100000,
  categoryId: null,
});

const freelanceTransaction = buildTransaction({
  id: "tx-freelance",
  date: "2026-08-15",
  description: "Freelance income",
  amount: 50000,
  categoryId: "cat-salary",
});

const groceriesTransaction = buildTransaction({
  id: "tx-groceries",
  date: "2026-08-20",
  description: "Groceries",
  amount: -3050,
  categoryId: "cat-groceries",
  accountId: "acc-2",
  subEnvelopeId: "env-1",
});

const unmatchedCategoryTransaction = buildTransaction({
  id: "tx-unmatched",
  date: "2026-08-10",
  description: "Mystery charge",
  amount: -500,
  categoryId: "cat-does-not-exist",
});

/** Renders `TodayScreen` with a successful balance and the given transactions/categories. */
async function renderWithTransactions(
  transactions: Transaction[],
  categories: Category[] = [groceriesCategory, salaryCategory],
): Promise<void> {
  mockUseQuery.mockReturnValue(successfulBalance(0));
  mockTransactionsUseQuery.mockReturnValue(success(transactions));
  mockCategoriesUseQuery.mockReturnValue(success(categories));
  await render(<TodayScreen />);
}

describe("TransactionsSection success — rendering and sort order", () => {
  it("renders every transaction most-recent-first by date", async () => {
    await renderWithTransactions([rentTransaction, freelanceTransaction, groceriesTransaction]);

    expect(screen.getByText("2026-08-01 — Rent")).toBeTruthy();
    expect(screen.getByText("2026-08-15 — Freelance income")).toBeTruthy();
    expect(screen.getByText("2026-08-20 — Groceries")).toBeTruthy();

    // No established multi-item render-order idiom exists elsewhere in this
    // codebase's test suites, so this serializes the rendered tree and
    // compares each row's substring position — document order matches
    // render order, so this reliably proves most-recent-first sorting.
    const serialized = JSON.stringify(screen.toJSON());
    const groceriesPos = serialized.indexOf("Groceries");
    const freelancePos = serialized.indexOf("Freelance income");
    const rentPos = serialized.indexOf("Rent");
    expect(groceriesPos).toBeGreaterThanOrEqual(0);
    expect(groceriesPos).toBeLessThan(freelancePos);
    expect(freelancePos).toBeLessThan(rentPos);
  });
});

describe("TransactionRow display", () => {
  it("renders date/description/formatted amount and the resolved category name", async () => {
    await renderWithTransactions([groceriesTransaction]);

    expect(screen.getByText("2026-08-20 — Groceries")).toBeTruthy();
    expect(
      screen.getByText(`${formatCents(groceriesTransaction.amount)} · Groceries`),
    ).toBeTruthy();
  });

  it('renders "Uncategorized" for a null categoryId', async () => {
    await renderWithTransactions([rentTransaction]);

    expect(screen.getByText(`${formatCents(rentTransaction.amount)} · Uncategorized`)).toBeTruthy();
  });

  it("falls back to the raw category id when it does not match any known category", async () => {
    await renderWithTransactions([unmatchedCategoryTransaction]);

    expect(
      screen.getByText(`${formatCents(unmatchedCategoryTransaction.amount)} · cat-does-not-exist`),
    ).toBeTruthy();
  });
});

describe("TransactionRow edit toggle", () => {
  it("shows no edit inputs before Edit is tapped", async () => {
    await renderWithTransactions([groceriesTransaction]);

    expect(screen.queryByDisplayValue("Groceries")).toBeNull();
    expect(screen.queryByText("Save")).toBeNull();
  });

  it("tapping Edit reveals date/description/amount inputs pre-filled with the transaction's current values", async () => {
    await renderWithTransactions([groceriesTransaction]);

    await fireEvent.press(screen.getByText("Edit"));

    expect(screen.getByDisplayValue("2026-08-20")).toBeTruthy();
    expect(screen.getByDisplayValue("Groceries")).toBeTruthy();
    expect(screen.getByDisplayValue("-30.50")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
  });
});

describe("TransactionRow edit cancel", () => {
  it("reverts uncommitted changes and exits edit mode on Cancel, without calling the mutation", async () => {
    const mutate = jest.fn();
    mockUpdateTransactionUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await renderWithTransactions([groceriesTransaction]);

    await fireEvent.press(screen.getByText("Edit"));
    await fireEvent.changeText(screen.getByPlaceholderText("Description"), "Changed");
    await fireEvent.press(screen.getByText("Cancel"));

    expect(screen.getByText("2026-08-20 — Groceries")).toBeTruthy();
    expect(screen.queryByText("Changed")).toBeNull();
    expect(screen.queryByText("Cancel")).toBeNull();
    expect(mutate).not.toHaveBeenCalled();

    // Re-opening Edit shows the original saved value, not the cancelled one.
    await fireEvent.press(screen.getByText("Edit"));
    expect(screen.getByDisplayValue("Groceries")).toBeTruthy();
    expect(screen.queryByDisplayValue("Changed")).toBeNull();
  });
});

describe("TransactionRow edit save", () => {
  it("calls updateTransaction.mutate with only id/date/description/amount, trimmed", async () => {
    const mutate = jest.fn();
    mockUpdateTransactionUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await renderWithTransactions([groceriesTransaction]);

    await fireEvent.press(screen.getByText("Edit"));
    await fireEvent.changeText(screen.getByPlaceholderText("Date (YYYY-MM-DD)"), "2026-08-21");
    await fireEvent.changeText(screen.getByPlaceholderText("Description"), "  Big Groceries  ");
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "-45.00");
    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      id: groceriesTransaction.id,
      date: "2026-08-21",
      description: "Big Groceries",
      amount: "-45.00",
    });
  });

  it("disables Save when description is empty", async () => {
    await renderWithTransactions([groceriesTransaction]);

    await fireEvent.press(screen.getByText("Edit"));
    await fireEvent.changeText(screen.getByPlaceholderText("Description"), "   ");

    expect(screen.getByText("Save")).toBeDisabled();
  });

  it("disables Save when the amount is not a valid signed decimal shape", async () => {
    await renderWithTransactions([groceriesTransaction]);

    await fireEvent.press(screen.getByText("Edit"));
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "abc");

    expect(screen.getByText("Save")).toBeDisabled();
  });

  it("disables Save when the amount is zero", async () => {
    await renderWithTransactions([groceriesTransaction]);

    await fireEvent.press(screen.getByText("Edit"));
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "0");

    expect(screen.getByText("Save")).toBeDisabled();
  });
});

describe("TransactionRow edit mutation error", () => {
  it("shows the inline error message and stays in edit mode", async () => {
    mockUpdateTransactionUseMutation.mockReturnValue(mockMutationResult({ isError: true }));
    await renderWithTransactions([groceriesTransaction]);

    await fireEvent.press(screen.getByText("Edit"));

    expect(screen.getByText("Couldn't save — try again.")).toBeTruthy();
    expect(screen.getByDisplayValue("Groceries")).toBeTruthy();
  });
});

describe("TransactionRow delete flow", () => {
  it("tapping Delete reveals the confirmation without calling deleteTransaction.mutate", async () => {
    const mutate = jest.fn();
    mockDeleteTransactionUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await renderWithTransactions([groceriesTransaction]);

    await fireEvent.press(screen.getByText("Delete"));

    expect(screen.getByText("Delete this transaction?")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("Confirm")).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("tapping Cancel in the confirmation dismisses it without calling deleteTransaction.mutate", async () => {
    const mutate = jest.fn();
    mockDeleteTransactionUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await renderWithTransactions([groceriesTransaction]);

    await fireEvent.press(screen.getByText("Delete"));
    await fireEvent.press(screen.getByText("Cancel"));

    expect(screen.queryByText("Delete this transaction?")).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("tapping Confirm calls deleteTransaction.mutate with the transaction's id", async () => {
    const mutate = jest.fn();
    mockDeleteTransactionUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await renderWithTransactions([groceriesTransaction]);

    await fireEvent.press(screen.getByText("Delete"));
    await fireEvent.press(screen.getByText("Confirm"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ id: groceriesTransaction.id });
  });

  it("shows Deleting… and disables controls while the delete mutation is pending", async () => {
    // The Delete button itself is disabled once the mutation is pending, so
    // the confirmation panel must be opened first (mutation not yet
    // pending), then the mock is swapped to a pending result and the tree
    // re-rendered — same instance, so `isConfirming` state survives.
    mockUseQuery.mockReturnValue(successfulBalance(0));
    mockTransactionsUseQuery.mockReturnValue(success([groceriesTransaction]));
    mockCategoriesUseQuery.mockReturnValue(success([groceriesCategory, salaryCategory]));
    mockDeleteTransactionUseMutation.mockReturnValue(mockMutationResult());
    const { rerender } = await render(<TodayScreen />);

    await fireEvent.press(screen.getByText("Delete"));
    expect(screen.getByText("Confirm")).toBeTruthy();

    mockDeleteTransactionUseMutation.mockReturnValue(mockMutationResult({ isPending: true }));
    await rerender(<TodayScreen />);

    expect(screen.getByText("Deleting…")).toBeTruthy();
    expect(screen.queryByText("Confirm")).toBeNull();
    expect(screen.getByText("Deleting…")).toBeDisabled();
    expect(screen.getByText("Cancel")).toBeDisabled();
  });

  it("shows the generic fallback error message when the delete mutation errors", async () => {
    mockDeleteTransactionUseMutation.mockReturnValue(mockMutationResult({ isError: true }));
    await renderWithTransactions([groceriesTransaction]);

    await fireEvent.press(screen.getByText("Delete"));

    expect(screen.getByText("Couldn't delete — try again.")).toBeTruthy();
  });
});

describe("TodayScreen header gate — paydaySchedules/subEnvelopeBalance (Increment 64)", () => {
  it("shows Loading… while paydaySchedules is pending", async () => {
    mockUseQuery.mockReturnValue(successfulBalance(0));
    mockPaydaySchedulesUseQuery.mockReturnValue(pending());

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });

  it("shows Loading… while subEnvelopeBalance (Credit Card Budget) is pending", async () => {
    mockUseQuery.mockReturnValue(successfulBalance(0));
    mockSubEnvelopeBalanceUseQuery.mockReturnValue(pending());

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });

  it("shows Something went wrong. when paydaySchedules errors", async () => {
    mockUseQuery.mockReturnValue(successfulBalance(0));
    mockPaydaySchedulesUseQuery.mockReturnValue(errored());

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });

  it("shows Something went wrong. when subEnvelopeBalance (Credit Card Budget) errors", async () => {
    mockUseQuery.mockReturnValue(successfulBalance(0));
    mockSubEnvelopeBalanceUseQuery.mockReturnValue(errored());

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });
});

describe("TodayScreen Credit Card Budget balance display", () => {
  it("renders the formatted subEnvelopeBalance result under the 'Credit Card Budget' label", async () => {
    mockUseQuery.mockReturnValue(successfulBalance(1000));
    const ccBalance = centsFromInt(250000);
    mockSubEnvelopeBalanceUseQuery.mockReturnValue(success(ccBalance));

    const { getByText } = await render(<TodayScreen />);

    expect(getByText(`Credit Card Budget: ${formatCents(ccBalance)}`)).toBeTruthy();
  });
});

// `dailySpendableAllowance` derives "how many days remain" from the real
// system clock's "today" (via `index.tsx`'s own `todayLedgerDate`), so a
// precise, hand-verifiable assertion needs the clock pinned — mirroring
// `reports.test.tsx`/`cards.test.tsx`'s `PINNED_TODAY`/fake-timer setup for
// their own date-dependent navigation coverage.
const PINNED_TODAY = "2026-08-10";

describe("TodayScreen daily allowance display (pinned system clock)", () => {
  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: false });
    jest.setSystemTime(new Date(`${PINNED_TODAY}T12:00:00.000Z`));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("renders the exact daily allowance computed from the balance and the default payday schedule", async () => {
    const balance = centsFromInt(10000);
    mockUseQuery.mockReturnValue(success(balance));

    const { getByText } = await render(<TodayScreen />);

    // Computed via the real `dailySpendableAllowance` against the exact same
    // fixture/reference-date the component itself uses — with the system
    // clock pinned to `PINNED_TODAY`, this is a precise, non-flaky
    // end-to-end expectation, not a loosely-approximated one.
    const expectedDailyAllowance = dailySpendableAllowance(
      balance,
      paydayScheduleFixture,
      ledgerDateFromString(PINNED_TODAY),
    );
    expect(getByText(`≈ ${formatCents(expectedDailyAllowance)} / day`)).toBeTruthy();
  });
});

describe("TodayScreen daily allowance — no-schedule fallback", () => {
  it("still renders successfully when paydaySchedules.data is an empty array", async () => {
    mockUseQuery.mockReturnValue(successfulBalance(5000));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Today")).toBeTruthy();
    // `paydaySchedules.data[0]` is `undefined` here, so `dailySpendableAllowance`
    // falls back to its documented month-end-only runway. The exact figure is
    // dependent on the real, unpinned system clock's "today" in this describe
    // block, so only presence of a formatted "≈ ... / day" figure is asserted
    // — not the precise value (covered precisely, with a pinned clock, above).
    expect(getByText(/^≈ .+ \/ day$/)).toBeTruthy();
  });
});
