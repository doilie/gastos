import { render } from "@testing-library/react-native";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    reporting: {
      categorySpending: {
        useQuery: jest.fn(),
      },
    },
    reference: {
      categories: {
        useQuery: jest.fn(),
      },
    },
  },
}));

import {
  type Category,
  type CategoryId,
  categoryIdFromString,
  centsFromInt,
  createCategory,
  formatCents,
} from "@gastos/shared";
// Type-only import of the report shape, mirroring lib/trpc.ts's own
// type-only `@gastos/server` import (`AppRouter`) — never pulls server
// runtime code into the mobile bundle.
import type { CategorySpendingReport } from "@gastos/server/src/reporting/category-spending";

import { trpc } from "../../lib/trpc";
import ReportsScreen from "./reports";

// The component only reads `isPending`, `isError`, and `data` off each query
// result, so the mocks only need to supply those fields — not full
// `UseTRPCQueryResult` shapes (same approach as more.test.tsx/budget.test.tsx).
interface MockQueryResult<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}

const mockCategorySpendingUseQuery = trpc.reporting.categorySpending
  .useQuery as unknown as jest.Mock<MockQueryResult<CategorySpendingReport>>;
const mockCategoriesUseQuery = trpc.reference.categories
  .useQuery as unknown as jest.Mock<MockQueryResult<Category[]>>;

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
  mockCategorySpendingUseQuery.mockReset();
  mockCategoriesUseQuery.mockReset();
});

describe("ReportsScreen loading state", () => {
  it("renders Loading… while categorySpending is pending", async () => {
    mockCategorySpendingUseQuery.mockReturnValue(pending());
    mockCategoriesUseQuery.mockReturnValue(success([]));

    const { getByText } = await render(<ReportsScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });

  it("renders Loading… while categories is pending (not categorySpending)", async () => {
    mockCategorySpendingUseQuery.mockReturnValue(success(emptyReport));
    mockCategoriesUseQuery.mockReturnValue(pending());

    const { getByText } = await render(<ReportsScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });
});

describe("ReportsScreen error state", () => {
  it("renders an error message when categorySpending errors", async () => {
    mockCategorySpendingUseQuery.mockReturnValue(errored());
    mockCategoriesUseQuery.mockReturnValue(success([]));

    const { getByText } = await render(<ReportsScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });

  it("renders an error message when categories errors (not categorySpending)", async () => {
    mockCategorySpendingUseQuery.mockReturnValue(success(emptyReport));
    mockCategoriesUseQuery.mockReturnValue(errored());

    const { getByText } = await render(<ReportsScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });
});

// `period` here is arbitrary, fixed test data — `ReportsScreen` renders
// `periodLabel` from `report.data.period` (this mocked value), not by
// re-deriving "today" itself, so there's no need to fake `Date`/`Date.now`
// to pin down what "today" is for these assertions.
const emptyReport: CategorySpendingReport = {
  period: { year: 2024, month: 6 },
  spendingByCategory: [],
  incomeTotal: centsFromInt(0),
};

const groceriesCategory: Category = createCategory({
  id: categoryIdFromString("cat-1"),
  name: "Groceries",
  isIncome: false,
});

const unknownCategoryId: CategoryId = categoryIdFromString("cat-unknown");

describe("ReportsScreen success state", () => {
  it("renders the title, formatted income, and resolved/fallback category rows", async () => {
    const report: CategorySpendingReport = {
      period: { year: 2024, month: 6 },
      spendingByCategory: [
        { categoryId: groceriesCategory.id, total: centsFromInt(-12345) },
        { categoryId: unknownCategoryId, total: centsFromInt(-6789) },
      ],
      incomeTotal: centsFromInt(500000),
    };
    mockCategorySpendingUseQuery.mockReturnValue(success(report));
    mockCategoriesUseQuery.mockReturnValue(success([groceriesCategory]));

    const { getByText, queryByText } = await render(<ReportsScreen />);

    expect(getByText("Reports")).toBeTruthy();
    expect(getByText(formatCents(report.incomeTotal))).toBeTruthy();

    expect(getByText(groceriesCategory.name)).toBeTruthy();
    expect(getByText(formatCents(centsFromInt(-12345)))).toBeTruthy();

    expect(getByText(unknownCategoryId)).toBeTruthy();
    expect(getByText(formatCents(centsFromInt(-6789)))).toBeTruthy();

    expect(queryByText("No spending recorded this month.")).toBeNull();
  });

  it("renders the empty-state message when spendingByCategory is empty", async () => {
    mockCategorySpendingUseQuery.mockReturnValue(success(emptyReport));
    mockCategoriesUseQuery.mockReturnValue(success([]));

    const { getByText } = await render(<ReportsScreen />);

    expect(getByText("No spending recorded this month.")).toBeTruthy();
  });
});
