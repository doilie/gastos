import {
  formatCents,
  type Account,
  type AccountId,
  type BudgetLine,
  type PaydaySchedule,
  type SubEnvelope,
  type SubEnvelopeId,
} from "@gastos/shared";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { trpc } from "../../lib/trpc";
import { Colors, Radius, Spacing, Typography } from "../../theme";

/** Matches a plain positive decimal like "150" or "150.00" (max 2dp) — a `BudgetLine`
 * amount is always a positive allocation magnitude, never signed. Mirrors
 * `QuickAddForm.tsx`'s own `isValidAmount`/`AMOUNT_SHAPE`. */
const POSITIVE_AMOUNT_SHAPE = /^\d+(\.\d{1,2})?$/;

function isValidPositiveAmount(amount: string): boolean {
  return POSITIVE_AMOUNT_SHAPE.test(amount) && amount !== "0" && amount !== "0.00";
}

/**
 * Budget tab: read-only display of the seeded `PaydaySchedule`s and
 * `BudgetLine`s, plus the "apply" mutation UI on each `BudgetLineRow` —
 * wiring `budget.applyBudgetLine` into the ledger. Mirrors `QuickAddForm`'s
 * collapsed-button → inline-controls → mutate → invalidate pattern.
 *
 * `BudgetLine.isApplied` is real, server-persisted state (not a transient
 * mutation flag) — once a line has been applied, `BudgetLineApplyControls`
 * renders a persistent "Applied" label instead of the Apply
 * button/picker, and this survives navigating away from the tab and back,
 * since it's read straight from the `budget.budgetLines` query rather than
 * a mutation's local `isSuccess`.
 */
export default function BudgetScreen() {
  const paydaySchedules = trpc.budget.paydaySchedules.useQuery();
  const budgetLines = trpc.budget.budgetLines.useQuery();
  const subEnvelopes = trpc.reference.subEnvelopes.useQuery();
  const accounts = trpc.reference.accounts.useQuery();

  const isPending =
    paydaySchedules.isPending ||
    budgetLines.isPending ||
    subEnvelopes.isPending ||
    accounts.isPending;
  const isError =
    paydaySchedules.isError || budgetLines.isError || subEnvelopes.isError || accounts.isError;

  if (isPending) {
    return (
      <View style={styles.container}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Text>Something went wrong.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Budget</Text>
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Payday schedules</Text>
        {paydaySchedules.data.map((schedule) => (
          <PaydayScheduleSummary key={schedule.id} schedule={schedule} />
        ))}
        <AddPaydayScheduleForm />
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Budget lines</Text>
        {budgetLines.data.map((line) => (
          <BudgetLineRow
            key={line.id}
            line={line}
            subEnvelopes={subEnvelopes.data}
            accounts={accounts.data}
          />
        ))}
        <AddBudgetLineForm subEnvelopes={subEnvelopes.data} />
      </View>
    </ScrollView>
  );
}

/** Renders one `PaydaySchedule`'s name plus its configured payday days. */
function PaydayScheduleSummary({ schedule }: { schedule: PaydaySchedule }) {
  const days = schedule.paydayDaysOfMonth.join(", ");
  return (
    <Text style={styles.scheduleText}>
      {schedule.name} — paydays on day {days}
    </Text>
  );
}

/** Resolves an account's display name, falling back to the raw id if unmatched. */
function accountName(accounts: readonly Account[], accountId: AccountId): string {
  return accounts.find((account) => account.id === accountId)?.name ?? accountId;
}

/**
 * Renders one `BudgetLine`: its target sub-envelope's resolved name (falling
 * back to the raw `subEnvelopeId` if no match is found), description,
 * payday date, amount, and the apply-to-ledger controls.
 */
function BudgetLineRow({
  line,
  subEnvelopes,
  accounts,
}: {
  line: BudgetLine;
  subEnvelopes: readonly SubEnvelope[];
  accounts: readonly Account[];
}) {
  const targetSubEnvelope = subEnvelopes.find(
    (subEnvelope) => subEnvelope.id === line.subEnvelopeId,
  );
  const subEnvelopeName = targetSubEnvelope?.name ?? line.subEnvelopeId;
  const candidateAccountIds = targetSubEnvelope?.accountIds ?? [];

  return (
    <View style={styles.rowContainer}>
      <View style={styles.row}>
        <View>
          <Text style={styles.lineSubEnvelope}>{subEnvelopeName}</Text>
          <Text style={styles.lineDescription}>{line.description}</Text>
          <Text style={styles.lineDate}>{line.paydayDate}</Text>
        </View>
        <Text style={styles.lineAmount}>{formatCents(line.amount)}</Text>
      </View>
      <BudgetLineApplyControls
        budgetLineId={line.id}
        candidateAccountIds={candidateAccountIds}
        accounts={accounts}
        isApplied={line.isApplied}
      />
    </View>
  );
}

/**
 * The apply-to-ledger controls for one `BudgetLine` row. When `isApplied` is
 * `true` (real, server-persisted state), renders only a persistent "Applied"
 * label — no button, nothing clickable, since re-applying would now be
 * rejected server-side anyway. Otherwise renders a single "Apply" button
 * when the target sub-envelope has exactly one linked account (or is
 * disabled when it has none), or an inline account picker when it has more
 * than one. On error shows a transient inline message. Split out of
 * `BudgetLineRow` to keep it under the complexity/length caps.
 */
function BudgetLineApplyControls({
  budgetLineId,
  candidateAccountIds,
  accounts,
  isApplied,
}: {
  budgetLineId: string;
  candidateAccountIds: readonly AccountId[];
  accounts: readonly Account[];
  isApplied: boolean;
}) {
  if (isApplied) {
    return (
      <View style={styles.applyContainer}>
        <Text style={styles.appliedLabel}>Applied</Text>
      </View>
    );
  }

  return (
    <PendingApplyControls
      budgetLineId={budgetLineId}
      candidateAccountIds={candidateAccountIds}
      accounts={accounts}
    />
  );
}

/**
 * The not-yet-applied path of `BudgetLineApplyControls`: a single "Apply"
 * button when the target sub-envelope has exactly one linked account (or is
 * disabled when it has none), or an inline account picker when it has more
 * than one, plus a transient error message on failure. Split out to keep
 * `BudgetLineApplyControls` under the length cap.
 */
function PendingApplyControls({
  budgetLineId,
  candidateAccountIds,
  accounts,
}: {
  budgetLineId: string;
  candidateAccountIds: readonly AccountId[];
  accounts: readonly Account[];
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const utils = trpc.useUtils();
  const applyBudgetLine = trpc.budget.applyBudgetLine.useMutation({
    onSuccess: () => {
      void utils.budget.budgetLines.invalidate();
      void utils.ledger.subEnvelopeBalance.invalidate();
      void utils.ledger.transactions.invalidate();
    },
  });

  function applyToAccount(accountId: AccountId) {
    setIsPickerOpen(false);
    applyBudgetLine.mutate({ budgetLineId, accountId });
  }

  function handleApplyPress() {
    const onlyAccountId = candidateAccountIds.length === 1 ? candidateAccountIds[0] : undefined;
    if (onlyAccountId !== undefined) {
      applyToAccount(onlyAccountId);
      return;
    }
    setIsPickerOpen(true);
  }

  return (
    <View style={styles.applyContainer}>
      <Pressable
        style={styles.applyButton}
        disabled={candidateAccountIds.length === 0 || applyBudgetLine.isPending}
        onPress={handleApplyPress}
      >
        <Text style={styles.applyButtonText}>
          {applyBudgetLine.isPending ? "Applying…" : "Apply"}
        </Text>
      </Pressable>
      {isPickerOpen && (
        <AccountPicker
          candidateAccountIds={candidateAccountIds}
          accounts={accounts}
          onPick={applyToAccount}
        />
      )}
      {applyBudgetLine.isError && (
        <Text style={styles.applyError}>Couldn&apos;t apply — try again.</Text>
      )}
    </View>
  );
}

/** Inline list of one Pressable per candidate account, for the multi-account case. */
function AccountPicker({
  candidateAccountIds,
  accounts,
  onPick,
}: {
  candidateAccountIds: readonly AccountId[];
  accounts: readonly Account[];
  onPick: (accountId: AccountId) => void;
}) {
  return (
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
  );
}

// ---------------------------------------------------------------------------
// "+ Add payday schedule" — the Create half of the "Budget CRUD" thread's
// PaydaySchedule side, wiring budget.createPaydaySchedule.
// ---------------------------------------------------------------------------

/** Parses a comma-separated "15, 31" style input into `[15, 31]`, dropping
 * blank segments. Does not validate range/duplicates — `isValidPaydayDaysOfMonth`
 * does that, matching this form's split "parse, then separately validate" shape. */
function parsePaydayDaysOfMonth(raw: string): number[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 10));
}

function isValidPaydayDaysOfMonth(days: readonly number[]): boolean {
  return days.length > 0 && days.every((day) => Number.isInteger(day) && day >= 1 && day <= 31);
}

/** `AddPaydayScheduleForm`'s state/mutation logic, split out to keep the form
 * component under the length cap — mirrors `envelopes.tsx`'s
 * `useAddSubEnvelopeForm`. */
function useAddPaydayScheduleForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [daysInput, setDaysInput] = useState("");
  const utils = trpc.useUtils();
  const createPaydaySchedule = trpc.budget.createPaydaySchedule.useMutation({
    onSuccess: () => {
      void utils.budget.paydaySchedules.invalidate();
      closeForm();
    },
  });

  function closeForm() {
    setIsOpen(false);
    setName("");
    setDaysInput("");
    createPaydaySchedule.reset();
  }

  function handleSave() {
    createPaydaySchedule.mutate({
      name: name.trim(),
      paydayDaysOfMonth: parsePaydayDaysOfMonth(daysInput),
    });
  }

  return { isOpen, setIsOpen, name, setName, daysInput, setDaysInput, createPaydaySchedule, closeForm, handleSave };
}

/** Inline "+ Add payday schedule" form: collapsed to a single button until
 * tapped, mirroring `envelopes.tsx`'s `AddEnvelopeGroupForm` pattern. */
function AddPaydayScheduleForm() {
  const form = useAddPaydayScheduleForm();

  if (!form.isOpen) {
    return (
      <Pressable style={styles.addButton} onPress={() => form.setIsOpen(true)}>
        <Text style={styles.addButtonText}>+ Add payday schedule</Text>
      </Pressable>
    );
  }

  return (
    <AddPaydayScheduleFields
      name={form.name}
      daysInput={form.daysInput}
      canSave={
        form.name.trim().length > 0 &&
        isValidPaydayDaysOfMonth(parsePaydayDaysOfMonth(form.daysInput))
      }
      isPending={form.createPaydaySchedule.isPending}
      isError={form.createPaydaySchedule.isError}
      onNameChange={form.setName}
      onDaysInputChange={form.setDaysInput}
      onCancel={form.closeForm}
      onSave={form.handleSave}
    />
  );
}

/** The revealed `AddPaydayScheduleForm`'s inputs/controls — split out to keep the parent under the line/complexity caps. */
function AddPaydayScheduleFields(props: {
  name: string;
  daysInput: string;
  canSave: boolean;
  isPending: boolean;
  isError: boolean;
  onNameChange: (value: string) => void;
  onDaysInputChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const disabled = props.isPending;
  return (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        placeholder="Name"
        value={props.name}
        editable={!disabled}
        onChangeText={props.onNameChange}
      />
      <TextInput
        style={styles.input}
        placeholder="Payday days of month (e.g. 15, 31)"
        keyboardType="numbers-and-punctuation"
        value={props.daysInput}
        editable={!disabled}
        onChangeText={props.onDaysInputChange}
      />
      {props.isError && <Text style={styles.error}>Couldn&apos;t save — try again.</Text>}
      <FormSaveCancelButtons
        disabled={disabled}
        canSave={props.canSave}
        isPending={props.isPending}
        onCancel={props.onCancel}
        onSave={props.onSave}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// "+ Add budget line" — the Create half of the "Budget CRUD" thread's
// BudgetLine side, wiring budget.createBudgetLine.
// ---------------------------------------------------------------------------

/** `AddBudgetLineForm`'s state/mutation logic, split out to keep the form
 * component under the length cap. `budgetPeriod` is not collected here — the
 * server derives it from `paydayDate` (see `budget.ts`'s `createBudgetLine`). */
function useAddBudgetLineForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [paydayDate, setPaydayDate] = useState("");
  const [subEnvelopeId, setSubEnvelopeId] = useState<SubEnvelopeId | undefined>(undefined);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const utils = trpc.useUtils();
  const createBudgetLine = trpc.budget.createBudgetLine.useMutation({
    onSuccess: () => {
      void utils.budget.budgetLines.invalidate();
      closeForm();
    },
  });

  function closeForm() {
    setIsOpen(false);
    setPaydayDate("");
    setSubEnvelopeId(undefined);
    setIsPickerOpen(false);
    setAmount("");
    setDescription("");
    createBudgetLine.reset();
  }

  function pickSubEnvelope(id: SubEnvelopeId) {
    setSubEnvelopeId(id);
    setIsPickerOpen(false);
  }

  function handleSave() {
    if (subEnvelopeId === undefined) {
      return;
    }
    createBudgetLine.mutate({
      paydayDate: paydayDate.trim(),
      subEnvelopeId,
      amount,
      description: description.trim(),
    });
  }

  return {
    isOpen,
    setIsOpen,
    paydayDate,
    setPaydayDate,
    subEnvelopeId,
    isPickerOpen,
    togglePicker: () => setIsPickerOpen((open) => !open),
    pickSubEnvelope,
    amount,
    setAmount,
    description,
    setDescription,
    createBudgetLine,
    closeForm,
    handleSave,
  };
}

/** Inline "+ Add budget line" form: collapsed to a single button until
 * tapped, mirroring `AddPaydayScheduleForm` above but with an added
 * sub-envelope picker. */
function AddBudgetLineForm({ subEnvelopes }: { subEnvelopes: readonly SubEnvelope[] }) {
  const form = useAddBudgetLineForm();

  if (!form.isOpen) {
    return (
      <Pressable style={styles.addButton} onPress={() => form.setIsOpen(true)}>
        <Text style={styles.addButtonText}>+ Add budget line</Text>
      </Pressable>
    );
  }

  return (
    <AddBudgetLineFields
      subEnvelopes={subEnvelopes}
      paydayDate={form.paydayDate}
      subEnvelopeId={form.subEnvelopeId}
      isPickerOpen={form.isPickerOpen}
      amount={form.amount}
      description={form.description}
      canSave={
        form.paydayDate.trim().length > 0 &&
        form.subEnvelopeId !== undefined &&
        isValidPositiveAmount(form.amount) &&
        form.description.trim().length > 0
      }
      isPending={form.createBudgetLine.isPending}
      isError={form.createBudgetLine.isError}
      onPaydayDateChange={form.setPaydayDate}
      onTogglePicker={form.togglePicker}
      onPickSubEnvelope={form.pickSubEnvelope}
      onAmountChange={form.setAmount}
      onDescriptionChange={form.setDescription}
      onCancel={form.closeForm}
      onSave={form.handleSave}
    />
  );
}

/** Props for `AddBudgetLineFields`, lifted out to a named interface so the function
 * body itself stays under the length cap. */
interface AddBudgetLineFieldsProps {
  subEnvelopes: readonly SubEnvelope[];
  paydayDate: string;
  subEnvelopeId: SubEnvelopeId | undefined;
  isPickerOpen: boolean;
  amount: string;
  description: string;
  canSave: boolean;
  isPending: boolean;
  isError: boolean;
  onPaydayDateChange: (value: string) => void;
  onTogglePicker: () => void;
  onPickSubEnvelope: (id: SubEnvelopeId) => void;
  onAmountChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

/** The revealed `AddBudgetLineForm`'s inputs/controls — split out to keep the parent under the line/complexity caps. */
function AddBudgetLineFields(props: AddBudgetLineFieldsProps) {
  const disabled = props.isPending;
  return (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        placeholder="Payday date (YYYY-MM-DD)"
        value={props.paydayDate}
        editable={!disabled}
        onChangeText={props.onPaydayDateChange}
      />
      <SubEnvelopeFieldControl
        subEnvelopes={props.subEnvelopes}
        selectedSubEnvelopeId={props.subEnvelopeId}
        isOpen={props.isPickerOpen}
        onToggle={props.onTogglePicker}
        onPick={props.onPickSubEnvelope}
      />
      <TextInput
        style={styles.input}
        placeholder="Description"
        value={props.description}
        editable={!disabled}
        onChangeText={props.onDescriptionChange}
      />
      <TextInput
        style={styles.input}
        placeholder="Amount"
        keyboardType="numbers-and-punctuation"
        value={props.amount}
        editable={!disabled}
        onChangeText={props.onAmountChange}
      />
      {props.isError && <Text style={styles.error}>Couldn&apos;t save — try again.</Text>}
      <FormSaveCancelButtons
        disabled={disabled}
        canSave={props.canSave}
        isPending={props.isPending}
        onCancel={props.onCancel}
        onSave={props.onSave}
      />
    </View>
  );
}

/** The Cancel/Save button row shared by `AddPaydayScheduleFields` and
 * `AddBudgetLineFields` — split out once a second "+ Add" form in this file
 * needed the exact same markup, rather than duplicating it a second time. */
function FormSaveCancelButtons(props: {
  disabled: boolean;
  canSave: boolean;
  isPending: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <View style={styles.formButtons}>
      <Pressable style={styles.formButton} disabled={props.disabled} onPress={props.onCancel}>
        <Text>Cancel</Text>
      </Pressable>
      <Pressable
        style={styles.formButton}
        disabled={props.disabled || !props.canSave}
        onPress={props.onSave}
      >
        <Text>{props.isPending ? "Saving…" : "Save"}</Text>
      </Pressable>
    </View>
  );
}

/** "Sub-envelope: {name} ▾" toggle revealing the inline single-select list of every
 * unarchived `SubEnvelope` — mirrors `QuickAddForm.tsx`'s `EnvelopeFieldControl`, but
 * local to this file since no screen shares component code with another. */
function SubEnvelopeFieldControl({
  subEnvelopes,
  selectedSubEnvelopeId,
  isOpen,
  onToggle,
  onPick,
}: {
  subEnvelopes: readonly SubEnvelope[];
  selectedSubEnvelopeId: SubEnvelopeId | undefined;
  isOpen: boolean;
  onToggle: () => void;
  onPick: (id: SubEnvelopeId) => void;
}) {
  const selectedName =
    selectedSubEnvelopeId === undefined
      ? "Choose sub-envelope"
      : (subEnvelopes.find((subEnvelope) => subEnvelope.id === selectedSubEnvelopeId)?.name ??
        selectedSubEnvelopeId);
  return (
    <View style={styles.pickerContainer}>
      <Pressable style={styles.pickerToggle} onPress={onToggle}>
        <Text style={styles.pickerToggleText}>Sub-envelope: {selectedName} ▾</Text>
      </Pressable>
      {isOpen && (
        <View style={styles.picker}>
          {subEnvelopes
            .filter((subEnvelope) => !subEnvelope.isArchived)
            .map((subEnvelope) => (
              <Pressable
                key={subEnvelope.id}
                style={styles.pickerOption}
                onPress={() => onPick(subEnvelope.id)}
              >
                <Text>{subEnvelope.name}</Text>
              </Pressable>
            ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  addButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  addButtonText: {
    ...Typography.body,
    fontWeight: "600",
  },
  form: {
    marginTop: Spacing.sm,
    width: 240,
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
    ...Typography.detail,
    color: Colors.error,
    marginBottom: Spacing.sm,
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
  scrollContent: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  title: {
    ...Typography.titleLarge,
    marginBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeading: {
    ...Typography.heading,
    marginBottom: Spacing.sm,
  },
  scheduleText: {
    ...Typography.body,
    paddingLeft: Spacing.md,
    marginBottom: Spacing.xs,
  },
  rowContainer: {
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lineSubEnvelope: {
    ...Typography.body,
    fontWeight: "600",
  },
  lineDescription: {
    ...Typography.detail,
  },
  lineDate: {
    ...Typography.detail,
    color: Colors.textMuted,
  },
  lineAmount: {
    ...Typography.body,
    fontWeight: "600",
  },
  applyContainer: {
    marginTop: Spacing.sm,
  },
  applyButton: {
    alignSelf: "flex-start",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.default,
  },
  applyButtonText: {
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
  appliedLabel: {
    alignSelf: "flex-start",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    ...Typography.detail,
    fontWeight: "600",
    color: Colors.positive,
  },
  applyError: {
    marginTop: Spacing.xs,
    ...Typography.detail,
    color: Colors.error,
  },
});
