import { fireEvent, render } from "@testing-library/react-native";

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

// `reports.tsx` derives "the current calendar month" live via `new Date()`,
// both for `ReportsScreen`'s initial `period` state and for
// `MonthNavigation`'s Next-disabled check, so those are otherwise dependent
// on wall-clock time at test-run time. Pinning the system clock (mirroring
// cards.test.tsx's `PINNED_TODAY`/fake-timer setup for its near-identical
// cycle-navigation coverage) lets every navigation assertion below know
// exactly which month is "current". Pinned at UTC noon so nothing can roll
// to an adjacent day/month regardless of the host machine's timezone.
const PINNED_TODAY = "2024-06-15";

beforeAll(() => {
  jest.useFakeTimers({ advanceTimers: false });
  jest.setSystemTime(new Date(`${PINNED_TODAY}T12:00:00.000Z`));
});

afterAll(() => {
  jest.useRealTimers();
});

// A test below (the year-boundary case) pins the system clock to a
// different date mid-suite; reset back to `PINNED_TODAY` after every test so
// that override never leaks into a later, unrelated test.
afterEach(() => {
  jest.setSystemTime(new Date(`${PINNED_TODAY}T12:00:00.000Z`));
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

// Covers the Prev/Next month navigation added to `ReportsScreen`/
// `MonthNavigation` — the near-identical precedent is cards.test.tsx's
// "CardsScreen cycle navigation" describe block, adapted from billing-cycle
// dates to calendar year/month. `report.data`'s content (income/spending)
// doesn't vary by the displayed period in these tests — `ReportsScreen`
// renders `periodLabel` from its own local `period` state, not from
// `report.data.period` — so a single static mocked report is reused
// throughout and each test instead asserts on (a) the rendered label text
// and (b) the `{year, month}` args the mocked query hook was actually
// called with.
describe("ReportsScreen month navigation", () => {
  beforeEach(() => {
    mockCategorySpendingUseQuery.mockReturnValue(success(emptyReport));
    mockCategoriesUseQuery.mockReturnValue(success([]));
  });

  it("shows the current month by default, with Next disabled", async () => {
    const { getByText } = await render(<ReportsScreen />);

    expect(getByText("June 2024")).toBeTruthy();
    expect(getByText("Next ›")).toBeDisabled();
    expect(mockCategorySpendingUseQuery).toHaveBeenLastCalledWith({ year: 2024, month: 6 });
  });

  it("moves back one month on Prev, updating the label and re-querying with the new period", async () => {
    const { getByText } = await render(<ReportsScreen />);

    await fireEvent.press(getByText("‹ Prev"));

    expect(getByText("May 2024")).toBeTruthy();
    expect(mockCategorySpendingUseQuery).toHaveBeenLastCalledWith({ year: 2024, month: 5 });
    expect(getByText("Next ›")).not.toBeDisabled();
  });

  it("moves back across a year boundary correctly (January to December of the previous year)", async () => {
    jest.setSystemTime(new Date("2024-01-10T12:00:00.000Z"));

    const { getByText } = await render(<ReportsScreen />);
    expect(getByText("January 2024")).toBeTruthy();

    await fireEvent.press(getByText("‹ Prev"));

    expect(getByText("December 2023")).toBeTruthy();
    expect(mockCategorySpendingUseQuery).toHaveBeenLastCalledWith({ year: 2023, month: 12 });
  });

  it("returns to the current month on Next after one Prev, re-disabling Next", async () => {
    const { getByText } = await render(<ReportsScreen />);

    await fireEvent.press(getByText("‹ Prev"));
    await fireEvent.press(getByText("Next ›"));

    expect(getByText("June 2024")).toBeTruthy();
    expect(mockCategorySpendingUseQuery).toHaveBeenLastCalledWith({ year: 2024, month: 6 });
    expect(getByText("Next ›")).toBeDisabled();
  });

  it("moves back multiple months after multiple Prev taps in a row", async () => {
    const { getByText } = await render(<ReportsScreen />);

    await fireEvent.press(getByText("‹ Prev"));
    await fireEvent.press(getByText("‹ Prev"));
    await fireEvent.press(getByText("‹ Prev"));

    expect(getByText("March 2024")).toBeTruthy();
    expect(mockCategorySpendingUseQuery).toHaveBeenLastCalledWith({ year: 2024, month: 3 });
    expect(getByText("Next ›")).not.toBeDisabled();
  });
});
