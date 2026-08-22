import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    reference: {
      accounts: {
        useQuery: jest.fn(),
      },
      categories: {
        useQuery: jest.fn(),
      },
      createAccount: {
        useMutation: jest.fn(),
      },
      createCategory: {
        useMutation: jest.fn(),
      },
      updateAccount: {
        useMutation: jest.fn(),
      },
      updateCategory: {
        useMutation: jest.fn(),
      },
    },
    useUtils: jest.fn(),
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

// Mirrors QuickAddForm.test.tsx's `MockMutationResult` pattern: the
// component only reads `mutate`, `isPending`, and `isError` off the
// mutation result (plus calls `.reset()`).
interface MockMutationResult {
  mutate: jest.Mock;
  isPending: boolean;
  isError: boolean;
  reset: jest.Mock;
}

const mockCreateAccountUseMutation = trpc.reference.createAccount
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockCreateCategoryUseMutation = trpc.reference.createCategory
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockUpdateAccountUseMutation = trpc.reference.updateAccount
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockUpdateCategoryUseMutation = trpc.reference.updateCategory
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockUseUtils = trpc.useUtils as unknown as jest.Mock<{
  reference: {
    accounts: { invalidate: jest.Mock };
    categories: { invalidate: jest.Mock };
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

beforeEach(() => {
  mockCreateAccountUseMutation.mockReturnValue(mockMutationResult());
  mockCreateCategoryUseMutation.mockReturnValue(mockMutationResult());
  mockUpdateAccountUseMutation.mockReturnValue(mockMutationResult());
  mockUpdateCategoryUseMutation.mockReturnValue(mockMutationResult());
  mockUseUtils.mockReturnValue({
    reference: {
      accounts: { invalidate: jest.fn() },
      categories: { invalidate: jest.fn() },
    },
  });
});

afterEach(() => {
  mockAccountsUseQuery.mockReset();
  mockCategoriesUseQuery.mockReset();
  mockCreateAccountUseMutation.mockReset();
  mockCreateCategoryUseMutation.mockReset();
  mockUpdateAccountUseMutation.mockReset();
  mockUpdateCategoryUseMutation.mockReset();
  mockUseUtils.mockReset();
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

/** Renders `MoreScreen` in its success state with empty accounts/categories lists. */
async function renderMoreScreen(): Promise<void> {
  mockAccountsUseQuery.mockReturnValue(success([]));
  mockCategoriesUseQuery.mockReturnValue(success([]));
  await render(<MoreScreen />);
}

/**
 * Renders `MoreScreen` in its success state with the given accounts/categories.
 * Tests for `AccountRow`/`CategoryRow` mostly pass a single-item list for the
 * section under test (and an empty list for the other section) so that
 * "Edit"/"Name"/"Cancel"/"Save" queries stay unambiguous — the same
 * one-thing-open-at-a-time approach the add-form tests above already use.
 */
async function renderMoreScreenWithData(
  accounts: Account[],
  categories: Category[],
): Promise<void> {
  mockAccountsUseQuery.mockReturnValue(success(accounts));
  mockCategoriesUseQuery.mockReturnValue(success(categories));
  await render(<MoreScreen />);
}

describe("AddAccountForm collapsed state", () => {
  it("does not show the name/currency inputs before + Add account is tapped", async () => {
    await renderMoreScreen();

    expect(screen.getByText("+ Add account")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Name")).toBeNull();
    expect(screen.queryByPlaceholderText("Currency (e.g. USD)")).toBeNull();
  });

  it("reveals the name/currency inputs and Cancel/Save buttons on tap", async () => {
    await renderMoreScreen();

    await fireEvent.press(screen.getByText("+ Add account"));

    expect(screen.getByPlaceholderText("Name")).toBeTruthy();
    expect(screen.getByPlaceholderText("Currency (e.g. USD)")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
  });
});

describe("AddAccountForm save validation and submission", () => {
  it("disables Save when currency is not exactly 3 letters", async () => {
    await renderMoreScreen();
    await fireEvent.press(screen.getByText("+ Add account"));
    await fireEvent.changeText(screen.getByPlaceholderText("Name"), "Checking");

    await fireEvent.changeText(
      screen.getByPlaceholderText("Currency (e.g. USD)"),
      "US",
    );
    expect(screen.getByText("Save")).toBeDisabled();

    await fireEvent.changeText(
      screen.getByPlaceholderText("Currency (e.g. USD)"),
      "USDX",
    );
    expect(screen.getByText("Save")).toBeDisabled();
  });

  it("uppercases a lowercase-typed currency before submitting", async () => {
    const mutate = jest.fn();
    mockCreateAccountUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await renderMoreScreen();
    await fireEvent.press(screen.getByText("+ Add account"));

    await fireEvent.changeText(screen.getByPlaceholderText("Name"), "Wallet");
    await fireEvent.changeText(
      screen.getByPlaceholderText("Currency (e.g. USD)"),
      "php",
    );
    expect(screen.getByText("Save")).toBeEnabled();

    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ name: "Wallet", currency: "PHP" });
  });

  it("calls the mutation with the trimmed name and uppercased currency", async () => {
    const mutate = jest.fn();
    mockCreateAccountUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await renderMoreScreen();
    await fireEvent.press(screen.getByText("+ Add account"));

    await fireEvent.changeText(
      screen.getByPlaceholderText("Name"),
      "  Checking  ",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("Currency (e.g. USD)"),
      "USD",
    );
    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ name: "Checking", currency: "USD" });
  });
});

describe("AddAccountForm mutation status states", () => {
  it("shows Saving… and disables controls while the mutation is pending", async () => {
    mockCreateAccountUseMutation.mockReturnValue(
      mockMutationResult({ isPending: true }),
    );
    await renderMoreScreen();
    await fireEvent.press(screen.getByText("+ Add account"));

    expect(screen.getByText("Saving…")).toBeTruthy();
    expect(screen.queryByText("Save")).toBeNull();
    expect(screen.getByText("Saving…")).toBeDisabled();
    expect(screen.getByText("Cancel")).toBeDisabled();
  });

  it("shows the inline error message when the mutation is in an error state", async () => {
    mockCreateAccountUseMutation.mockReturnValue(
      mockMutationResult({ isError: true }),
    );
    await renderMoreScreen();
    await fireEvent.press(screen.getByText("+ Add account"));

    expect(screen.getByText("Couldn't save — try again.")).toBeTruthy();
  });
});

describe("AddCategoryForm collapsed state", () => {
  it("does not show the name input/toggle before + Add category is tapped", async () => {
    await renderMoreScreen();

    expect(screen.getByText("+ Add category")).toBeTruthy();
    expect(screen.queryByText("Expense")).toBeNull();
    expect(screen.queryByText("Income")).toBeNull();
  });

  it("reveals the name input and the Expense/Income toggle on tap", async () => {
    await renderMoreScreen();

    await fireEvent.press(screen.getByText("+ Add category"));

    const nameInputs = screen.getAllByPlaceholderText("Name");
    expect(nameInputs.length).toBeGreaterThan(0);
    expect(screen.getByText("Expense")).toBeTruthy();
  });
});

describe("AddCategoryForm toggle", () => {
  it("flips the label between Expense and Income on repeated taps", async () => {
    await renderMoreScreen();
    await fireEvent.press(screen.getByText("+ Add category"));

    expect(screen.getByText("Expense")).toBeTruthy();

    await fireEvent.press(screen.getByText("Expense"));
    expect(screen.getByText("Income")).toBeTruthy();
    expect(screen.queryByText("Expense")).toBeNull();

    await fireEvent.press(screen.getByText("Income"));
    expect(screen.getByText("Expense")).toBeTruthy();
    expect(screen.queryByText("Income")).toBeNull();
  });
});

describe("AddCategoryForm save validation and submission", () => {
  it("disables Save when the name is empty or whitespace-only", async () => {
    await renderMoreScreen();
    await fireEvent.press(screen.getByText("+ Add category"));

    const nameInput = screen.getAllByPlaceholderText("Name").at(-1);
    if (!nameInput) throw new Error("category name input not found");

    expect(screen.getByText("Save")).toBeDisabled();

    await fireEvent.changeText(nameInput, "   ");
    expect(screen.getByText("Save")).toBeDisabled();

    await fireEvent.changeText(nameInput, "Rent");
    expect(screen.getByText("Save")).toBeEnabled();
  });

  it("calls the mutation with the trimmed name and isIncome: false when left at the default toggle state", async () => {
    const mutate = jest.fn();
    mockCreateCategoryUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await renderMoreScreen();
    await fireEvent.press(screen.getByText("+ Add category"));

    const nameInput = screen.getAllByPlaceholderText("Name").at(-1);
    if (!nameInput) throw new Error("category name input not found");
    await fireEvent.changeText(nameInput, "  Rent  ");
    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ name: "Rent", isIncome: false });
  });

  it("calls the mutation with isIncome: true after the toggle was flipped to Income", async () => {
    const mutate = jest.fn();
    mockCreateCategoryUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await renderMoreScreen();
    await fireEvent.press(screen.getByText("+ Add category"));

    const nameInput = screen.getAllByPlaceholderText("Name").at(-1);
    if (!nameInput) throw new Error("category name input not found");
    await fireEvent.changeText(nameInput, "Salary");
    await fireEvent.press(screen.getByText("Expense"));
    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ name: "Salary", isIncome: true });
  });
});

describe("AddCategoryForm mutation status states", () => {
  it("shows Saving… and disables controls while the mutation is pending", async () => {
    mockCreateCategoryUseMutation.mockReturnValue(
      mockMutationResult({ isPending: true }),
    );
    await renderMoreScreen();
    await fireEvent.press(screen.getByText("+ Add category"));

    expect(screen.getByText("Saving…")).toBeTruthy();
    expect(screen.queryByText("Save")).toBeNull();
    expect(screen.getByText("Saving…")).toBeDisabled();
    expect(screen.getByText("Cancel")).toBeDisabled();
  });

  it("shows the inline error message when the mutation is in an error state", async () => {
    mockCreateCategoryUseMutation.mockReturnValue(
      mockMutationResult({ isError: true }),
    );
    await renderMoreScreen();
    await fireEvent.press(screen.getByText("+ Add category"));

    expect(screen.getByText("Couldn't save — try again.")).toBeTruthy();
  });
});

describe("AccountRow display and edit toggle", () => {
  it("shows the account's name/currency and an Edit button, with no edit inputs visible", async () => {
    await renderMoreScreenWithData([checking], []);

    expect(screen.getByText("Checking")).toBeTruthy();
    expect(screen.getByText("USD")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.queryByDisplayValue("Checking")).toBeNull();
    expect(screen.queryByText("Save")).toBeNull();
    expect(screen.queryByText("Cancel")).toBeNull();
  });

  it("tapping Edit reveals name/currency inputs pre-filled with the account's current values", async () => {
    await renderMoreScreenWithData([checking], []);

    await fireEvent.press(screen.getByText("Edit"));

    expect(screen.getByDisplayValue("Checking")).toBeTruthy();
    expect(screen.getByDisplayValue("USD")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
  });
});

describe("AccountRow with multiple accounts stays scoped to the tapped row", () => {
  it("editing the second account's row leaves the first row untouched", async () => {
    await renderMoreScreenWithData([checking, savings], []);

    const editButtons = screen.getAllByText("Edit");
    expect(editButtons).toHaveLength(2);
    const secondEditButton = editButtons.at(1);
    if (!secondEditButton) throw new Error("second Edit button not found");
    await fireEvent.press(secondEditButton);

    expect(screen.getByDisplayValue("Savings")).toBeTruthy();
    expect(screen.getByDisplayValue("EUR")).toBeTruthy();
    expect(screen.queryByDisplayValue("Checking")).toBeNull();

    // First account's row is still read-only, with its own Edit button intact.
    expect(screen.getByText("Checking")).toBeTruthy();
    expect(screen.getAllByText("Edit")).toHaveLength(1);
  });
});

describe("AccountRow cancel", () => {
  it("reverts an uncommitted name change and exits edit mode on Cancel", async () => {
    await renderMoreScreenWithData([checking], []);

    await fireEvent.press(screen.getByText("Edit"));
    await fireEvent.changeText(screen.getByPlaceholderText("Name"), "Changed Name");
    await fireEvent.press(screen.getByText("Cancel"));

    expect(screen.getByText("Checking")).toBeTruthy();
    expect(screen.queryByText("Changed Name")).toBeNull();
    expect(screen.queryByText("Cancel")).toBeNull();
    expect(screen.queryByText("Save")).toBeNull();

    // Re-opening Edit shows the original saved value, not the cancelled one —
    // the mocked query data never changed since no mutation actually ran.
    await fireEvent.press(screen.getByText("Edit"));
    expect(screen.getByDisplayValue("Checking")).toBeTruthy();
    expect(screen.queryByDisplayValue("Changed Name")).toBeNull();
  });
});

describe("AccountRow save", () => {
  it("calls updateAccount.mutate with the trimmed name and uppercased currency", async () => {
    const mutate = jest.fn();
    mockUpdateAccountUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await renderMoreScreenWithData([checking], []);

    await fireEvent.press(screen.getByText("Edit"));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Name"),
      "  New Checking  ",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("Currency (e.g. USD)"),
      "eur",
    );
    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      id: checking.id,
      name: "New Checking",
      currency: "EUR",
    });
  });

  it("shows the inline error message when the update mutation errors, staying in edit mode", async () => {
    mockUpdateAccountUseMutation.mockReturnValue(
      mockMutationResult({ isError: true }),
    );
    await renderMoreScreenWithData([checking], []);

    await fireEvent.press(screen.getByText("Edit"));

    expect(screen.getByText("Couldn't save — try again.")).toBeTruthy();
    expect(screen.getByDisplayValue("Checking")).toBeTruthy();
  });
});

describe("CategoryRow display and edit toggle", () => {
  it("shows the category's name (with an income suffix) and an Edit button", async () => {
    await renderMoreScreenWithData([], [salaryCategory]);

    expect(screen.getByText("Salary (income)")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.queryByDisplayValue("Salary")).toBeNull();
  });

  it("shows the category's plain name (no suffix) for an expense category", async () => {
    await renderMoreScreenWithData([], [groceriesCategory]);

    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.queryByText("Groceries (income)")).toBeNull();
  });

  it("tapping Edit reveals a pre-filled name input and the Income toggle state for an income category", async () => {
    await renderMoreScreenWithData([], [salaryCategory]);

    await fireEvent.press(screen.getByText("Edit"));

    expect(screen.getByDisplayValue("Salary")).toBeTruthy();
    expect(screen.getByText("Income")).toBeTruthy();
    expect(screen.queryByText("Expense")).toBeNull();
  });

  it("tapping Edit reveals a pre-filled name input and the Expense toggle state for an expense category", async () => {
    await renderMoreScreenWithData([], [groceriesCategory]);

    await fireEvent.press(screen.getByText("Edit"));

    expect(screen.getByDisplayValue("Groceries")).toBeTruthy();
    expect(screen.getByText("Expense")).toBeTruthy();
    expect(screen.queryByText("Income")).toBeNull();
  });
});

describe("CategoryRow cancel", () => {
  it("reverts uncommitted changes (name and toggle) and exits edit mode on Cancel", async () => {
    await renderMoreScreenWithData([], [groceriesCategory]);

    await fireEvent.press(screen.getByText("Edit"));
    await fireEvent.changeText(screen.getByPlaceholderText("Name"), "Changed");
    await fireEvent.press(screen.getByText("Expense"));
    expect(screen.getByText("Income")).toBeTruthy();

    await fireEvent.press(screen.getByText("Cancel"));

    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.queryByText("Changed")).toBeNull();
    expect(screen.queryByText("Cancel")).toBeNull();

    // Re-opening Edit shows the original saved name and toggle state.
    await fireEvent.press(screen.getByText("Edit"));
    expect(screen.getByDisplayValue("Groceries")).toBeTruthy();
    expect(screen.getByText("Expense")).toBeTruthy();
    expect(screen.queryByText("Income")).toBeNull();
  });
});

describe("CategoryRow save", () => {
  it("calls updateCategory.mutate with the flipped isIncome and the trimmed name", async () => {
    const mutate = jest.fn();
    mockUpdateCategoryUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await renderMoreScreenWithData([], [groceriesCategory]);

    await fireEvent.press(screen.getByText("Edit"));
    await fireEvent.press(screen.getByText("Expense"));
    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      id: groceriesCategory.id,
      name: "Groceries",
      isIncome: true,
    });
  });

  it("shows the inline error message when the update mutation errors, staying in edit mode", async () => {
    mockUpdateCategoryUseMutation.mockReturnValue(
      mockMutationResult({ isError: true }),
    );
    await renderMoreScreenWithData([], [salaryCategory]);

    await fireEvent.press(screen.getByText("Edit"));

    expect(screen.getByText("Couldn't save — try again.")).toBeTruthy();
    expect(screen.getByDisplayValue("Salary")).toBeTruthy();
  });
});
