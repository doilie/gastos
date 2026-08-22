import { render } from "@testing-library/react-native";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    reference: {
      accounts: {
        useQuery: jest.fn(),
      },
      categories: {
        useQuery: jest.fn(),
      },
    },
  },
}));

import {
  type Account,
  type Category,
  accountIdFromString,
  categoryIdFromString,
  createAccount,
  createCategory,
  currencyCodeFromString,
} from "@gastos/shared";

import { trpc } from "../../lib/trpc";
import MoreScreen from "./more";

// The component only reads `isPending`, `isError`, and `data` off each query
// result, so the mocks only need to supply those fields — not full
// `UseTRPCQueryResult` shapes (same approach as envelopes.test.tsx/
// budget.test.tsx).
interface MockQueryResult<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}

const mockAccountsUseQuery = trpc.reference.accounts
  .useQuery as unknown as jest.Mock<MockQueryResult<Account[]>>;
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
  mockAccountsUseQuery.mockReset();
  mockCategoriesUseQuery.mockReset();
});

describe("MoreScreen loading state", () => {
  it("renders Loading… while accounts is pending", async () => {
    mockAccountsUseQuery.mockReturnValue(pending());
    mockCategoriesUseQuery.mockReturnValue(success([]));

    const { getByText } = await render(<MoreScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });

  it("renders Loading… while categories is pending (not accounts)", async () => {
    mockAccountsUseQuery.mockReturnValue(success([]));
    mockCategoriesUseQuery.mockReturnValue(pending());

    const { getByText } = await render(<MoreScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });
});

describe("MoreScreen error state", () => {
  it("renders an error message when accounts errors", async () => {
    mockAccountsUseQuery.mockReturnValue(errored());
    mockCategoriesUseQuery.mockReturnValue(success([]));

    const { getByText } = await render(<MoreScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });

  it("renders an error message when categories errors (not accounts)", async () => {
    mockAccountsUseQuery.mockReturnValue(success([]));
    mockCategoriesUseQuery.mockReturnValue(errored());

    const { getByText } = await render(<MoreScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });
});

const checking: Account = createAccount({
  id: accountIdFromString("acc-1"),
  name: "Checking",
  currency: currencyCodeFromString("USD"),
});

const savings: Account = createAccount({
  id: accountIdFromString("acc-2"),
  name: "Savings",
  currency: currencyCodeFromString("EUR"),
});

const salaryCategory: Category = createCategory({
  id: categoryIdFromString("cat-1"),
  name: "Salary",
  isIncome: true,
});

const groceriesCategory: Category = createCategory({
  id: categoryIdFromString("cat-2"),
  name: "Groceries",
  isIncome: false,
});

describe("MoreScreen success state", () => {
  it("renders account names/currencies and category names, flagging income categories inline", async () => {
    mockAccountsUseQuery.mockReturnValue(success([checking, savings]));
    mockCategoriesUseQuery.mockReturnValue(
      success([salaryCategory, groceriesCategory]),
    );

    const { getByText } = await render(<MoreScreen />);

    expect(getByText("More")).toBeTruthy();

    expect(getByText("Checking")).toBeTruthy();
    expect(getByText("USD")).toBeTruthy();
    expect(getByText("Savings")).toBeTruthy();
    expect(getByText("EUR")).toBeTruthy();

    expect(getByText("Salary (income)")).toBeTruthy();
    expect(getByText("Groceries")).toBeTruthy();
  });
});
