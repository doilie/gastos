import { render } from "@testing-library/react-native";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    budget: {
      paydaySchedules: {
        useQuery: jest.fn(),
      },
      budgetLines: {
        useQuery: jest.fn(),
      },
    },
    reference: {
      subEnvelopes: {
        useQuery: jest.fn(),
      },
    },
  },
}));

import {
  type BudgetLine,
  type PaydaySchedule,
  type SubEnvelope,
  accountIdFromString,
  budgetLineIdFromString,
  budgetPeriodContaining,
  centsFromInt,
  createBudgetLine,
  createPaydaySchedule,
  createSubEnvelope,
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

const mockPaydaySchedulesUseQuery = trpc.budget.paydaySchedules
  .useQuery as unknown as jest.Mock<MockQueryResult<PaydaySchedule[]>>;
const mockBudgetLinesUseQuery = trpc.budget.budgetLines
  .useQuery as unknown as jest.Mock<MockQueryResult<BudgetLine[]>>;
const mockSubEnvelopesUseQuery = trpc.reference.subEnvelopes
  .useQuery as unknown as jest.Mock<MockQueryResult<SubEnvelope[]>>;

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

afterEach(() => {
  mockPaydaySchedulesUseQuery.mockReset();
  mockBudgetLinesUseQuery.mockReset();
  mockSubEnvelopesUseQuery.mockReset();
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
