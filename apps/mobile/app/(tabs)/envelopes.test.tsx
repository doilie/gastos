import { fireEvent, render } from "@testing-library/react-native";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    reference: {
      envelopeGroups: {
        useQuery: jest.fn(),
      },
      subEnvelopes: {
        useQuery: jest.fn(),
      },
      accounts: {
        useQuery: jest.fn(),
      },
      createEnvelopeGroup: {
        useMutation: jest.fn(),
      },
      createSubEnvelope: {
        useMutation: jest.fn(),
      },
      updateEnvelopeGroup: {
        useMutation: jest.fn(),
      },
      updateSubEnvelope: {
        useMutation: jest.fn(),
      },
    },
    useQueries: jest.fn(),
    useUtils: jest.fn(),
  },
}));

import {
  type Account,
  accountIdFromString,
  centsFromInt,
  createAccount,
  currencyCodeFromString,
  formatCents,
} from "@gastos/shared";

import { trpc } from "../../lib/trpc";
import EnvelopesScreen from "./envelopes";

// The component only reads `isPending`, `isError`, and `data` off each query
// result, so the mocks only need to supply those fields — not full
// `UseQueryResult`/`UseTRPCQueryResult` shapes.
interface MockQueryResult<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}

// Minimal shapes of `EnvelopeGroup`/`SubEnvelope` as read by `EnvelopesScreen`
// — plain object literals are fine here since this suite tests the screen's
// wiring, not `@gastos/shared`'s validation.
interface MockEnvelopeGroup {
  id: string;
  name: string;
}

interface MockSubEnvelope {
  id: string;
  name: string;
  groupId: string | null;
  accountIds: string[];
}

const mockEnvelopeGroupsUseQuery = trpc.reference.envelopeGroups
  .useQuery as unknown as jest.Mock<MockQueryResult<MockEnvelopeGroup[]>>;
const mockSubEnvelopesUseQuery = trpc.reference.subEnvelopes
  .useQuery as unknown as jest.Mock<MockQueryResult<MockSubEnvelope[]>>;
const mockAccountsUseQuery = trpc.reference.accounts
  .useQuery as unknown as jest.Mock<MockQueryResult<Account[]>>;
const mockUseQueries = trpc.useQueries as unknown as jest.Mock<
  MockQueryResult<number>[]
>;

// Mirrors more.test.tsx's `MockMutationResult` pattern: the components only
// read `mutate`, `isPending`, and `isError` off the mutation result (plus
// call `.reset()`).
interface MockMutationResult {
  mutate: jest.Mock;
  isPending: boolean;
  isError: boolean;
  reset: jest.Mock;
}

const mockCreateEnvelopeGroupUseMutation = trpc.reference.createEnvelopeGroup
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockCreateSubEnvelopeUseMutation = trpc.reference.createSubEnvelope
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockUpdateEnvelopeGroupUseMutation = trpc.reference.updateEnvelopeGroup
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockUpdateSubEnvelopeUseMutation = trpc.reference.updateSubEnvelope
  .useMutation as unknown as jest.Mock<MockMutationResult>;

const mockUseUtils = trpc.useUtils as unknown as jest.Mock<{
  reference: {
    envelopeGroups: { invalidate: jest.Mock };
    subEnvelopes: { invalidate: jest.Mock };
  };
}>;

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

// The screen also queries `accounts` now (alongside envelopeGroups/
// subEnvelopes) and reads `useUtils()`/the two create-mutations, so every
// existing test (which predates this) needs a default for those too — set
// once here rather than touching every pre-existing test body.
beforeEach(() => {
  mockAccountsUseQuery.mockReturnValue(success([]));
  mockCreateEnvelopeGroupUseMutation.mockReturnValue(mockMutationResult());
  mockCreateSubEnvelopeUseMutation.mockReturnValue(mockMutationResult());
  mockUpdateEnvelopeGroupUseMutation.mockReturnValue(mockMutationResult());
  mockUpdateSubEnvelopeUseMutation.mockReturnValue(mockMutationResult());
  mockUseUtils.mockReturnValue({
    reference: {
      envelopeGroups: { invalidate: jest.fn() },
      subEnvelopes: { invalidate: jest.fn() },
    },
  });
});

afterEach(() => {
  mockEnvelopeGroupsUseQuery.mockReset();
  mockSubEnvelopesUseQuery.mockReset();
  mockAccountsUseQuery.mockReset();
  mockCreateEnvelopeGroupUseMutation.mockReset();
  mockCreateSubEnvelopeUseMutation.mockReset();
  mockUpdateEnvelopeGroupUseMutation.mockReset();
  mockUpdateSubEnvelopeUseMutation.mockReset();
  mockUseUtils.mockReset();
  mockUseQueries.mockReset();
});

describe("EnvelopesScreen loading state", () => {
  it("renders Loading… while envelopeGroups is pending", async () => {
    mockEnvelopeGroupsUseQuery.mockReturnValue(pending());
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockUseQueries.mockReturnValue([]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });

  it("renders Loading… while subEnvelopes is pending (not envelopeGroups)", async () => {
    mockEnvelopeGroupsUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(pending());
    mockUseQueries.mockReturnValue([]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });
});

describe("EnvelopesScreen error state", () => {
  it("renders an error message when envelopeGroups errors", async () => {
    mockEnvelopeGroupsUseQuery.mockReturnValue(errored());
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockUseQueries.mockReturnValue([]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });

  it("renders an error message when subEnvelopes errors (not envelopeGroups)", async () => {
    mockEnvelopeGroupsUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(errored());
    mockUseQueries.mockReturnValue([]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });
});

const everydayGroup: MockEnvelopeGroup = { id: "grp-1", name: "Everyday" };
const groceriesFund: MockSubEnvelope = {
  id: "sub-1",
  name: "Groceries Fund",
  groupId: "grp-1",
  accountIds: ["acc-1"],
};
const spendable: MockSubEnvelope = {
  id: "spendable",
  name: "Spendable",
  groupId: null,
  accountIds: ["acc-1"],
};

/** Wires the two list queries with one group + one grouped + one Spendable sub-envelope. */
function mockOneGroupWithOneSubEnvelope(): void {
  mockEnvelopeGroupsUseQuery.mockReturnValue(success([everydayGroup]));
  mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund, spendable]));
}

describe("EnvelopesScreen success state", () => {
  it("renders groups and grouped sub-envelopes, excluding Spendable", async () => {
    mockOneGroupWithOneSubEnvelope();
    const balance = centsFromInt(300000);
    mockUseQueries.mockReturnValue([success(balance)]);

    const { getByText, queryByText } = await render(<EnvelopesScreen />);

    expect(getByText("Envelopes")).toBeTruthy();
    expect(getByText("Everyday")).toBeTruthy();
    expect(getByText("Groceries Fund")).toBeTruthy();
    expect(getByText(formatCents(balance))).toBeTruthy();
    expect(queryByText("Spendable")).toBeNull();
  });

  it('shows "…" for a sub-envelope whose balance query is still pending', async () => {
    mockOneGroupWithOneSubEnvelope();
    mockUseQueries.mockReturnValue([pending()]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Everyday")).toBeTruthy();
    expect(getByText("Groceries Fund")).toBeTruthy();
    expect(getByText("…")).toBeTruthy();
  });

  it('shows "—" for a sub-envelope whose balance query errored', async () => {
    mockOneGroupWithOneSubEnvelope();
    mockUseQueries.mockReturnValue([errored()]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Everyday")).toBeTruthy();
    expect(getByText("Groceries Fund")).toBeTruthy();
    expect(getByText("—")).toBeTruthy();
  });

  it("renders a group's heading even when it has no sub-envelopes", async () => {
    const emptyGroup: MockEnvelopeGroup = { id: "grp-2", name: "Savings" };
    mockEnvelopeGroupsUseQuery.mockReturnValue(
      success([everydayGroup, emptyGroup]),
    );
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund, spendable]));
    const balance = centsFromInt(300000);
    mockUseQueries.mockReturnValue([success(balance)]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Everyday")).toBeTruthy();
    expect(getByText("Savings")).toBeTruthy();
  });
});

// --- AddEnvelopeGroupForm / AddSubEnvelopeForm --------------------------

const travelGroup: MockEnvelopeGroup = { id: "grp-3", name: "Travel" };

const walletAccount: Account = createAccount({
  id: accountIdFromString("acc-10"),
  name: "Wallet",
  currency: currencyCodeFromString("USD"),
});

const savingsAccount: Account = createAccount({
  id: accountIdFromString("acc-11"),
  name: "Savings Account",
  currency: currencyCodeFromString("USD"),
});

/** Wires the list queries to an empty screen — no groups, no sub-envelopes, no accounts. */
function mockEmptyEnvelopesScreen(): void {
  mockEnvelopeGroupsUseQuery.mockReturnValue(success([]));
  mockSubEnvelopesUseQuery.mockReturnValue(success([]));
  mockAccountsUseQuery.mockReturnValue(success([]));
  mockUseQueries.mockReturnValue([]);
}

/**
 * Wires the list queries to a single group (`travelGroup`) with no
 * sub-envelopes of its own, plus the given accounts — keeps
 * `AddSubEnvelopeForm` tests scoped to one group/no pre-existing
 * `SubEnvelopeRow` text, matching more.test.tsx's add-form test pattern.
 */
function mockOneEmptyGroupWithAccounts(accounts: Account[]): void {
  mockEnvelopeGroupsUseQuery.mockReturnValue(success([travelGroup]));
  mockSubEnvelopesUseQuery.mockReturnValue(success([]));
  mockAccountsUseQuery.mockReturnValue(success(accounts));
  mockUseQueries.mockReturnValue([]);
}

describe("AddEnvelopeGroupForm collapsed state", () => {
  it("does not show the name input before + Add group is tapped", async () => {
    mockEmptyEnvelopesScreen();

    const { getByText, queryByPlaceholderText } = await render(<EnvelopesScreen />);

    expect(getByText("+ Add group")).toBeTruthy();
    expect(queryByPlaceholderText("Name")).toBeNull();
  });

  it("reveals the name input and Cancel/Save buttons on tap", async () => {
    mockEmptyEnvelopesScreen();

    const { getByText, getByPlaceholderText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("+ Add group"));

    expect(getByPlaceholderText("Name")).toBeTruthy();
    expect(getByText("Cancel")).toBeTruthy();
    expect(getByText("Save")).toBeTruthy();
  });
});

describe("AddEnvelopeGroupForm save validation", () => {
  it("disables Save when name is empty or whitespace-only", async () => {
    mockEmptyEnvelopesScreen();

    const { getByText, getByPlaceholderText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("+ Add group"));

    expect(getByText("Save")).toBeDisabled();

    await fireEvent.changeText(getByPlaceholderText("Name"), "   ");
    expect(getByText("Save")).toBeDisabled();

    await fireEvent.changeText(getByPlaceholderText("Name"), "Travel");
    expect(getByText("Save")).toBeEnabled();
  });
});

describe("AddEnvelopeGroupForm submission", () => {
  it("calls createEnvelopeGroup.mutate with the trimmed name", async () => {
    const mutate = jest.fn();
    mockCreateEnvelopeGroupUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockEmptyEnvelopesScreen();

    const { getByText, getByPlaceholderText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("+ Add group"));
    await fireEvent.changeText(getByPlaceholderText("Name"), "  Travel  ");
    await fireEvent.press(getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ name: "Travel" });
  });
});

describe("AddEnvelopeGroupForm mutation error state", () => {
  it("shows the inline error message when the mutation errors", async () => {
    mockCreateEnvelopeGroupUseMutation.mockReturnValue(
      mockMutationResult({ isError: true }),
    );
    mockEmptyEnvelopesScreen();

    const { getByText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("+ Add group"));

    expect(getByText("Couldn't save — try again.")).toBeTruthy();
  });
});

describe("AddSubEnvelopeForm collapsed state", () => {
  it("does not show the name input/account rows before + Add sub-envelope is tapped", async () => {
    mockOneEmptyGroupWithAccounts([walletAccount, savingsAccount]);

    const { getByText, queryByPlaceholderText, queryByText } = await render(
      <EnvelopesScreen />,
    );

    expect(getByText("+ Add sub-envelope")).toBeTruthy();
    expect(queryByPlaceholderText("Name")).toBeNull();
    expect(queryByText("Wallet")).toBeNull();
  });

  it("reveals the name input and one row per account on tap", async () => {
    mockOneEmptyGroupWithAccounts([walletAccount, savingsAccount]);

    const { getByText, getByPlaceholderText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("+ Add sub-envelope"));

    expect(getByPlaceholderText("Name")).toBeTruthy();
    expect(getByText("Wallet")).toBeTruthy();
    expect(getByText("Savings Account")).toBeTruthy();
  });
});

describe("AddSubEnvelopeForm save validation", () => {
  it("disables Save unless both a name is entered and at least one account is selected", async () => {
    mockOneEmptyGroupWithAccounts([walletAccount]);

    const { getByText, getByPlaceholderText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("+ Add sub-envelope"));

    // Neither filled.
    expect(getByText("Save")).toBeDisabled();

    // Name filled, no account selected.
    await fireEvent.changeText(getByPlaceholderText("Name"), "Gas Fund");
    expect(getByText("Save")).toBeDisabled();

    // Account selected, name cleared back out.
    await fireEvent.changeText(getByPlaceholderText("Name"), "");
    await fireEvent.press(getByText("Wallet"));
    expect(getByText("Save")).toBeDisabled();

    // Both filled.
    await fireEvent.changeText(getByPlaceholderText("Name"), "Gas Fund");
    expect(getByText("Save")).toBeEnabled();
  });
});

describe("AddSubEnvelopeForm account selection toggle", () => {
  it("toggles an account row's selected state (✓ prefix) on repeated taps", async () => {
    mockOneEmptyGroupWithAccounts([walletAccount]);

    const { getByText, queryByText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("+ Add sub-envelope"));

    expect(getByText("Wallet")).toBeTruthy();
    expect(queryByText("✓ Wallet")).toBeNull();

    await fireEvent.press(getByText("Wallet"));
    expect(getByText("✓ Wallet")).toBeTruthy();
    expect(queryByText("Wallet")).toBeNull();

    await fireEvent.press(getByText("✓ Wallet"));
    expect(getByText("Wallet")).toBeTruthy();
    expect(queryByText("✓ Wallet")).toBeNull();
  });
});

describe("AddSubEnvelopeForm submission", () => {
  it("calls createSubEnvelope.mutate with the trimmed name, the enclosing group's id, and the one selected account", async () => {
    const mutate = jest.fn();
    mockCreateSubEnvelopeUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockOneEmptyGroupWithAccounts([walletAccount, savingsAccount]);

    const { getByText, getByPlaceholderText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("+ Add sub-envelope"));
    await fireEvent.changeText(getByPlaceholderText("Name"), "  Gas Fund  ");
    await fireEvent.press(getByText("Wallet"));
    await fireEvent.press(getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      name: "Gas Fund",
      groupId: travelGroup.id,
      accountIds: [walletAccount.id],
    });
  });

  it("calls createSubEnvelope.mutate with both accountIds when two accounts are selected", async () => {
    const mutate = jest.fn();
    mockCreateSubEnvelopeUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockOneEmptyGroupWithAccounts([walletAccount, savingsAccount]);

    const { getByText, getByPlaceholderText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("+ Add sub-envelope"));
    await fireEvent.changeText(getByPlaceholderText("Name"), "Gas Fund");
    await fireEvent.press(getByText("Wallet"));
    await fireEvent.press(getByText("Savings Account"));
    await fireEvent.press(getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    const call = mutate.mock.calls[0]?.[0] as {
      name: string;
      groupId: string;
      accountIds: string[];
    };
    expect(call.name).toBe("Gas Fund");
    expect(call.groupId).toBe(travelGroup.id);
    expect([...call.accountIds].sort()).toEqual(
      [walletAccount.id, savingsAccount.id].sort(),
    );
  });
});

describe("AddSubEnvelopeForm mutation error state", () => {
  it("shows the inline error message when the mutation errors", async () => {
    mockCreateSubEnvelopeUseMutation.mockReturnValue(
      mockMutationResult({ isError: true }),
    );
    mockOneEmptyGroupWithAccounts([walletAccount]);

    const { getByText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("+ Add sub-envelope"));

    expect(getByText("Couldn't save — try again.")).toBeTruthy();
  });
});

// --- EnvelopeGroupSection / SubEnvelopeRow "Edit" controls --------------

/** Returns `value`, or throws if it's `undefined` — avoids a non-null assertion when indexing `getAllByText` results. */
function requireDefined<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("expected value to be defined");
  }
  return value;
}

describe("EnvelopeGroupSection heading edit collapsed state", () => {
  it("does not show the edit input before Edit is tapped", async () => {
    mockOneEmptyGroupWithAccounts([]);

    const { getByText, queryByPlaceholderText, queryByText } = await render(
      <EnvelopesScreen />,
    );

    expect(getByText("Travel")).toBeTruthy();
    expect(getByText("Edit")).toBeTruthy();
    expect(queryByPlaceholderText("Name")).toBeNull();
    expect(queryByText("Cancel")).toBeNull();
    expect(queryByText("Save")).toBeNull();
  });

  it("reveals a pre-filled name input and Cancel/Save on tap", async () => {
    mockOneEmptyGroupWithAccounts([]);

    const { getByText, getByPlaceholderText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("Edit"));

    expect(getByPlaceholderText("Name")["props"]["value"]).toBe("Travel");
    expect(getByText("Cancel")).toBeTruthy();
    expect(getByText("Save")).toBeTruthy();
  });
});

describe("EnvelopeGroupSection heading edit save validation", () => {
  it("disables Save when the name is empty or whitespace-only", async () => {
    mockOneEmptyGroupWithAccounts([]);

    const { getByText, getByPlaceholderText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("Edit"));

    await fireEvent.changeText(getByPlaceholderText("Name"), "   ");
    expect(getByText("Save")).toBeDisabled();

    await fireEvent.changeText(getByPlaceholderText("Name"), "");
    expect(getByText("Save")).toBeDisabled();

    await fireEvent.changeText(getByPlaceholderText("Name"), "Trips");
    expect(getByText("Save")).toBeEnabled();
  });
});

describe("EnvelopeGroupSection heading edit submission", () => {
  it("calls updateEnvelopeGroup.mutate with the trimmed name on Save", async () => {
    const mutate = jest.fn();
    mockUpdateEnvelopeGroupUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockOneEmptyGroupWithAccounts([]);

    const { getByText, getByPlaceholderText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("Edit"));
    await fireEvent.changeText(getByPlaceholderText("Name"), "  Trips  ");
    await fireEvent.press(getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ id: travelGroup.id, name: "Trips" });
  });
});

describe("EnvelopeGroupSection heading edit cancel", () => {
  it("reverts to the original name and exits edit mode, without calling mutate", async () => {
    const mutate = jest.fn();
    mockUpdateEnvelopeGroupUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockOneEmptyGroupWithAccounts([]);

    const { getByText, getByPlaceholderText, queryByPlaceholderText } = await render(
      <EnvelopesScreen />,
    );
    await fireEvent.press(getByText("Edit"));
    await fireEvent.changeText(getByPlaceholderText("Name"), "Something else");
    await fireEvent.press(getByText("Cancel"));

    expect(mutate).not.toHaveBeenCalled();
    expect(getByText("Travel")).toBeTruthy();
    expect(queryByPlaceholderText("Name")).toBeNull();
  });
});

describe("EnvelopeGroupSection heading edit mutation error state", () => {
  it("shows the inline error message when the mutation errors", async () => {
    mockUpdateEnvelopeGroupUseMutation.mockReturnValue(
      mockMutationResult({ isError: true }),
    );
    mockOneEmptyGroupWithAccounts([]);

    const { getByText } = await render(<EnvelopesScreen />);
    await fireEvent.press(getByText("Edit"));

    expect(getByText("Couldn't save — try again.")).toBeTruthy();
  });
});

const editableSubEnvelope: MockSubEnvelope = {
  id: "sub-20",
  name: "Rent Fund",
  groupId: everydayGroup.id,
  accountIds: [walletAccount.id],
};
const editableSubEnvelopeBalance = centsFromInt(12000);

/**
 * Wires the list queries to one group (`everydayGroup`) with exactly one
 * sub-envelope (`editableSubEnvelope`, linked to `walletAccount` only) plus
 * two accounts (`walletAccount`/`savingsAccount`) — scoped so a
 * `SubEnvelopeRow` edit test only ever sees one row, keeping its "Edit"
 * button distinguishable from the group heading's via DOM order (heading
 * renders first).
 */
function mockOneGroupWithOneEditableSubEnvelope(): void {
  mockEnvelopeGroupsUseQuery.mockReturnValue(success([everydayGroup]));
  mockSubEnvelopesUseQuery.mockReturnValue(success([editableSubEnvelope]));
  mockAccountsUseQuery.mockReturnValue(success([walletAccount, savingsAccount]));
  mockUseQueries.mockReturnValue([success(editableSubEnvelopeBalance)]);
}

describe("SubEnvelopeRow edit collapsed state", () => {
  it("does not show edit inputs before Edit is tapped, showing name and balance instead", async () => {
    mockOneGroupWithOneEditableSubEnvelope();

    const { getByText, queryByPlaceholderText } = await render(<EnvelopesScreen />);

    expect(getByText("Rent Fund")).toBeTruthy();
    expect(getByText(formatCents(editableSubEnvelopeBalance))).toBeTruthy();
    expect(queryByPlaceholderText("Name")).toBeNull();
  });

  it("reveals a pre-filled name input and account multi-select with the current account pre-selected, on tap", async () => {
    mockOneGroupWithOneEditableSubEnvelope();

    const { getAllByText, getByText, getByPlaceholderText, queryByText } = await render(
      <EnvelopesScreen />,
    );
    await fireEvent.press(requireDefined(getAllByText("Edit")[1]));

    expect(getByPlaceholderText("Name")["props"]["value"]).toBe("Rent Fund");
    expect(getByText("✓ Wallet")).toBeTruthy();
    expect(getByText("Savings Account")).toBeTruthy();
    expect(queryByText("✓ Savings Account")).toBeNull();
  });
});

describe("SubEnvelopeRow edit save validation", () => {
  it("disables Save when the name is empty, and when all accounts are deselected", async () => {
    mockOneGroupWithOneEditableSubEnvelope();

    const { getAllByText, getByText, getByPlaceholderText } = await render(
      <EnvelopesScreen />,
    );
    await fireEvent.press(requireDefined(getAllByText("Edit")[1]));

    // Name emptied, account still selected.
    await fireEvent.changeText(getByPlaceholderText("Name"), "");
    expect(getByText("Save")).toBeDisabled();

    // Name restored, but the only selected account is deselected.
    await fireEvent.changeText(getByPlaceholderText("Name"), "Rent Fund");
    await fireEvent.press(getByText("✓ Wallet"));
    expect(getByText("Save")).toBeDisabled();
  });
});

describe("SubEnvelopeRow edit submission", () => {
  it("calls updateSubEnvelope.mutate with the trimmed name and the newly selected accounts on Save", async () => {
    const mutate = jest.fn();
    mockUpdateSubEnvelopeUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockOneGroupWithOneEditableSubEnvelope();

    const { getAllByText, getByText, getByPlaceholderText } = await render(
      <EnvelopesScreen />,
    );
    await fireEvent.press(requireDefined(getAllByText("Edit")[1]));
    await fireEvent.changeText(getByPlaceholderText("Name"), "  Housing Fund  ");
    await fireEvent.press(getByText("✓ Wallet"));
    await fireEvent.press(getByText("Savings Account"));
    await fireEvent.press(getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      id: editableSubEnvelope.id,
      name: "Housing Fund",
      accountIds: [savingsAccount.id],
    });
  });
});

describe("SubEnvelopeRow edit cancel", () => {
  it("reverts the name and account selection to the original values, without calling mutate", async () => {
    const mutate = jest.fn();
    mockUpdateSubEnvelopeUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    mockOneGroupWithOneEditableSubEnvelope();

    const { getAllByText, getByText, getByPlaceholderText, queryByPlaceholderText } =
      await render(<EnvelopesScreen />);
    await fireEvent.press(requireDefined(getAllByText("Edit")[1]));
    await fireEvent.changeText(getByPlaceholderText("Name"), "Something else");
    await fireEvent.press(getByText("✓ Wallet"));
    await fireEvent.press(getByText("Savings Account"));
    await fireEvent.press(getByText("Cancel"));

    expect(mutate).not.toHaveBeenCalled();
    expect(getByText("Rent Fund")).toBeTruthy();
    expect(getByText(formatCents(editableSubEnvelopeBalance))).toBeTruthy();
    expect(queryByPlaceholderText("Name")).toBeNull();
  });
});

describe("SubEnvelopeRow edit mutation error state", () => {
  it("shows the inline error message when the mutation errors", async () => {
    mockUpdateSubEnvelopeUseMutation.mockReturnValue(
      mockMutationResult({ isError: true }),
    );
    mockOneGroupWithOneEditableSubEnvelope();

    const { getAllByText, getByText } = await render(<EnvelopesScreen />);
    await fireEvent.press(requireDefined(getAllByText("Edit")[1]));

    expect(getByText("Couldn't save — try again.")).toBeTruthy();
  });
});
