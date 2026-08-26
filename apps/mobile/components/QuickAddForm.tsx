import {
  CREDIT_CARD_BUDGET_ENVELOPE_ID,
  formatCents,
  SPENDABLE_ENVELOPE_ID,
  type Account,
  type AccountId,
  type Cents,
  type CreditCard,
  type SubEnvelope,
  type SubEnvelopeId,
} from "@gastos/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { trpc } from "../lib/trpc";
import { Colors, Radius, Spacing, Typography } from "../theme";

/** Matches a plain non-negative decimal like "150" or "150.00" (max 2dp). Shared by both
 * modes below — an envelope-mode entry and a card-purchase amount are both always a
 * positive magnitude (envelope-mode negates it itself right before mutating). */
const AMOUNT_SHAPE = /^\d+(\.\d{1,2})?$/;

function isValidAmount(amount: string): boolean {
  return AMOUNT_SHAPE.test(amount) && amount !== "0" && amount !== "0.00" && amount !== "";
}

function todayLedgerDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Resolves an account's display name, falling back to the raw id if unmatched — same
 * fallback pattern `budget.tsx`/`cards.tsx`'s own `accountName` use. */
function accountName(accounts: readonly Account[], accountId: AccountId): string {
  return accounts.find((account) => account.id === accountId)?.name ?? accountId;
}

type QuickAddMode = "envelope" | "card";

/**
 * Today tab's unified entry composer: collapsed to a single "+ Add" button until
 * tapped, then reveals a two-way mode toggle — "Envelope" (record a transaction
 * directly against any unarchived envelope, generalizing the old hardcoded-Spendable
 * behavior) or "Card purchase" (record a new `CardPurchase`, optionally funded from an
 * envelope). `subEnvelopes` is the full list (not just Spendable's account) so the
 * envelope-mode picker and Spendable/Credit-Card-Budget id resolution can happen here
 * rather than the caller pre-deriving a single id.
 */
export function QuickAddForm({ subEnvelopes }: { subEnvelopes: readonly SubEnvelope[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<QuickAddMode>("envelope");
  const accounts = trpc.reference.accounts.useQuery();

  function closeForm() {
    setIsOpen(false);
    setMode("envelope");
  }

  if (!isOpen) {
    return (
      <Pressable style={styles.addButton} onPress={() => setIsOpen(true)}>
        <Text style={styles.addButtonText}>+ Add</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.form}>
      <ModeToggle mode={mode} onChange={setMode} />
      {mode === "envelope" ? (
        <EnvelopeModeForm
          subEnvelopes={subEnvelopes}
          accounts={accounts.data ?? []}
          onCancel={closeForm}
          onDone={closeForm}
        />
      ) : (
        <CardModeForm subEnvelopes={subEnvelopes} onCancel={closeForm} onDone={closeForm} />
      )}
    </View>
  );
}

/** The "Envelope" / "Card purchase" segmented mode toggle, defaulting to "Envelope" (the
 * common, fewest-taps path). */
function ModeToggle({
  mode,
  onChange,
}: {
  mode: QuickAddMode;
  onChange: (mode: QuickAddMode) => void;
}) {
  return (
    <View style={styles.modeToggleRow}>
      <Pressable
        style={[styles.modeButton, mode === "envelope" && styles.modeButtonSelected]}
        onPress={() => onChange("envelope")}
      >
        <Text
          style={[styles.modeButtonText, mode === "envelope" && styles.modeButtonTextSelected]}
        >
          Envelope
        </Text>
      </Pressable>
      <Pressable
        style={[styles.modeButton, mode === "card" && styles.modeButtonSelected]}
        onPress={() => onChange("card")}
      >
        <Text style={[styles.modeButtonText, mode === "card" && styles.modeButtonTextSelected]}>
          Card purchase
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Envelope mode
// ---------------------------------------------------------------------------

/**
 * Envelope + funding-account selection state, split out of `useEnvelopeQuickAdd` so
 * neither function trips the length cap. The funding account is a field in its own
 * right, independent of which envelope is picked — the server never requires
 * `accountId` to be one of `subEnvelopeId`'s linked accounts (a `SubEnvelope` can span
 * several), so the picker always offers every account. When the selected envelope has
 * exactly one linked account, `accountId` still defaults to it (zero-extra-taps for
 * the common case), but `pickAccount` can always override that default to any account.
 * Defaults `subEnvelopeId` to Spendable (today's zero-extra-taps behavior).
 */
function useEnvelopeSelection(
  subEnvelopes: readonly SubEnvelope[],
  accounts: readonly Account[],
) {
  const [subEnvelopeId, setSubEnvelopeId] = useState<SubEnvelopeId>(SPENDABLE_ENVELOPE_ID);
  const [isEnvelopePickerOpen, setIsEnvelopePickerOpen] = useState(false);
  const [pickedAccountId, setPickedAccountId] = useState<AccountId | undefined>(undefined);
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false);

  const selectedEnvelope = subEnvelopes.find((subEnvelope) => subEnvelope.id === subEnvelopeId);
  const envelopeAccountIds = selectedEnvelope?.accountIds ?? [];
  const defaultAccountId = envelopeAccountIds.length === 1 ? envelopeAccountIds[0] : undefined;
  const accountId = pickedAccountId ?? defaultAccountId;
  const accountOptionIds = accounts.map((account) => account.id);

  function pickEnvelope(id: SubEnvelopeId) {
    setSubEnvelopeId(id);
    setPickedAccountId(undefined);
    setIsAccountPickerOpen(false);
    setIsEnvelopePickerOpen(false);
  }

  function pickAccount(id: AccountId) {
    setPickedAccountId(id);
    setIsAccountPickerOpen(false);
  }

  return {
    subEnvelopeId,
    accountOptionIds,
    accountId,
    isEnvelopePickerOpen,
    isAccountPickerOpen,
    toggleEnvelopePicker: () => setIsEnvelopePickerOpen((open) => !open),
    toggleAccountPicker: () => setIsAccountPickerOpen((open) => !open),
    pickEnvelope,
    pickAccount,
  };
}

/**
 * Envelope-mode state/mutation logic, split out of `EnvelopeModeForm` so the
 * component itself stays under the length/complexity caps (mirrors `index.tsx`'s
 * `useTransactionEdit` split). Envelope/account selection itself lives in
 * `useEnvelopeSelection` above; this layer adds the amount/description fields and the
 * save mutation on top.
 */
function useEnvelopeQuickAdd(
  subEnvelopes: readonly SubEnvelope[],
  accounts: readonly Account[],
  onDone: () => void,
) {
  const selection = useEnvelopeSelection(subEnvelopes, accounts);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const utils = trpc.useUtils();
  const addTransaction = trpc.ledger.addTransaction.useMutation({
    onSuccess: () => {
      void utils.ledger.spendableBalance.invalidate();
      void utils.ledger.transactions.invalidate();
      onDone();
    },
  });

  function save() {
    if (selection.accountId === undefined) {
      return;
    }
    addTransaction.mutate({
      date: todayLedgerDate(),
      description: description.trim(),
      categoryId: null,
      accountId: selection.accountId,
      subEnvelopeId: selection.subEnvelopeId,
      amount: `-${amount}`,
    });
  }

  return {
    ...selection,
    amount,
    description,
    isPending: addTransaction.isPending,
    isError: addTransaction.isError,
    setAmount,
    setDescription,
    save,
  };
}

/**
 * Envelope mode: pick a target envelope (defaulting to Spendable) and a funding
 * account (defaulting to the envelope's own linked account when it has exactly one,
 * but always overridable to any account — the two fields are independent), then the
 * same amount/description fields the old Spendable-only quick-add used — always
 * recorded as an expense (negated on save), same as before. No income/credit entry
 * here.
 */
function EnvelopeModeForm({
  subEnvelopes,
  accounts,
  onCancel,
  onDone,
}: {
  subEnvelopes: readonly SubEnvelope[];
  accounts: readonly Account[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const state = useEnvelopeQuickAdd(subEnvelopes, accounts, onDone);
  const canSave =
    isValidAmount(state.amount) &&
    state.description.trim().length > 0 &&
    state.accountId !== undefined;

  return (
    <View>
      <EnvelopeFieldControl
        subEnvelopes={subEnvelopes}
        selectedSubEnvelopeId={state.subEnvelopeId}
        isOpen={state.isEnvelopePickerOpen}
        onToggle={state.toggleEnvelopePicker}
        onPick={state.pickEnvelope}
      />
      <AccountFieldControl
        accounts={accounts}
        candidateAccountIds={state.accountOptionIds}
        selectedAccountId={state.accountId}
        isOpen={state.isAccountPickerOpen}
        onToggle={state.toggleAccountPicker}
        onPick={state.pickAccount}
      />
      <QuickAddFields
        amount={state.amount}
        description={state.description}
        canSave={canSave}
        isPending={state.isPending}
        isError={state.isError}
        onAmountChange={state.setAmount}
        onDescriptionChange={state.setDescription}
        onCancel={onCancel}
        onSave={state.save}
      />
    </View>
  );
}

/** "Envelope: {name} ▾" toggle revealing the inline single-select envelope list. */
function EnvelopeFieldControl({
  subEnvelopes,
  selectedSubEnvelopeId,
  isOpen,
  onToggle,
  onPick,
}: {
  subEnvelopes: readonly SubEnvelope[];
  selectedSubEnvelopeId: SubEnvelopeId;
  isOpen: boolean;
  onToggle: () => void;
  onPick: (id: SubEnvelopeId) => void;
}) {
  const selectedName =
    subEnvelopes.find((subEnvelope) => subEnvelope.id === selectedSubEnvelopeId)?.name ??
    selectedSubEnvelopeId;
  return (
    <View style={styles.pickerContainer}>
      <Pressable style={styles.pickerToggle} onPress={onToggle}>
        <Text style={styles.pickerToggleText}>Envelope: {selectedName} ▾</Text>
      </Pressable>
      {isOpen && <EnvelopePickerOptions subEnvelopes={subEnvelopes} onPick={onPick} />}
    </View>
  );
}

/** Inline list of one Pressable per unarchived envelope — the single-select shape both
 * envelope-mode's own picker and card-mode's "another envelope" picker reuse.
 * `excludeSubEnvelopeId` lets card-mode hide the reserved Credit Card Budget envelope
 * (it has its own dedicated one-tap option). */
function EnvelopePickerOptions({
  subEnvelopes,
  excludeSubEnvelopeId,
  onPick,
}: {
  subEnvelopes: readonly SubEnvelope[];
  excludeSubEnvelopeId?: SubEnvelopeId;
  onPick: (id: SubEnvelopeId) => void;
}) {
  const options = subEnvelopes.filter(
    (subEnvelope) => !subEnvelope.isArchived && subEnvelope.id !== excludeSubEnvelopeId,
  );
  return (
    <View style={styles.picker}>
      {options.map((subEnvelope) => (
        <Pressable
          key={subEnvelope.id}
          style={styles.pickerOption}
          onPress={() => onPick(subEnvelope.id)}
        >
          <Text>{subEnvelope.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** "Account: {name} ▾" toggle revealing the inline single-select account list — always
 * shown in envelope mode, offering every account regardless of which envelope is
 * selected (see `useEnvelopeQuickAdd`). */
function AccountFieldControl({
  accounts,
  candidateAccountIds,
  selectedAccountId,
  isOpen,
  onToggle,
  onPick,
}: {
  accounts: readonly Account[];
  candidateAccountIds: readonly AccountId[];
  selectedAccountId: AccountId | undefined;
  isOpen: boolean;
  onToggle: () => void;
  onPick: (id: AccountId) => void;
}) {
  const selectedLabel =
    selectedAccountId === undefined ? "Choose account" : accountName(accounts, selectedAccountId);
  return (
    <View style={styles.pickerContainer}>
      <Pressable style={styles.pickerToggle} onPress={onToggle}>
        <Text style={styles.pickerToggleText}>Account: {selectedLabel} ▾</Text>
      </Pressable>
      {isOpen && (
        <View style={styles.picker}>
          {candidateAccountIds.map((accountId) => (
            <Pressable
              key={accountId}
              style={styles.pickerOption}
              onPress={() => onPick(accountId)}
            >
              <Text>{accountName(accounts, accountId)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Card purchase mode
// ---------------------------------------------------------------------------

/** Which credit card a new `CardPurchase` posts against — auto-resolves when there's
 * exactly one `CreditCard`, otherwise stays `undefined` until `pick` is called. */
function useCreditCardSelection() {
  const creditCards = trpc.cards.creditCards.useQuery();
  const [pickedId, setPickedId] = useState<string | undefined>(undefined);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const candidates: readonly CreditCard[] = creditCards.data ?? [];
  const creditCardId = candidates.length === 1 ? candidates[0]?.id : pickedId;

  function pick(id: string) {
    setPickedId(id);
    setIsPickerOpen(false);
  }

  return { candidates, creditCardId, isPickerOpen, toggle: () => setIsPickerOpen((open) => !open), pick };
}

/** The card-purchase funding choice as tracked by the UI: distinguishes the dedicated
 * "Credit Card Budget" one-tap option from a generic "another envelope" pick, even
 * though both ultimately become the same `{kind: "envelope", subEnvelopeId}` shape
 * `cards.createCardPurchase` expects (see `toFundingSourceInput`). */
type UiFundingSelection =
  | { kind: "ccBudget" }
  | { kind: "envelope"; subEnvelopeId: SubEnvelopeId }
  | { kind: "none" };

/** Converts a `UiFundingSelection` into the `fundingSource` shape
 * `cards.createCardPurchase` accepts. */
function toFundingSourceInput(
  selection: UiFundingSelection,
): { kind: "envelope"; subEnvelopeId: SubEnvelopeId } | { kind: "none" } {
  if (selection.kind === "none") {
    return { kind: "none" };
  }
  const subEnvelopeId =
    selection.kind === "ccBudget" ? CREDIT_CARD_BUDGET_ENVELOPE_ID : selection.subEnvelopeId;
  return { kind: "envelope", subEnvelopeId };
}

/** No default funding choice — Save stays disabled until the user picks one, since
 * pre-selecting "Decide later" could mislead the user into thinking it's a neutral
 * no-op default when it's actually a real product decision. */
function useFundingChoice() {
  const [selection, setSelection] = useState<UiFundingSelection | undefined>(undefined);
  const [isEnvelopePickerOpen, setIsEnvelopePickerOpen] = useState(false);

  function chooseCcBudget() {
    setSelection({ kind: "ccBudget" });
    setIsEnvelopePickerOpen(false);
  }

  function chooseNone() {
    setSelection({ kind: "none" });
    setIsEnvelopePickerOpen(false);
  }

  function chooseEnvelope(subEnvelopeId: SubEnvelopeId) {
    setSelection({ kind: "envelope", subEnvelopeId });
    setIsEnvelopePickerOpen(false);
  }

  return {
    selection,
    isEnvelopePickerOpen,
    toggleEnvelopePicker: () => setIsEnvelopePickerOpen((open) => !open),
    chooseCcBudget,
    chooseNone,
    chooseEnvelope,
  };
}

/**
 * Card-purchase mode's amount/description state, `createCardPurchase` mutation, and
 * save/validation logic — split out of `CardModeForm` so it stays under the
 * length/complexity caps (mirrors the envelope-mode `useEnvelopeQuickAdd` split).
 * Takes the already-resolved `creditCardId`/funding `selection` as parameters rather
 * than the whole `useCreditCardSelection`/`useFundingChoice` hook results, since it
 * only needs their resolved values, not their picker-toggle state.
 */
function useCardPurchaseSave(
  creditCardId: string | undefined,
  selection: UiFundingSelection | undefined,
  onDone: () => void,
) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const utils = trpc.useUtils();
  const createCardPurchase = trpc.cards.createCardPurchase.useMutation({
    onSuccess: () => {
      void utils.cards.cardPurchases.invalidate();
      onDone();
    },
  });

  function save() {
    if (creditCardId === undefined || selection === undefined) {
      return;
    }
    createCardPurchase.mutate({
      creditCardId,
      date: todayLedgerDate(),
      description: description.trim(),
      amount,
      fundingSource: toFundingSourceInput(selection),
    });
  }

  const canSave =
    isValidAmount(amount) &&
    description.trim().length > 0 &&
    creditCardId !== undefined &&
    selection !== undefined;

  return {
    amount,
    description,
    canSave,
    isPending: createCardPurchase.isPending,
    isError: createCardPurchase.isError,
    setAmount,
    setDescription,
    save,
  };
}

/**
 * Card-purchase mode: pick which credit card (auto-resolved when there's only one),
 * an amount/description (always a positive magnitude — no negation, unlike envelope
 * mode), and exactly one funding choice (Credit Card Budget / another envelope /
 * decide later). On save, posts a `CardPurchase` record only — no ledger `Transaction`
 * (matches `cards.createCardPurchase`'s own documented non-goal).
 */
function CardModeForm({
  subEnvelopes,
  onCancel,
  onDone,
}: {
  subEnvelopes: readonly SubEnvelope[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const cardSelection = useCreditCardSelection();
  const funding = useFundingChoice();
  const ccBudgetBalance = trpc.ledger.subEnvelopeBalance.useQuery({
    subEnvelopeId: CREDIT_CARD_BUDGET_ENVELOPE_ID,
  });
  const purchase = useCardPurchaseSave(cardSelection.creditCardId, funding.selection, onDone);

  return (
    <View>
      {cardSelection.candidates.length > 1 && (
        <CreditCardFieldControl
          candidates={cardSelection.candidates}
          selectedCreditCardId={cardSelection.creditCardId}
          isOpen={cardSelection.isPickerOpen}
          onToggle={cardSelection.toggle}
          onPick={cardSelection.pick}
        />
      )}
      <FundingChoiceControls
        subEnvelopes={subEnvelopes}
        selection={funding.selection}
        ccBudgetBalance={ccBudgetBalance.data}
        isEnvelopePickerOpen={funding.isEnvelopePickerOpen}
        onChooseCcBudget={funding.chooseCcBudget}
        onChooseNone={funding.chooseNone}
        onChooseEnvelope={funding.chooseEnvelope}
        onToggleEnvelopePicker={funding.toggleEnvelopePicker}
      />
      <QuickAddFields
        amount={purchase.amount}
        description={purchase.description}
        canSave={purchase.canSave}
        isPending={purchase.isPending}
        isError={purchase.isError}
        onAmountChange={purchase.setAmount}
        onDescriptionChange={purchase.setDescription}
        onCancel={onCancel}
        onSave={purchase.save}
      />
    </View>
  );
}

/** "Card: {name} ▾" toggle revealing the inline single-select credit-card list, shown
 * only when there's more than one `CreditCard` to choose from. */
function CreditCardFieldControl({
  candidates,
  selectedCreditCardId,
  isOpen,
  onToggle,
  onPick,
}: {
  candidates: readonly CreditCard[];
  selectedCreditCardId: string | undefined;
  isOpen: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
}) {
  const selectedName =
    candidates.find((card) => card.id === selectedCreditCardId)?.name ?? "Choose card";
  return (
    <View style={styles.pickerContainer}>
      <Pressable style={styles.pickerToggle} onPress={onToggle}>
        <Text style={styles.pickerToggleText}>Card: {selectedName} ▾</Text>
      </Pressable>
      {isOpen && (
        <View style={styles.picker}>
          {candidates.map((card) => (
            <Pressable key={card.id} style={styles.pickerOption} onPress={() => onPick(card.id)}>
              <Text>{card.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** Resolves the "From another envelope…" option's label to the picked envelope's name
 * once one is chosen (falling back to the raw id if unmatched), or `undefined` while
 * nothing (or a different option) is selected. */
function anotherEnvelopeName(
  subEnvelopes: readonly SubEnvelope[],
  selection: UiFundingSelection | undefined,
): string | undefined {
  if (selection?.kind !== "envelope") {
    return undefined;
  }
  return (
    subEnvelopes.find((subEnvelope) => subEnvelope.id === selection.subEnvelopeId)?.name ??
    selection.subEnvelopeId
  );
}

/** The three funding-choice options for card-purchase mode: one-tap "From Credit Card
 * Budget" (shows its current balance), "From another envelope…" (reveals the shared
 * `EnvelopePickerOptions` list, excluding the reserved Credit Card Budget envelope
 * itself), and one-tap "Decide later". */
function FundingChoiceControls({
  subEnvelopes,
  selection,
  ccBudgetBalance,
  isEnvelopePickerOpen,
  onChooseCcBudget,
  onChooseNone,
  onChooseEnvelope,
  onToggleEnvelopePicker,
}: {
  subEnvelopes: readonly SubEnvelope[];
  selection: UiFundingSelection | undefined;
  ccBudgetBalance: Cents | undefined;
  isEnvelopePickerOpen: boolean;
  onChooseCcBudget: () => void;
  onChooseNone: () => void;
  onChooseEnvelope: (id: SubEnvelopeId) => void;
  onToggleEnvelopePicker: () => void;
}) {
  const anotherEnvelopeLabel = anotherEnvelopeName(subEnvelopes, selection);
  const ccBudgetLabel = `From Credit Card Budget${
    ccBudgetBalance === undefined ? "" : ` (${formatCents(ccBudgetBalance)})`
  }`;

  return (
    <View style={styles.fundingContainer}>
      <Text style={styles.fundingLabel}>Fund with:</Text>
      <FundingOption
        label={ccBudgetLabel}
        isSelected={selection?.kind === "ccBudget"}
        onPress={onChooseCcBudget}
      />
      <FundingOption
        label={
          anotherEnvelopeLabel === undefined
            ? "From another envelope…"
            : `From another envelope: ${anotherEnvelopeLabel}`
        }
        isSelected={selection?.kind === "envelope"}
        onPress={onToggleEnvelopePicker}
      />
      {isEnvelopePickerOpen && (
        <EnvelopePickerOptions
          subEnvelopes={subEnvelopes}
          excludeSubEnvelopeId={CREDIT_CARD_BUDGET_ENVELOPE_ID}
          onPick={onChooseEnvelope}
        />
      )}
      <FundingOption
        label="Decide later"
        isSelected={selection?.kind === "none"}
        onPress={onChooseNone}
      />
    </View>
  );
}

/** One funding-choice row: a `Pressable` that highlights itself when selected. */
function FundingOption({
  label,
  isSelected,
  onPress,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.fundingOption, isSelected && styles.fundingOptionSelected]}
      onPress={onPress}
    >
      <Text style={[styles.fundingOptionText, isSelected && styles.fundingOptionTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Shared amount/description fields + footer
// ---------------------------------------------------------------------------

/** The revealed form's amount/description inputs and Cancel/Save footer — shared by
 * both modes, split out to keep each mode's form component under the line/complexity
 * caps. */
function QuickAddFields(props: {
  amount: string;
  description: string;
  canSave: boolean;
  isPending: boolean;
  isError: boolean;
  onAmountChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const disabled = props.isPending;
  return (
    <View style={styles.fields}>
      <TextInput
        style={styles.input}
        placeholder="Amount"
        keyboardType="decimal-pad"
        value={props.amount}
        editable={!disabled}
        onChangeText={props.onAmountChange}
      />
      <TextInput
        style={styles.input}
        placeholder="Description"
        value={props.description}
        editable={!disabled}
        onChangeText={props.onDescriptionChange}
      />
      {props.isError && <Text style={styles.error}>Couldn&apos;t save — try again.</Text>}
      <View style={styles.formButtons}>
        <Pressable style={styles.formButton} disabled={disabled} onPress={props.onCancel}>
          <Text>Cancel</Text>
        </Pressable>
        <Pressable
          style={styles.formButton}
          disabled={disabled || !props.canSave}
          onPress={props.onSave}
        >
          <Text>{props.isPending ? "Saving…" : "Save"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  addButtonText: {
    ...Typography.body,
    fontWeight: "600",
  },
  form: {
    marginTop: Spacing.lg,
    width: 260,
  },
  modeToggleRow: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  modeButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeButtonSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  modeButtonText: {
    ...Typography.detail,
    fontWeight: "600",
    textAlign: "center",
  },
  modeButtonTextSelected: {
    color: "#ffffff",
  },
  fields: {
    marginTop: Spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.default,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
    ...Typography.body,
  },
  formButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  formButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  error: {
    color: Colors.error,
    marginBottom: Spacing.sm,
    ...Typography.detail,
  },
  pickerContainer: {
    marginBottom: Spacing.sm,
  },
  pickerToggle: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.default,
    alignSelf: "flex-start",
  },
  pickerToggleText: {
    ...Typography.detail,
    fontWeight: "600",
  },
  picker: {
    marginTop: Spacing.xs,
  },
  pickerOption: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  fundingContainer: {
    marginBottom: Spacing.sm,
  },
  fundingLabel: {
    ...Typography.detail,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  fundingOption: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.default,
    marginBottom: Spacing.xs,
    alignSelf: "flex-start",
  },
  fundingOptionSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  fundingOptionText: {
    ...Typography.detail,
    fontWeight: "600",
  },
  fundingOptionTextSelected: {
    color: "#ffffff",
  },
});
