import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("../lib/trpc", () => ({
  trpc: {
    ledger: {
      addTransaction: {
        useMutation: jest.fn(),
      },
      subEnvelopeBalance: {
        useQuery: jest.fn(),
      },
    },
    reference: {
      accounts: {
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
  centsFromInt,
  createAccount,
  createCreditCard,
  createSpendableEnvelope,
  createSubEnvelope,
  CREDIT_CARD_BUDGET_ENVELOPE_ID,
  creditCardIdFromString,
  currencyCodeFromString,
  envelopeGroupIdFromString,
  SPENDABLE_ENVELOPE_ID,
  subEnvelopeIdFromString,
  type Account,
  type CreditCard,
  type SubEnvelope,
} from "@gastos/shared";

import { QuickAddForm } from "./QuickAddForm";
import { trpc } from "../lib/trpc";

// Mirrors the established `MockQueryResult`/`MockMutationResult` interface
// style from `QuickAddForm.test.tsx` (previous revision) /
// `app/(tabs)/index.test.tsx` / `app/(tabs)/budget.test.tsx` — only the
// fields the component actually reads.
interface MockQueryResult<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}

interface MockMutationResult {
  mutate: jest.Mock;
  isPending: boolean;
  isError: boolean;
  reset: jest.Mock;
}

const mockAddTransactionUseMutation = trpc.ledger.addTransaction
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockSubEnvelopeBalanceUseQuery = trpc.ledger.subEnvelopeBalance
  .useQuery as unknown as jest.Mock<MockQueryResult<number>>;
const mockAccountsUseQuery = trpc.reference.accounts
  .useQuery as unknown as jest.Mock<MockQueryResult<Account[]>>;
const mockCreditCardsUseQuery = trpc.cards.creditCards
  .useQuery as unknown as jest.Mock<MockQueryResult<CreditCard[]>>;
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

/** A successful query result carrying `data`. */
function success<T>(data: T): MockQueryResult<T> {
  return { isPending: false, isError: false, data };
}

function mockMutationResult(overrides: Partial<MockMutationResult> = {}): MockMutationResult {
  return {
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    reset: jest.fn(),
    ...overrides,
  };
}

// Fixtures --------------------------------------------------------------

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

const spendableEnvelope: SubEnvelope = createSpendableEnvelope([accountA.id]);

const groceriesEnvelope: SubEnvelope = createSubEnvelope({
  id: subEnvelopeIdFromString("groceries"),
  name: "Groceries",
  groupId: envelopeGroupIdFromString("group-1"),
  accountIds: [accountA.id, accountB.id],
});

const ccBudgetEnvelope: SubEnvelope = {
  id: CREDIT_CARD_BUDGET_ENVELOPE_ID,
  name: "Credit Card Budget",
  groupId: null,
  accountIds: [accountA.id],
  isArchived: false,
};

const defaultSubEnvelopes: readonly SubEnvelope[] = [
  spendableEnvelope,
  groceriesEnvelope,
  ccBudgetEnvelope,
];

const singleCreditCard: CreditCard = createCreditCard({
  id: creditCardIdFromString("card-1"),
  name: "Visa",
  currency: currencyCodeFromString("USD"),
  cutoffDay: 17,
});

const secondCreditCard: CreditCard = createCreditCard({
  id: creditCardIdFromString("card-2"),
  name: "Mastercard",
  currency: currencyCodeFromString("USD"),
  cutoffDay: 5,
});

/** Opens the form and, by default, lands on Envelope mode (the toggle's default). */
async function openForm(): Promise<void> {
  await fireEvent.press(screen.getByText("+ Add"));
}

async function switchToCardMode(): Promise<void> {
  await fireEvent.press(screen.getByText("Card purchase"));
}

async function fillAmountAndDescription(amount: string, description: string): Promise<void> {
  await fireEvent.changeText(screen.getByPlaceholderText("Amount"), amount);
  await fireEvent.changeText(screen.getByPlaceholderText("Description"), description);
}

beforeEach(() => {
  mockAddTransactionUseMutation.mockReturnValue(mockMutationResult());
  mockSubEnvelopeBalanceUseQuery.mockReturnValue(success(centsFromInt(500000)));
  mockAccountsUseQuery.mockReturnValue(success([accountA, accountB]));
  mockCreditCardsUseQuery.mockReturnValue(success([singleCreditCard]));
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
  mockAddTransactionUseMutation.mockReset();
  mockSubEnvelopeBalanceUseQuery.mockReset();
  mockAccountsUseQuery.mockReset();
  mockCreditCardsUseQuery.mockReset();
  mockCreateCardPurchaseUseMutation.mockReset();
  mockUseUtils.mockReset();
});

// -------------------------------------------------------------------------
// Collapsed / mode-toggle
// -------------------------------------------------------------------------

describe("QuickAddForm collapsed state and mode toggle", () => {
  it("renders only the + Add button before tapping", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);

    expect(screen.getByText("+ Add")).toBeTruthy();
    expect(screen.queryByText("Envelope")).toBeNull();
    expect(screen.queryByText("Card purchase")).toBeNull();
  });

  it("reveals the mode toggle defaulting to Envelope mode's fields, not card mode's", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);

    await openForm();

    expect(screen.getByText("Envelope")).toBeTruthy();
    expect(screen.getByText("Card purchase")).toBeTruthy();
    expect(screen.getByText(/^Envelope: /)).toBeTruthy();
    expect(screen.queryByText("Fund with:")).toBeNull();
  });

  it("switches to card-purchase mode's fields on tapping Card purchase, and back on Envelope", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();

    await switchToCardMode();

    expect(screen.getByText("Fund with:")).toBeTruthy();
    expect(screen.queryByText(/^Envelope: /)).toBeNull();

    await fireEvent.press(screen.getByText("Envelope"));

    expect(screen.getByText(/^Envelope: /)).toBeTruthy();
    expect(screen.queryByText("Fund with:")).toBeNull();
  });

  it("discards typed-in card-mode field state when switching back to envelope mode (unmount-based reset)", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();

    await fillAmountAndDescription("75.00", "New TV");

    await fireEvent.press(screen.getByText("Envelope"));
    await switchToCardMode();

    expect(screen.getByPlaceholderText("Amount").props.value).toBe("");
    expect(screen.getByPlaceholderText("Description").props.value).toBe("");
  });
});

// -------------------------------------------------------------------------
// Envelope mode
// -------------------------------------------------------------------------

describe("QuickAddForm envelope mode — default selection and account resolution", () => {
  it("defaults to Spendable selected with its single linked account auto-resolved", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();

    expect(screen.getByText(`Envelope: ${spendableEnvelope.name} ▾`)).toBeTruthy();
    expect(screen.getByText(`Account: ${accountA.name} ▾`)).toBeTruthy();
  });

  it("updates the displayed envelope name when a different envelope is picked", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();

    await fireEvent.press(screen.getByText(`Envelope: ${spendableEnvelope.name} ▾`));
    await fireEvent.press(screen.getByText(groceriesEnvelope.name));

    expect(screen.getByText(`Envelope: ${groceriesEnvelope.name} ▾`)).toBeTruthy();
  });
});

describe("QuickAddForm envelope mode — account field, independent of the envelope", () => {
  it("always shows the account picker, offering every account regardless of the selected envelope", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();

    // Spendable has exactly one linked account (accountA), yet the full account
    // list — including accountB, which Spendable is NOT linked to — is offered.
    await fireEvent.press(screen.getByText(`Account: ${accountA.name} ▾`));

    expect(screen.getByText(accountA.name)).toBeTruthy();
    expect(screen.getByText(accountB.name)).toBeTruthy();
  });

  it("lets the user override the account for a single-account envelope to any other account", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();

    await fireEvent.press(screen.getByText(`Account: ${accountA.name} ▾`));
    await fireEvent.press(screen.getByText(accountB.name));

    expect(screen.getByText(`Account: ${accountB.name} ▾`)).toBeTruthy();
  });

  it("resets to an unpicked account (Save disabled until chosen) for an envelope with >1 linked account", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await fireEvent.press(screen.getByText(`Envelope: ${spendableEnvelope.name} ▾`));
    await fireEvent.press(screen.getByText(groceriesEnvelope.name));

    expect(screen.getByText("Account: Choose account ▾")).toBeTruthy();

    await fillAmountAndDescription("20.00", "Milk");
    expect(screen.getByText("Save")).toBeDisabled();

    await fireEvent.press(screen.getByText("Account: Choose account ▾"));
    await fireEvent.press(screen.getByText(accountB.name));

    expect(screen.getByText(`Account: ${accountB.name} ▾`)).toBeTruthy();
    expect(screen.getByText("Save")).toBeEnabled();
  });

  it("resets a manually-picked account back to the new envelope's own default when the envelope changes", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();

    // Override Spendable's default account to accountB.
    await fireEvent.press(screen.getByText(`Account: ${accountA.name} ▾`));
    await fireEvent.press(screen.getByText(accountB.name));
    expect(screen.getByText(`Account: ${accountB.name} ▾`)).toBeTruthy();

    // Switching envelopes resets the account back to the new envelope's own default —
    // groceriesEnvelope has 2 linked accounts, so there's no single default.
    await fireEvent.press(screen.getByText(`Envelope: ${spendableEnvelope.name} ▾`));
    await fireEvent.press(screen.getByText(groceriesEnvelope.name));

    expect(screen.getByText("Account: Choose account ▾")).toBeTruthy();
  });

  it("keeps Save disabled for an empty description, invalid amount, or unpicked account on a multi-account envelope", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();

    // Empty description.
    await fillAmountAndDescription("20.00", "");
    expect(screen.getByText("Save")).toBeDisabled();

    // Invalid amount shapes.
    for (const amount of ["abc", "0", "0.00", ""]) {
      await fillAmountAndDescription(amount, "Coffee");
      expect(screen.getByText("Save")).toBeDisabled();
    }

    // Multi-account envelope with nothing picked yet.
    await fireEvent.press(screen.getByText(`Envelope: ${spendableEnvelope.name} ▾`));
    await fireEvent.press(screen.getByText(groceriesEnvelope.name));
    await fillAmountAndDescription("20.00", "Milk");
    expect(screen.getByText("Save")).toBeDisabled();
  });
});

describe("QuickAddForm envelope mode — save", () => {
  it("calls ledger.addTransaction.mutate with the exact expected payload, amount negated", async () => {
    const mutate = jest.fn();
    mockAddTransactionUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await fillAmountAndDescription("150.00", "  Coffee  ");

    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    const call = mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).toMatchObject({
      description: "Coffee",
      categoryId: null,
      accountId: accountA.id,
      subEnvelopeId: SPENDABLE_ENVELOPE_ID,
      amount: "-150.00",
    });
    expect(call.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("invalidates BOTH ledger.spendableBalance and ledger.transactions on success (bug fix regression guard)", async () => {
    const invalidateSpendableBalance = jest.fn();
    const invalidateTransactions = jest.fn();
    mockUseUtils.mockReturnValue({
      ledger: {
        spendableBalance: { invalidate: invalidateSpendableBalance },
        transactions: { invalidate: invalidateTransactions },
      },
      cards: { cardPurchases: { invalidate: jest.fn() } },
    });
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();

    const options = mockAddTransactionUseMutation.mock.calls[0]?.[0] as {
      onSuccess: () => void;
    };
    options.onSuccess();

    expect(invalidateSpendableBalance).toHaveBeenCalledTimes(1);
    expect(invalidateTransactions).toHaveBeenCalledTimes(1);
  });
});

describe("QuickAddForm envelope mode — save status", () => {
  it("shows Saving… and disables controls while the mutation is pending", async () => {
    mockAddTransactionUseMutation.mockReturnValue(mockMutationResult({ isPending: true }));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();

    expect(screen.getByText("Saving…")).toBeTruthy();
    expect(screen.getByText("Saving…")).toBeDisabled();
    expect(screen.getByText("Cancel")).toBeDisabled();
    expect(screen.getByPlaceholderText("Amount").props.editable).toBe(false);
    expect(screen.getByPlaceholderText("Description").props.editable).toBe(false);
  });

  it("shows the inline error message when the mutation is in an error state", async () => {
    mockAddTransactionUseMutation.mockReturnValue(mockMutationResult({ isError: true }));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();

    expect(screen.getByText("Couldn't save — try again.")).toBeTruthy();
  });

  it("reverts to collapsed state on Cancel without calling mutate", async () => {
    const mutate = jest.fn();
    mockAddTransactionUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await fillAmountAndDescription("150.00", "Coffee");

    await fireEvent.press(screen.getByText("Cancel"));

    expect(screen.getByText("+ Add")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Amount")).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------
// Card purchase mode
// -------------------------------------------------------------------------

describe("QuickAddForm card mode — credit card selection", () => {
  it("auto-uses the single credit card with no picker shown", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();

    expect(screen.queryByText(/^Card: /)).toBeNull();
  });

  it("shows a picker with 2+ credit cards, and Save stays disabled until one is picked (holding funding satisfied)", async () => {
    mockCreditCardsUseQuery.mockReturnValue(success([singleCreditCard, secondCreditCard]));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();

    expect(screen.getByText("Card: Choose card ▾")).toBeTruthy();

    await fireEvent.press(screen.getByText("Decide later"));
    await fillAmountAndDescription("40.00", "New shoes");
    expect(screen.getByText("Save")).toBeDisabled();

    await fireEvent.press(screen.getByText("Card: Choose card ▾"));
    await fireEvent.press(screen.getByText(secondCreditCard.name));

    expect(screen.getByText(`Card: ${secondCreditCard.name} ▾`)).toBeTruthy();
    expect(screen.getByText("Save")).toBeEnabled();
  });

  it("keeps Save disabled when a card is picked but no funding choice is made yet (holding card satisfied)", async () => {
    mockCreditCardsUseQuery.mockReturnValue(success([singleCreditCard, secondCreditCard]));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();
    await fireEvent.press(screen.getByText("Card: Choose card ▾"));
    await fireEvent.press(screen.getByText(secondCreditCard.name));
    await fillAmountAndDescription("40.00", "New shoes");

    expect(screen.getByText("Save")).toBeDisabled();
  });
});

describe("QuickAddForm card mode — no default funding choice", () => {
  it("keeps Save disabled with valid amount/description/card until a funding option is tapped", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();
    await fillAmountAndDescription("40.00", "New shoes");

    expect(screen.getByText("Save")).toBeDisabled();
  });
});

describe("QuickAddForm card mode — funding choices", () => {
  it("selects Credit Card Budget on tap, showing its selected state, and saves with the reserved envelope id", async () => {
    const mutate = jest.fn();
    mockCreateCardPurchaseUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();

    const ccBudgetOption = screen.getByText(/^From Credit Card Budget/);
    await fireEvent.press(ccBudgetOption);

    expect(ccBudgetOption.props.style).toContainEqual(
      expect.objectContaining({ color: "#ffffff" }),
    );

    await fillAmountAndDescription("40.00", "New shoes");
    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    const call = mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.fundingSource).toEqual({
      kind: "envelope",
      subEnvelopeId: CREDIT_CARD_BUDGET_ENVELOPE_ID,
    });
    expect(call.creditCardId).toBe(singleCreditCard.id);
  });

  it("shows the Credit Card Budget option's label with the formatted balance from subEnvelopeBalance", async () => {
    const balance = centsFromInt(250000);
    mockSubEnvelopeBalanceUseQuery.mockReturnValue(success(balance));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();

    expect(screen.getByText(/^From Credit Card Budget \(.+\)$/)).toBeTruthy();
  });

  it("reveals the envelope picker excluding the reserved Credit Card Budget envelope on 'From another envelope…'", async () => {
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();

    await fireEvent.press(screen.getByText("From another envelope…"));

    expect(screen.getByText(spendableEnvelope.name)).toBeTruthy();
    expect(screen.getByText(groceriesEnvelope.name)).toBeTruthy();
    expect(screen.queryByText(ccBudgetEnvelope.name)).toBeNull();
  });
});

describe("QuickAddForm card mode — other funding choices", () => {
  it("saves with the picked envelope's id when a non-reserved envelope is chosen", async () => {
    const mutate = jest.fn();
    mockCreateCardPurchaseUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();
    await fireEvent.press(screen.getByText("From another envelope…"));
    await fireEvent.press(screen.getByText(groceriesEnvelope.name));
    await fillAmountAndDescription("40.00", "New shoes");

    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    const call = mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.fundingSource).toEqual({
      kind: "envelope",
      subEnvelopeId: groceriesEnvelope.id,
    });
  });

  it("selects Decide later on tap and saves with fundingSource {kind: 'none'}", async () => {
    const mutate = jest.fn();
    mockCreateCardPurchaseUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();
    await fireEvent.press(screen.getByText("Decide later"));
    await fillAmountAndDescription("40.00", "New shoes");

    await fireEvent.press(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledTimes(1);
    const call = mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.fundingSource).toEqual({ kind: "none" });
  });
});

describe("QuickAddForm card mode — save payload and mutation status", () => {
  it("does not negate the amount (unlike envelope mode) — sends it exactly as entered", async () => {
    const mutate = jest.fn();
    mockCreateCardPurchaseUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();
    await fireEvent.press(screen.getByText("Decide later"));
    await fillAmountAndDescription("40.00", "  New shoes  ");

    await fireEvent.press(screen.getByText("Save"));

    const call = mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.amount).toBe("40.00");
    expect(call.description).toBe("New shoes");
    expect(call.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("invalidates ONLY cards.cardPurchases on success — no ledger.* invalidation", async () => {
    const invalidateCardPurchases = jest.fn();
    const invalidateSpendableBalance = jest.fn();
    const invalidateTransactions = jest.fn();
    mockUseUtils.mockReturnValue({
      ledger: {
        spendableBalance: { invalidate: invalidateSpendableBalance },
        transactions: { invalidate: invalidateTransactions },
      },
      cards: { cardPurchases: { invalidate: invalidateCardPurchases } },
    });
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();

    const options = mockCreateCardPurchaseUseMutation.mock.calls[0]?.[0] as {
      onSuccess: () => void;
    };
    options.onSuccess();

    expect(invalidateCardPurchases).toHaveBeenCalledTimes(1);
    expect(invalidateSpendableBalance).not.toHaveBeenCalled();
    expect(invalidateTransactions).not.toHaveBeenCalled();
  });
});

describe("QuickAddForm card mode — save mutation status", () => {
  it("shows Saving… and disables controls while the mutation is pending", async () => {
    mockCreateCardPurchaseUseMutation.mockReturnValue(mockMutationResult({ isPending: true }));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();

    expect(screen.getByText("Saving…")).toBeTruthy();
    expect(screen.getByText("Saving…")).toBeDisabled();
    expect(screen.getByText("Cancel")).toBeDisabled();
    expect(screen.getByPlaceholderText("Amount").props.editable).toBe(false);
    expect(screen.getByPlaceholderText("Description").props.editable).toBe(false);
  });

  it("shows the inline error message when the mutation is in an error state", async () => {
    mockCreateCardPurchaseUseMutation.mockReturnValue(mockMutationResult({ isError: true }));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();

    expect(screen.getByText("Couldn't save — try again.")).toBeTruthy();
  });

  it("reverts to collapsed state on Cancel without calling mutate", async () => {
    const mutate = jest.fn();
    mockCreateCardPurchaseUseMutation.mockReturnValue(mockMutationResult({ mutate }));
    await render(<QuickAddForm subEnvelopes={defaultSubEnvelopes} />);
    await openForm();
    await switchToCardMode();
    await fireEvent.press(screen.getByText("Decide later"));
    await fillAmountAndDescription("40.00", "New shoes");

    await fireEvent.press(screen.getByText("Cancel"));

    expect(screen.getByText("+ Add")).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
  });
});
