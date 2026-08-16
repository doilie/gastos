import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("../lib/trpc", () => ({
  trpc: {
    ledger: {
      addTransaction: {
        useMutation: jest.fn(),
      },
    },
    useUtils: jest.fn(),
  },
}));

import {
  accountIdFromString,
  createSpendableEnvelope,
  createSubEnvelope,
  envelopeGroupIdFromString,
  SPENDABLE_ENVELOPE_ID,
  subEnvelopeIdFromString,
} from "@gastos/shared";

import { findSpendableAccountId, QuickAddForm } from "./QuickAddForm";
import { trpc } from "../lib/trpc";

// The component only reads `mutate`, `isPending`, and `isError` off the
// mutation result (plus calls `.reset()`), so the mock only needs to supply
// those fields — not a full tRPC `UseTRPCMutationResult` shape.
interface MockMutationResult {
  mutate: jest.Mock;
  isPending: boolean;
  isError: boolean;
  reset: jest.Mock;
}

const mockUseMutation = trpc.ledger.addTransaction
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockUseUtils = trpc.useUtils as unknown as jest.Mock<{
  ledger: { spendableBalance: { invalidate: jest.Mock } };
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

/** Opens the form and fills in a valid amount/description, leaving "Save" enabled. */
async function openAndFillValidForm(
  amount = "150.00",
  description = "Coffee",
): Promise<void> {
  await fireEvent.press(screen.getByText("+ Add"));
  await fireEvent.changeText(screen.getByPlaceholderText("Amount"), amount);
  await fireEvent.changeText(
    screen.getByPlaceholderText("Description"),
    description,
  );
}

// File-scoped (not nested in a `describe`) so every `describe` block below
// gets the same default mutation/utils mocks without pushing any single
// `describe` callback's line count over the `max-lines-per-function` cap.
beforeEach(() => {
  mockUseMutation.mockReturnValue(mockMutationResult());
  mockUseUtils.mockReturnValue({
    ledger: { spendableBalance: { invalidate: jest.fn() } },
  });
});

afterEach(() => {
  mockUseMutation.mockReset();
  mockUseUtils.mockReset();
});

describe("QuickAddForm collapsed state", () => {
  it("disables the + Add button when no spendable account has resolved", async () => {
    await render(<QuickAddForm spendableAccountId={undefined} />);

    expect(screen.getByText("+ Add")).toBeDisabled();
  });

  it("does not reveal the form when + Add is pressed while disabled", async () => {
    await render(<QuickAddForm spendableAccountId={undefined} />);

    await fireEvent.press(screen.getByText("+ Add"));

    expect(screen.queryByPlaceholderText("Amount")).toBeNull();
  });

  it("reveals the amount/description inputs and Save/Cancel buttons on tap", async () => {
    await render(<QuickAddForm spendableAccountId="acc-1" />);

    await fireEvent.press(screen.getByText("+ Add"));

    expect(screen.getByPlaceholderText("Amount")).toBeTruthy();
    expect(screen.getByPlaceholderText("Description")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
  });
});

describe("QuickAddForm save validation and submission", () => {
  it("keeps Save disabled until both a valid amount and a description are entered", async () => {
    await render(<QuickAddForm spendableAccountId="acc-1" />);
    await fireEvent.press(screen.getByText("+ Add"));

    expect(screen.getByText("Save")).toBeDisabled();

    // Amount only, non-numeric: still disabled.
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "abc");
    await fireEvent.changeText(
      screen.getByPlaceholderText("Description"),
      "Coffee",
    );
    expect(screen.getByText("Save")).toBeDisabled();

    // Amount only, zero: still disabled even with description filled.
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "0.00");
    expect(screen.getByText("Save")).toBeDisabled();

    // Valid amount, empty description: still disabled.
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "150");
    await fireEvent.changeText(screen.getByPlaceholderText("Description"), "");
    expect(screen.getByText("Save")).toBeDisabled();

    // Valid amount + non-empty description: enabled.
    await fireEvent.changeText(
      screen.getByPlaceholderText("Description"),
      "Coffee",
    );
    expect(screen.getByText("Save")).toBeEnabled();
  });

  it("calls the mutation with the negated amount, trimmed description, and today's date", async () => {
    const mutate = jest.fn();
    mockUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await render(<QuickAddForm spendableAccountId="acc-1" />);

    await openAndFillValidForm("150.00", "  Coffee  ");
    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    const call = mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).toMatchObject({
      description: "Coffee",
      categoryId: null,
      accountId: "acc-1",
      subEnvelopeId: SPENDABLE_ENVELOPE_ID,
      amount: "-150.00",
    });
    expect(call.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("clears and collapses the form on Cancel, resetting fields on re-open", async () => {
    await render(<QuickAddForm spendableAccountId="acc-1" />);

    await openAndFillValidForm("150.00", "Coffee");
    await fireEvent.press(screen.getByText("Cancel"));

    expect(screen.getByText("+ Add")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Amount")).toBeNull();

    await fireEvent.press(screen.getByText("+ Add"));
    expect(screen.getByPlaceholderText("Amount").props.value).toBe("");
    expect(screen.getByPlaceholderText("Description").props.value).toBe("");
  });
});

describe("QuickAddForm mutation status states", () => {
  it("shows Saving… and disables controls while the mutation is pending", async () => {
    mockUseMutation.mockReturnValue(mockMutationResult({ isPending: true }));
    await render(<QuickAddForm spendableAccountId="acc-1" />);
    await fireEvent.press(screen.getByText("+ Add"));

    expect(screen.getByText("Saving…")).toBeTruthy();
    expect(screen.queryByText("Save")).toBeNull();
    expect(screen.getByText("Saving…")).toBeDisabled();
    expect(screen.getByText("Cancel")).toBeDisabled();

    const amountInput = screen.getByPlaceholderText("Amount");
    const descriptionInput = screen.getByPlaceholderText("Description");
    expect(amountInput.props.editable).toBe(false);
    expect(descriptionInput.props.editable).toBe(false);

    await fireEvent.changeText(amountInput, "999");
    expect(screen.getByPlaceholderText("Amount").props.value).toBe("");
  });

  it("shows the inline error message when the mutation is in an error state", async () => {
    mockUseMutation.mockReturnValue(mockMutationResult({ isError: true }));
    await render(<QuickAddForm spendableAccountId="acc-1" />);
    await fireEvent.press(screen.getByText("+ Add"));

    expect(screen.getByText("Couldn't save — try again.")).toBeTruthy();
  });
});

describe("findSpendableAccountId", () => {
  const accountA = accountIdFromString("acc-1");
  const accountB = accountIdFromString("acc-2");

  it("returns the first accountId of the Spendable envelope when present", () => {
    const spendable = createSpendableEnvelope([accountA, accountB]);

    expect(findSpendableAccountId([spendable])).toBe("acc-1");
  });

  it("returns undefined when no Spendable envelope is present", () => {
    const groceries = createSubEnvelope({
      id: subEnvelopeIdFromString("groceries"),
      name: "Groceries",
      groupId: envelopeGroupIdFromString("group-1"),
      accountIds: [accountA],
    });

    expect(findSpendableAccountId([groceries])).toBeUndefined();
    expect(findSpendableAccountId([])).toBeUndefined();
  });
});
