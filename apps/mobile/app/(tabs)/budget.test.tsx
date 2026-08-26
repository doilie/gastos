import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    budget: {
      paydaySchedules: {
        useQuery: jest.fn(),
      },
      budgetLines: {
        useQuery: jest.fn(),
      },
      applyBudgetLine: {
        useMutation: jest.fn(),
      },
      createPaydaySchedule: {
        useMutation: jest.fn(),
      },
      createBudgetLine: {
        useMutation: jest.fn(),
      },
      updatePaydaySchedule: {
        useMutation: jest.fn(),
      },
      updateBudgetLine: {
        useMutation: jest.fn(),
      },
      setPaydaySchedulePrimary: {
        useMutation: jest.fn(),
      },
      deletePaydaySchedule: {
        useMutation: jest.fn(),
      },
      deleteBudgetLine: {
        useMutation: jest.fn(),
      },
    },
    reference: {
      subEnvelopes: {
        useQuery: jest.fn(),
      },
      accounts: {
        useQuery: jest.fn(),
      },
    },
    useUtils: jest.fn(),
  },
}));

import {
  type Account,
  type BudgetLine,
  type PaydaySchedule,
  type SubEnvelope,
  accountIdFromString,
  budgetLineIdFromString,
  budgetPeriodContaining,
  centsFromInt,
  createAccount,
  createBudgetLine,
  createPaydaySchedule,
  createSubEnvelope,
  currencyCodeFromString,
  envelopeGroupIdFromString,
  formatCents,
  ledgerDateFromString,
  markBudgetLineApplied,
  markPaydaySchedulePrimary,
  paydaysInMonth,
  paydayScheduleIdFromString,
  subEnvelopeIdFromString,
} from "@gastos/shared";

import { trpc } from "../../lib/trpc";
import BudgetScreen from "./budget";

// The component only reads `isPending`, `isError`, and `data` off each query
// result, so the mocks only need to supply those fields — not full
// `UseTRPCQueryResult` shapes (same approach as envelopes.test.tsx/
// cards.test.tsx).
interface MockQueryResult<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}

// Mirrors QuickAddForm.test.tsx's `MockMutationResult` pattern: the
// component only reads `mutate`, `isPending`, `isSuccess`, and `isError` off
// the mutation result.
interface MockMutationResult {
  mutate: jest.Mock;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  reset: jest.Mock;
}

const mockPaydaySchedulesUseQuery = trpc.budget.paydaySchedules
  .useQuery as unknown as jest.Mock<MockQueryResult<PaydaySchedule[]>>;
const mockBudgetLinesUseQuery = trpc.budget.budgetLines
  .useQuery as unknown as jest.Mock<MockQueryResult<BudgetLine[]>>;
const mockSubEnvelopesUseQuery = trpc.reference.subEnvelopes
  .useQuery as unknown as jest.Mock<MockQueryResult<SubEnvelope[]>>;
const mockAccountsUseQuery = trpc.reference.accounts
  .useQuery as unknown as jest.Mock<MockQueryResult<Account[]>>;
const mockApplyBudgetLineUseMutation = trpc.budget.applyBudgetLine
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockCreatePaydayScheduleUseMutation = trpc.budget.createPaydaySchedule
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockCreateBudgetLineUseMutation = trpc.budget.createBudgetLine
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockUpdatePaydayScheduleUseMutation = trpc.budget.updatePaydaySchedule
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockUpdateBudgetLineUseMutation = trpc.budget.updateBudgetLine
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockSetPaydaySchedulePrimaryUseMutation = trpc.budget.setPaydaySchedulePrimary
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockDeletePaydayScheduleUseMutation = trpc.budget.deletePaydaySchedule
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockDeleteBudgetLineUseMutation = trpc.budget.deleteBudgetLine
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockUseUtils = trpc.useUtils as unknown as jest.Mock<{
  budget: {
    paydaySchedules: { invalidate: jest.Mock };
    budgetLines: { invalidate: jest.Mock };
  };
  ledger: {
    subEnvelopeBalance: { invalidate: jest.Mock };
    transactions: { invalidate: jest.Mock };
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
    isSuccess: false,
    isError: false,
    reset: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockAccountsUseQuery.mockReturnValue(success([]));
  mockApplyBudgetLineUseMutation.mockReturnValue(mockMutationResult());
  mockCreatePaydayScheduleUseMutation.mockReturnValue(mockMutationResult());
  mockCreateBudgetLineUseMutation.mockReturnValue(mockMutationResult());
  mockUpdatePaydayScheduleUseMutation.mockReturnValue(mockMutationResult());
  mockUpdateBudgetLineUseMutation.mockReturnValue(mockMutationResult());
  mockSetPaydaySchedulePrimaryUseMutation.mockReturnValue(mockMutationResult());
  mockDeletePaydayScheduleUseMutation.mockReturnValue(mockMutationResult());
  mockDeleteBudgetLineUseMutation.mockReturnValue(mockMutationResult());
  mockUseUtils.mockReturnValue({
    budget: {
      paydaySchedules: { invalidate: jest.fn() },
      budgetLines: { invalidate: jest.fn() },
    },
    ledger: {
      subEnvelopeBalance: { invalidate: jest.fn() },
      transactions: { invalidate: jest.fn() },
    },
  });
});

afterEach(() => {
  mockPaydaySchedulesUseQuery.mockReset();
  mockBudgetLinesUseQuery.mockReset();
  mockSubEnvelopesUseQuery.mockReset();
  mockAccountsUseQuery.mockReset();
  mockApplyBudgetLineUseMutation.mockReset();
  mockCreatePaydayScheduleUseMutation.mockReset();
  mockCreateBudgetLineUseMutation.mockReset();
  mockUpdatePaydayScheduleUseMutation.mockReset();
  mockUpdateBudgetLineUseMutation.mockReset();
  mockSetPaydaySchedulePrimaryUseMutation.mockReset();
  mockDeletePaydayScheduleUseMutation.mockReset();
  mockDeleteBudgetLineUseMutation.mockReset();
  mockUseUtils.mockReset();
});

describe("BudgetScreen loading state", () => {
  it("renders Loading… while paydaySchedules is pending", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(pending());
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));

    const { getByText } = await render(<BudgetScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });

  it("renders Loading… while budgetLines is pending (not paydaySchedules)", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(pending());
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));

    const { getByText } = await render(<BudgetScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });

  it("renders Loading… while subEnvelopes is pending (not paydaySchedules/budgetLines)", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(pending());

    const { getByText } = await render(<BudgetScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });

  it("renders Loading… while accounts is pending (not the other queries)", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(pending());

    const { getByText } = await render(<BudgetScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });
});

describe("BudgetScreen error state", () => {
  it("renders an error message when paydaySchedules errors", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(errored());
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));

    const { getByText } = await render(<BudgetScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });

  it("renders an error message when budgetLines errors (not paydaySchedules)", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(errored());
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));

    const { getByText } = await render(<BudgetScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });

  it("renders an error message when subEnvelopes errors (not paydaySchedules/budgetLines)", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(errored());

    const { getByText } = await render(<BudgetScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });

  it("renders an error message when accounts errors (not the other queries)", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(errored());

    const { getByText } = await render(<BudgetScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });
});

const salarySchedule: PaydaySchedule = createPaydaySchedule({
  id: paydayScheduleIdFromString("sched-1"),
  name: "Salary",
  paydayDaysOfMonth: [15],
});

const groceriesFund: SubEnvelope = createSubEnvelope({
  id: subEnvelopeIdFromString("sub-1"),
  name: "Groceries Fund",
  groupId: envelopeGroupIdFromString("grp-1"),
  accountIds: [accountIdFromString("acc-1")],
});

const groceriesLine: BudgetLine = createBudgetLine({
  id: budgetLineIdFromString("line-1"),
  budgetPeriod: budgetPeriodContaining(ledgerDateFromString("2024-06-15")),
  paydayDate: ledgerDateFromString("2024-06-15"),
  subEnvelopeId: groceriesFund.id,
  amount: centsFromInt(500000),
  description: "June groceries allocation",
});

describe("BudgetScreen success state", () => {
  it("renders payday schedule days, the resolved sub-envelope name, description, date, and amount", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));

    const { getByText } = await render(<BudgetScreen />);

    expect(getByText("Budget")).toBeTruthy();
    expect(getByText("Salary — payday on day 15")).toBeTruthy();
    expect(getByText("Groceries Fund")).toBeTruthy();
    expect(getByText("June groceries allocation")).toBeTruthy();
    expect(getByText(groceriesLine.paydayDate)).toBeTruthy();
    expect(getByText(formatCents(groceriesLine.amount))).toBeTruthy();
  });

  it("falls back to the raw subEnvelopeId when no sub-envelope matches", async () => {
    const orphanLine: BudgetLine = createBudgetLine({
      id: budgetLineIdFromString("line-2"),
      budgetPeriod: budgetPeriodContaining(ledgerDateFromString("2024-06-15")),
      paydayDate: ledgerDateFromString("2024-06-15"),
      subEnvelopeId: subEnvelopeIdFromString("sub-unknown"),
      amount: centsFromInt(10000),
      description: "Unmatched allocation",
    });
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([orphanLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));

    const { getByText } = await render(<BudgetScreen />);

    expect(getByText("sub-unknown")).toBeTruthy();
    expect(getByText("Unmatched allocation")).toBeTruthy();
  });
});

const accountA: Account = createAccount({
  id: accountIdFromString("acc-1"),
  name: "Checking",
  currency: currencyCodeFromString("USD"),
});

const accountB: Account = createAccount({
  id: accountIdFromString("acc-2"),
  name: "Savings",
  currency: currencyCodeFromString("USD"),
});

const twoAccountFund: SubEnvelope = createSubEnvelope({
  id: subEnvelopeIdFromString("sub-2"),
  name: "Shared Fund",
  groupId: envelopeGroupIdFromString("grp-1"),
  accountIds: [accountA.id, accountB.id],
});

const twoAccountLine: BudgetLine = createBudgetLine({
  id: budgetLineIdFromString("line-3"),
  budgetPeriod: budgetPeriodContaining(ledgerDateFromString("2024-06-15")),
  paydayDate: ledgerDateFromString("2024-06-15"),
  subEnvelopeId: twoAccountFund.id,
  amount: centsFromInt(20000),
  description: "Shared allocation",
});

// Built as a plain object literal, not via `createSubEnvelope`, because that
// factory rejects an empty `accountIds` — but a real-world sub-envelope with
// no linked accounts (not yet configured) is exactly the zero-candidate-
// account case this component must handle.
const zeroAccountFund: SubEnvelope = {
  id: subEnvelopeIdFromString("sub-3"),
  name: "Unlinked Fund",
  groupId: envelopeGroupIdFromString("grp-1"),
  accountIds: [],
  isArchived: false,
};

const zeroAccountLine: BudgetLine = createBudgetLine({
  id: budgetLineIdFromString("line-4"),
  budgetPeriod: budgetPeriodContaining(ledgerDateFromString("2024-06-15")),
  paydayDate: ledgerDateFromString("2024-06-15"),
  subEnvelopeId: zeroAccountFund.id,
  amount: centsFromInt(30000),
  description: "Unlinked allocation",
});

describe("BudgetLineApplyControls with a single candidate account", () => {
  it("mutates immediately with that account on Apply, without showing a picker", async () => {
    const mutate = jest.fn();
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));
    mockApplyBudgetLineUseMutation.mockReturnValue(mockMutationResult({ mutate }));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Apply"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      budgetLineId: groceriesLine.id,
      accountId: accountA.id,
    });
    expect(screen.queryByText(accountA.name)).toBeNull();
  });
});

describe("BudgetLineApplyControls with multiple candidate accounts", () => {
  it("reveals a picker of account names on Apply, then mutates with the tapped account", async () => {
    const mutate = jest.fn();
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([twoAccountLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([twoAccountFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA, accountB]));
    mockApplyBudgetLineUseMutation.mockReturnValue(mockMutationResult({ mutate }));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Apply"));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(accountA.name)).toBeTruthy();
    expect(screen.getByText(accountB.name)).toBeTruthy();

    await fireEvent.press(screen.getByText(accountB.name));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      budgetLineId: twoAccountLine.id,
      accountId: accountB.id,
    });
  });
});

describe("BudgetLineApplyControls with no candidate accounts", () => {
  it("disables the Apply button", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([zeroAccountLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([zeroAccountFund]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);

    expect(screen.getByText("Apply")).toBeDisabled();
  });
});

describe("BudgetLineApplyControls mutation status states", () => {
  // The old transient "Applied ✓" success text was removed: a successful
  // apply now relies entirely on the `budget.budgetLines` query refetch
  // (via the new invalidation, asserted separately below) to transition the
  // row into the persistent "Applied" label rendered from `isApplied`, not
  // from the mutation's own `isSuccess` flag. This guards against that
  // transient text reappearing as a regression.
  it("does not render a transient success label even when the mutation reports isSuccess", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));
    mockApplyBudgetLineUseMutation.mockReturnValue(
      mockMutationResult({ isSuccess: true }),
    );

    await render(<BudgetScreen />);

    expect(screen.queryByText("Applied ✓")).toBeNull();
  });

  it("renders an inline error message on error", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));
    mockApplyBudgetLineUseMutation.mockReturnValue(
      mockMutationResult({ isError: true }),
    );

    await render(<BudgetScreen />);

    expect(screen.getByText("Couldn't apply — try again.")).toBeTruthy();
  });

  it("invalidates budget.budgetLines (plus subEnvelopeBalance/transactions) on a successful apply", async () => {
    const invalidateBudgetLines = jest.fn();
    const invalidateSubEnvelopeBalance = jest.fn();
    const invalidateTransactions = jest.fn();
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));
    mockUseUtils.mockReturnValue({
      budget: {
        paydaySchedules: { invalidate: jest.fn() },
        budgetLines: { invalidate: invalidateBudgetLines },
      },
      ledger: {
        subEnvelopeBalance: { invalidate: invalidateSubEnvelopeBalance },
        transactions: { invalidate: invalidateTransactions },
      },
    });

    await render(<BudgetScreen />);

    // The component's `onSuccess` callback is passed straight to the mocked
    // `useMutation`, which never invokes it on its own — capture it and
    // invoke it directly to verify what it does, the same way this mutation
    // would actually resolve in the app.
    const options = mockApplyBudgetLineUseMutation.mock.calls[0]?.[0] as {
      onSuccess: () => void;
    };
    options.onSuccess();

    expect(invalidateBudgetLines).toHaveBeenCalledTimes(1);
    expect(invalidateSubEnvelopeBalance).toHaveBeenCalledTimes(1);
    expect(invalidateTransactions).toHaveBeenCalledTimes(1);
  });
});

describe("BudgetLineApplyControls when the budget line is already applied", () => {
  it("renders a persistent Applied label with no Apply button (single-candidate-account case)", async () => {
    const appliedLine = markBudgetLineApplied(groceriesLine);
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([appliedLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));

    await render(<BudgetScreen />);

    expect(screen.getByText("Applied")).toBeTruthy();
    expect(screen.queryByText("Apply")).toBeNull();
    expect(screen.queryByText(accountA.name)).toBeNull();
  });

  it("renders a persistent Applied label with no account picker (multi-candidate-account case)", async () => {
    const appliedLine = markBudgetLineApplied(twoAccountLine);
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([appliedLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([twoAccountFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA, accountB]));

    await render(<BudgetScreen />);

    expect(screen.getByText("Applied")).toBeTruthy();
    expect(screen.queryByText("Apply")).toBeNull();
    expect(screen.queryByText(accountA.name)).toBeNull();
    expect(screen.queryByText(accountB.name)).toBeNull();
  });
});

describe("BudgetLineApplyControls isApplied survives a fresh mount", () => {
  it("shows the persisted Applied label on the very first render, not a fresh Apply button — proving the state is read from the query, not a mutation's local isSuccess (this is what makes it survive navigating away from the tab and back)", async () => {
    const appliedLine = markBudgetLineApplied(groceriesLine);
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([appliedLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));
    // Note: no mutation was fired in this test at all — isSuccess/isPending
    // are both left at their default `false`, matching a fresh screen mount
    // (e.g. from navigating back to the tab) with no in-flight interaction.

    await render(<BudgetScreen />);

    expect(screen.getByText("Applied")).toBeTruthy();
    expect(screen.queryByText("Apply")).toBeNull();
  });
});

/** Renders `BudgetScreen` with an otherwise-empty, successful set of queries —
 * the baseline every "+ Add" form test below starts from, mirroring
 * `envelopes.test.tsx`'s `mockEmptyEnvelopesScreen` helper. */
function mockEmptyBudgetScreen() {
  mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
  mockBudgetLinesUseQuery.mockReturnValue(success([]));
  mockSubEnvelopesUseQuery.mockReturnValue(success([]));
  mockAccountsUseQuery.mockReturnValue(success([]));
}

describe("AddPaydayScheduleForm collapsed state", () => {
  it("does not show the name/days inputs before + Add payday schedule is tapped", async () => {
    mockEmptyBudgetScreen();

    await render(<BudgetScreen />);

    expect(screen.getByText("+ Add payday schedule")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Name")).toBeNull();
  });

  it("reveals the name/days inputs and Cancel/Save buttons on tap", async () => {
    mockEmptyBudgetScreen();

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("+ Add payday schedule"));

    expect(screen.getByPlaceholderText("Name")).toBeTruthy();
    expect(screen.getByPlaceholderText("Payday day of month (1-31)")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
  });
});

describe("AddPaydayScheduleForm save validation", () => {
  it("disables Save until both name and at least one valid 1-31 day are entered", async () => {
    mockEmptyBudgetScreen();

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("+ Add payday schedule"));

    expect(screen.getByText("Save")).toBeDisabled();

    await fireEvent.changeText(screen.getByPlaceholderText("Name"), "Monthly");
    expect(screen.getByText("Save")).toBeDisabled();

    // Out-of-range day (32) keeps Save disabled even with a name entered.
    await fireEvent.changeText(
      screen.getByPlaceholderText("Payday day of month (1-31)"),
      "32",
    );
    expect(screen.getByText("Save")).toBeDisabled();

    await fireEvent.changeText(screen.getByPlaceholderText("Payday day of month (1-31)"), "15");
    expect(screen.getByText("Save")).toBeEnabled();
  });
});

describe("AddPaydayScheduleForm submission", () => {
  it("calls createPaydaySchedule.mutate with the trimmed name and parsed paydayDaysOfMonth", async () => {
    const mutate = jest.fn();
    mockCreatePaydayScheduleUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockEmptyBudgetScreen();

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("+ Add payday schedule"));
    await fireEvent.changeText(screen.getByPlaceholderText("Name"), "  Monthly  ");
    await fireEvent.changeText(screen.getByPlaceholderText("Payday day of month (1-31)"), "15");
    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ name: "Monthly", paydayDaysOfMonth: [15] });
  });
});

describe("AddPaydayScheduleForm mutation error state", () => {
  it("shows the inline error message when the mutation errors", async () => {
    mockCreatePaydayScheduleUseMutation.mockReturnValue(mockMutationResult({ isError: true }));
    mockEmptyBudgetScreen();

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("+ Add payday schedule"));

    expect(screen.getByText("Couldn't save — try again.")).toBeTruthy();
  });
});

describe("AddBudgetLineForm collapsed state", () => {
  it("does not show the form fields before + Add budget line is tapped", async () => {
    mockEmptyBudgetScreen();

    await render(<BudgetScreen />);

    expect(screen.getByText("+ Add budget line")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Description")).toBeNull();
  });

  it("reveals the payday schedule/date/sub-envelope picker/description/amount fields on tap", async () => {
    mockEmptyBudgetScreen();

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("+ Add budget line"));

    expect(screen.getByText("Payday schedule: Choose schedule ▾")).toBeTruthy();
    expect(screen.getByText("Payday: Choose date ▾")).toBeTruthy();
    expect(screen.getByText("Sub-envelope: Choose sub-envelope ▾")).toBeTruthy();
    expect(screen.getByPlaceholderText("Description")).toBeTruthy();
    expect(screen.getByPlaceholderText("Amount")).toBeTruthy();
  });
});

describe("AddBudgetLineForm sub-envelope picker", () => {
  it("lists every unarchived sub-envelope on toggle, and updates the label on pick", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund, twoAccountFund]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("+ Add budget line"));
    await fireEvent.press(screen.getByText("Sub-envelope: Choose sub-envelope ▾"));

    expect(screen.getByText(groceriesFund.name)).toBeTruthy();
    expect(screen.getByText(twoAccountFund.name)).toBeTruthy();

    await fireEvent.press(screen.getByText(twoAccountFund.name));

    expect(screen.getByText(`Sub-envelope: ${twoAccountFund.name} ▾`)).toBeTruthy();
  });
});

// `candidatePaydayDates` (behind the "+ Add budget line" payday picker) derives
// "this month"/"next month" from the real system clock, so every test below that
// picks or asserts on a specific date pins the clock — mirroring `index.test.tsx`'s
// own `PINNED_TODAY`/fake-timer setup for its date-dependent daily-allowance test.
const PINNED_TODAY = "2026-09-01";

/** Narrows `values[0]` to non-`undefined` for test setup, failing fast with a clear
 * message instead of silently proceeding with `undefined` if a fixture schedule
 * unexpectedly has no computed payday in the pinned month. */
function firstOrThrow<T>(values: readonly T[]): T {
  const [first] = values;
  if (first === undefined) {
    throw new Error("firstOrThrow: expected at least one value");
  }
  return first;
}

describe("AddBudgetLineForm payday picker (pinned system clock)", () => {
  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: false });
    jest.setSystemTime(new Date(`${PINNED_TODAY}T12:00:00.000Z`));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("lists every payday schedule on toggle, and disables the date picker until one is picked", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("+ Add budget line"));

    expect(screen.getByText("Payday: Choose date ▾")).toBeDisabled();

    await fireEvent.press(screen.getByText("Payday schedule: Choose schedule ▾"));
    expect(screen.getByText(salarySchedule.name)).toBeTruthy();

    await fireEvent.press(screen.getByText(salarySchedule.name));

    expect(screen.getByText(`Payday schedule: ${salarySchedule.name} ▾`)).toBeTruthy();
    expect(screen.getByText("Payday: Choose date ▾")).toBeEnabled();
  });

  it("offers this month's and next month's actual computed payday dates for the picked schedule, and updates the label on pick", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("+ Add budget line"));
    await fireEvent.press(screen.getByText("Payday schedule: Choose schedule ▾"));
    await fireEvent.press(screen.getByText(salarySchedule.name));
    await fireEvent.press(screen.getByText("Payday: Choose date ▾"));

    const septemberDates = paydaysInMonth(salarySchedule, 2026, 9);
    const octoberDates = paydaysInMonth(salarySchedule, 2026, 10);
    for (const date of [...septemberDates, ...octoberDates]) {
      expect(screen.getByText(date)).toBeTruthy();
    }

    const septemberFirst = firstOrThrow(septemberDates);
    await fireEvent.press(screen.getByText(septemberFirst));

    expect(screen.getByText(`Payday: ${septemberFirst} ▾`)).toBeTruthy();
  });
});

describe("AddBudgetLineForm payday picker reset (pinned system clock)", () => {
  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: false });
    jest.setSystemTime(new Date(`${PINNED_TODAY}T12:00:00.000Z`));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("resets the picked date when a different schedule is picked", async () => {
    const otherSchedule = createPaydaySchedule({
      id: paydayScheduleIdFromString("sched-2"),
      name: "Freelance",
      paydayDaysOfMonth: [1],
    });
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule, otherSchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("+ Add budget line"));
    await fireEvent.press(screen.getByText("Payday schedule: Choose schedule ▾"));
    await fireEvent.press(screen.getByText(salarySchedule.name));
    await fireEvent.press(screen.getByText("Payday: Choose date ▾"));
    const septemberFirst = firstOrThrow(paydaysInMonth(salarySchedule, 2026, 9));
    await fireEvent.press(screen.getByText(septemberFirst));
    expect(screen.getByText(`Payday: ${septemberFirst} ▾`)).toBeTruthy();

    await fireEvent.press(screen.getByText(`Payday schedule: ${salarySchedule.name} ▾`));
    await fireEvent.press(screen.getByText(otherSchedule.name));

    expect(screen.getByText("Payday: Choose date ▾")).toBeTruthy();
  });
});

describe("AddBudgetLineForm save validation (pinned system clock)", () => {
  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: false });
    jest.setSystemTime(new Date(`${PINNED_TODAY}T12:00:00.000Z`));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("disables Save until payday schedule+date, sub-envelope, positive amount, and description are all provided", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("+ Add budget line"));

    expect(screen.getByText("Save")).toBeDisabled();

    await fireEvent.changeText(screen.getByPlaceholderText("Description"), "September groceries");
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "0.00");
    expect(screen.getByText("Save")).toBeDisabled();

    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "300.00");
    expect(screen.getByText("Save")).toBeDisabled();

    await fireEvent.press(screen.getByText("Sub-envelope: Choose sub-envelope ▾"));
    await fireEvent.press(screen.getByText(groceriesFund.name));
    expect(screen.getByText("Save")).toBeDisabled();

    await fireEvent.press(screen.getByText("Payday schedule: Choose schedule ▾"));
    await fireEvent.press(screen.getByText(salarySchedule.name));
    expect(screen.getByText("Save")).toBeDisabled();

    await fireEvent.press(screen.getByText("Payday: Choose date ▾"));
    const septemberFirst = firstOrThrow(paydaysInMonth(salarySchedule, 2026, 9));
    await fireEvent.press(screen.getByText(septemberFirst));
    expect(screen.getByText("Save")).toBeEnabled();
  });
});

describe("AddBudgetLineForm submission (pinned system clock)", () => {
  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: false });
    jest.setSystemTime(new Date(`${PINNED_TODAY}T12:00:00.000Z`));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("calls createBudgetLine.mutate with the picked payday date, trimmed description, the picked subEnvelopeId, and the amount unnegated", async () => {
    const mutate = jest.fn();
    mockCreateBudgetLineUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("+ Add budget line"));
    await fireEvent.press(screen.getByText("Payday schedule: Choose schedule ▾"));
    await fireEvent.press(screen.getByText(salarySchedule.name));
    await fireEvent.press(screen.getByText("Payday: Choose date ▾"));
    const septemberFirst = firstOrThrow(paydaysInMonth(salarySchedule, 2026, 9));
    await fireEvent.press(screen.getByText(septemberFirst));
    await fireEvent.press(screen.getByText("Sub-envelope: Choose sub-envelope ▾"));
    await fireEvent.press(screen.getByText(groceriesFund.name));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Description"),
      "  September groceries  ",
    );
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "300.00");
    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      paydayDate: septemberFirst,
      subEnvelopeId: groceriesFund.id,
      amount: "300.00",
      description: "September groceries",
    });
  });
});

describe("AddBudgetLineForm mutation error state", () => {
  it("shows the inline error message when the mutation errors", async () => {
    mockCreateBudgetLineUseMutation.mockReturnValue(mockMutationResult({ isError: true }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("+ Add budget line"));

    expect(screen.getByText("Couldn't save — try again.")).toBeTruthy();
  });
});

describe("PaydayScheduleRow edit — collapsed state", () => {
  it("does not show the name/days inputs before Edit is tapped", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);

    expect(screen.getByText("Salary — payday on day 15")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Name")).toBeNull();
  });

  it("reveals pre-filled name/days inputs on tap", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Edit"));

    expect(screen.getByPlaceholderText("Name").props["value"]).toBe("Salary");
    expect(screen.getByPlaceholderText("Payday day of month (1-31)").props["value"]).toBe("15");
  });
});

describe("PaydayScheduleRow edit — cancel", () => {
  it("reverts uncommitted changes and exits edit mode on Cancel, without calling the mutation", async () => {
    const mutate = jest.fn();
    mockUpdatePaydayScheduleUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Edit"));
    await fireEvent.changeText(screen.getByPlaceholderText("Name"), "Renamed");
    await fireEvent.press(screen.getByText("Cancel"));

    expect(screen.getByText("Salary — payday on day 15")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Name")).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe("PaydayScheduleRow edit — save", () => {
  it("calls updatePaydaySchedule.mutate with the id, trimmed name, and parsed days", async () => {
    const mutate = jest.fn();
    mockUpdatePaydayScheduleUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Edit"));
    await fireEvent.changeText(screen.getByPlaceholderText("Name"), "  Renamed  ");
    await fireEvent.changeText(screen.getByPlaceholderText("Payday day of month (1-31)"), "1");
    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      id: salarySchedule.id,
      name: "Renamed",
      paydayDaysOfMonth: [1],
    });
  });

  it("shows the inline error message when the mutation errors", async () => {
    mockUpdatePaydayScheduleUseMutation.mockReturnValue(mockMutationResult({ isError: true }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Edit"));

    expect(screen.getByText("Couldn't save — try again.")).toBeTruthy();
  });
});

describe("BudgetLineRow edit — visibility", () => {
  it("shows an Edit control for a not-yet-applied line", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));

    await render(<BudgetScreen />);

    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it("hides the Edit control for an already-applied line", async () => {
    const appliedLine = markBudgetLineApplied(groceriesLine);
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([appliedLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));

    await render(<BudgetScreen />);

    expect(screen.queryByText("Edit")).toBeNull();
  });
});

describe("BudgetLineRow edit — reveal pre-filled fields", () => {
  it("reveals pre-filled payday date/sub-envelope/description/amount on tap", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Edit"));

    expect(screen.getByPlaceholderText("Payday date (YYYY-MM-DD)").props["value"]).toBe(
      "2024-06-15",
    );
    expect(screen.getByText(`Sub-envelope: ${groceriesFund.name} ▾`)).toBeTruthy();
    expect(screen.getByPlaceholderText("Description").props["value"]).toBe(
      "June groceries allocation",
    );
    expect(screen.getByPlaceholderText("Amount").props["value"]).toBe("5000.00");
  });
});

describe("BudgetLineRow edit — cancel", () => {
  it("reverts uncommitted changes and exits edit mode on Cancel, without calling the mutation", async () => {
    const mutate = jest.fn();
    mockUpdateBudgetLineUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Edit"));
    await fireEvent.changeText(screen.getByPlaceholderText("Description"), "Changed");
    await fireEvent.press(screen.getByText("Cancel"));

    expect(screen.getByText("June groceries allocation")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Description")).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe("BudgetLineRow edit — save", () => {
  it("calls updateBudgetLine.mutate with id, trimmed fields, unchanged subEnvelopeId, and the amount as a formatted decimal string", async () => {
    const mutate = jest.fn();
    mockUpdateBudgetLineUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Edit"));
    await fireEvent.changeText(screen.getByPlaceholderText("Description"), "  Updated groceries  ");
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "600.00");
    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      id: groceriesLine.id,
      paydayDate: "2024-06-15",
      subEnvelopeId: groceriesFund.id,
      amount: "600.00",
      description: "Updated groceries",
    });
  });

  it("shows the inline error message when the mutation errors", async () => {
    mockUpdateBudgetLineUseMutation.mockReturnValue(mockMutationResult({ isError: true }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Edit"));

    expect(screen.getByText("Couldn't save — try again.")).toBeTruthy();
  });
});

describe("PaydayScheduleRow delete flow", () => {
  it("tapping Delete reveals the confirmation without calling deletePaydaySchedule.mutate", async () => {
    const mutate = jest.fn();
    mockDeletePaydayScheduleUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Delete"));

    expect(screen.getByText("Delete this payday schedule?")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("Confirm")).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("tapping Cancel in the confirmation dismisses it without calling deletePaydaySchedule.mutate", async () => {
    const mutate = jest.fn();
    mockDeletePaydayScheduleUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Delete"));
    await fireEvent.press(screen.getByText("Cancel"));

    expect(screen.queryByText("Delete this payday schedule?")).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("tapping Confirm calls deletePaydaySchedule.mutate with the schedule's id", async () => {
    const mutate = jest.fn();
    mockDeletePaydayScheduleUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Delete"));
    await fireEvent.press(screen.getByText("Confirm"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ id: salarySchedule.id });
  });

  it("shows the generic error message when the delete mutation errors", async () => {
    mockDeletePaydayScheduleUseMutation.mockReturnValue(mockMutationResult({ isError: true }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);

    expect(screen.getByText("Couldn't delete — try again.")).toBeTruthy();
  });
});

describe("BudgetLineRow delete control visibility", () => {
  it("shows a Delete control for a not-yet-applied line", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));

    await render(<BudgetScreen />);

    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("shows a Delete control for an already-applied line too (unlike Edit, delete is never gated on isApplied)", async () => {
    const appliedLine = markBudgetLineApplied(groceriesLine);
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([appliedLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));

    await render(<BudgetScreen />);

    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.getByText("Delete")).toBeTruthy();
  });
});

describe("BudgetLineRow delete flow", () => {
  it("tapping Delete reveals the confirmation without calling deleteBudgetLine.mutate", async () => {
    const mutate = jest.fn();
    mockDeleteBudgetLineUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Delete"));

    expect(screen.getByText("Delete this budget line?")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("Confirm")).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("tapping Cancel in the confirmation dismisses it without calling deleteBudgetLine.mutate", async () => {
    const mutate = jest.fn();
    mockDeleteBudgetLineUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Delete"));
    await fireEvent.press(screen.getByText("Cancel"));

    expect(screen.queryByText("Delete this budget line?")).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("tapping Confirm calls deleteBudgetLine.mutate with the line's id", async () => {
    const mutate = jest.fn();
    mockDeleteBudgetLineUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Delete"));
    await fireEvent.press(screen.getByText("Confirm"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ id: groceriesLine.id });
  });

  it("shows the generic error message when the delete mutation errors", async () => {
    mockDeleteBudgetLineUseMutation.mockReturnValue(mockMutationResult({ isError: true }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));

    await render(<BudgetScreen />);

    expect(screen.getByText("Couldn't delete — try again.")).toBeTruthy();
  });
});

describe("PaydayScheduleRow set-primary control visibility", () => {
  it("shows a 'Set primary' control and no '(primary)' suffix for a non-primary schedule", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);

    expect(screen.getByText("Set primary")).toBeTruthy();
    expect(screen.getByText("Salary — payday on day 15")).toBeTruthy();
  });

  it("hides the 'Set primary' control and adds a '(primary)' suffix for the primary schedule", async () => {
    const primarySchedule = markPaydaySchedulePrimary(salarySchedule);
    mockPaydaySchedulesUseQuery.mockReturnValue(success([primarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);

    expect(screen.queryByText("Set primary")).toBeNull();
    expect(screen.getByText("Salary — payday on day 15 (primary)")).toBeTruthy();
  });
});

describe("PaydayScheduleRow set-primary flow", () => {
  it("tapping 'Set primary' calls setPaydaySchedulePrimary.mutate with the schedule's id", async () => {
    const mutate = jest.fn();
    mockSetPaydaySchedulePrimaryUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);
    await fireEvent.press(screen.getByText("Set primary"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ id: salarySchedule.id });
  });

  it("shows the generic error message when the mutation errors", async () => {
    mockSetPaydaySchedulePrimaryUseMutation.mockReturnValue(mockMutationResult({ isError: true }));
    mockPaydaySchedulesUseQuery.mockReturnValue(success([salarySchedule]));
    mockBudgetLinesUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockAccountsUseQuery.mockReturnValue(success([]));

    await render(<BudgetScreen />);

    expect(screen.getByText("Couldn't update — try again.")).toBeTruthy();
  });
});
