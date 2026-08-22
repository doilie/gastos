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
const mockUseUtils = trpc.useUtils as unknown as jest.Mock<{
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
    ...overrides,
  };
}

beforeEach(() => {
  mockAccountsUseQuery.mockReturnValue(success([]));
  mockApplyBudgetLineUseMutation.mockReturnValue(mockMutationResult());
  mockUseUtils.mockReturnValue({
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
  paydayDaysOfMonth: [15, 31],
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
    expect(getByText("Salary — paydays on day 15, 31")).toBeTruthy();
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
  it("renders Applied ✓ on success", async () => {
    mockPaydaySchedulesUseQuery.mockReturnValue(success([]));
    mockBudgetLinesUseQuery.mockReturnValue(success([groceriesLine]));
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund]));
    mockAccountsUseQuery.mockReturnValue(success([accountA]));
    mockApplyBudgetLineUseMutation.mockReturnValue(
      mockMutationResult({ isSuccess: true }),
    );

    await render(<BudgetScreen />);

    expect(screen.getByText("Applied ✓")).toBeTruthy();
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
});
