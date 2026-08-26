import {
  formatCents,
  paydaysInMonth,
  type Account,
  type AccountId,
  type BudgetLine,
  type PaydaySchedule,
  type PaydayScheduleId,
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
          <PaydayScheduleRow key={schedule.id} schedule={schedule} />
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
        <AddBudgetLineForm subEnvelopes={subEnvelopes.data} paydaySchedules={paydaySchedules.data} />
      </View>
    </ScrollView>
  );
}

/** `PaydayScheduleRow`'s edit state and `updatePaydaySchedule` mutation — split into
 * its own hook so the row component itself stays under the line/complexity caps,
 * mirroring `more.tsx`'s `useAccountEdit`. `dayInput` round-trips through the same
 * single-day text shape `AddPaydayScheduleForm` uses (a schedule always has exactly
 * one payday day-of-month). */
function usePaydayScheduleEdit(schedule: PaydaySchedule) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(schedule.name);
  const [dayInput, setDayInput] = useState(schedule.paydayDaysOfMonth.join(", "));
  const utils = trpc.useUtils();
  const updatePaydaySchedule = trpc.budget.updatePaydaySchedule.useMutation({
    onSuccess: () => {
      void utils.budget.paydaySchedules.invalidate();
      setIsEditing(false);
    },
  });

  function resetFields() {
    setName(schedule.name);
    setDayInput(schedule.paydayDaysOfMonth.join(", "));
  }

  function startEdit() {
    resetFields();
    updatePaydaySchedule.reset();
    setIsEditing(true);
  }

  function cancelEdit() {
    resetFields();
    updatePaydaySchedule.reset();
    setIsEditing(false);
  }

  function handleSave() {
    updatePaydaySchedule.mutate({
      id: schedule.id,
      name: name.trim(),
      paydayDaysOfMonth: parsePaydayDayInput(dayInput),
    });
  }

  return {
    isEditing,
    name,
    setName,
    dayInput,
    setDayInput,
    updatePaydaySchedule,
    startEdit,
    cancelEdit,
    handleSave,
  };
}

/**
 * One `PaydaySchedule` row: read-only display (name plus configured payday days) with
 * an "Edit" control that reveals `AddPaydayScheduleFields` pre-filled — reusing that
 * same fields component rather than duplicating it, since create and edit need the
 * exact same name/days inputs.
 */
/** `PaydayScheduleRow`'s delete-confirmation state and `deletePaydaySchedule` mutation
 * — split into its own hook, mirroring `index.tsx`'s `useTransactionDelete`.
 * `deletePaydaySchedule` is an unconditional hard delete (Increment 72) with no
 * meaningful specific rejection reason, so no server error passthrough is needed. */
function usePaydayScheduleDelete(schedule: PaydaySchedule) {
  const [isConfirming, setIsConfirming] = useState(false);
  const utils = trpc.useUtils();
  const deletePaydaySchedule = trpc.budget.deletePaydaySchedule.useMutation({
    onSuccess: () => void utils.budget.paydaySchedules.invalidate(),
  });

  function startDelete() {
    deletePaydaySchedule.reset();
    setIsConfirming(true);
  }

  function cancelDelete() {
    deletePaydaySchedule.reset();
    setIsConfirming(false);
  }

  function confirmDelete() {
    deletePaydaySchedule.mutate({ id: schedule.id });
  }

  return {
    isConfirming,
    isPending: deletePaydaySchedule.isPending,
    isError: deletePaydaySchedule.isError,
    startDelete,
    cancelDelete,
    confirmDelete,
  };
}

/** `PaydayScheduleRow`'s "Set primary" state and `setPaydaySchedulePrimary` mutation —
 * split into its own hook, mirroring `usePaydayScheduleDelete` above. The server
 * mutation itself handles unmarking whichever schedule was previously primary
 * (Increment 75), so this hook only ever needs to fire one `mutate` call. */
function usePaydaySchedulePrimary(schedule: PaydaySchedule) {
  const utils = trpc.useUtils();
  const setPaydaySchedulePrimary = trpc.budget.setPaydaySchedulePrimary.useMutation({
    onSuccess: () => void utils.budget.paydaySchedules.invalidate(),
  });

  return {
    isPending: setPaydaySchedulePrimary.isPending,
    isError: setPaydaySchedulePrimary.isError,
    setPrimary: () => setPaydaySchedulePrimary.mutate({ id: schedule.id }),
  };
}

function PaydayScheduleRow({ schedule }: { schedule: PaydaySchedule }) {
  const edit = usePaydayScheduleEdit(schedule);
  const del = usePaydayScheduleDelete(schedule);
  const primary = usePaydaySchedulePrimary(schedule);

  if (edit.isEditing) {
    return (
      <AddPaydayScheduleFields
        name={edit.name}
        dayInput={edit.dayInput}
        canSave={
          edit.name.trim().length > 0 &&
          isValidPaydayDaysOfMonth(parsePaydayDayInput(edit.dayInput))
        }
        isPending={edit.updatePaydaySchedule.isPending}
        isError={edit.updatePaydaySchedule.isError}
        onNameChange={edit.setName}
        onDayInputChange={edit.setDayInput}
        onCancel={edit.cancelEdit}
        onSave={edit.handleSave}
      />
    );
  }

  return (
    <PaydayScheduleRowDisplay
      schedule={schedule}
      isConfirmingDelete={del.isConfirming}
      isDeletePending={del.isPending}
      isDeleteError={del.isError}
      onEdit={edit.startEdit}
      onStartDelete={del.startDelete}
      onCancelDelete={del.cancelDelete}
      onConfirmDelete={del.confirmDelete}
      isPrimaryPending={primary.isPending}
      isPrimaryError={primary.isError}
      onSetPrimary={primary.setPrimary}
    />
  );
}

/** Props for `PaydayScheduleRowDisplay`, lifted out to a named interface so the
 * function body itself stays under the length cap. */
interface PaydayScheduleRowDisplayProps {
  schedule: PaydaySchedule;
  isConfirmingDelete: boolean;
  isDeletePending: boolean;
  isDeleteError: boolean;
  onEdit: () => void;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  isPrimaryPending: boolean;
  isPrimaryError: boolean;
  onSetPrimary: () => void;
}

/** `PaydayScheduleRow`'s non-editing display: name/days (plus a "(primary)" suffix
 * when applicable) and Edit/Delete/"Set primary" controls with an inline delete
 * confirmation — split out to keep `PaydayScheduleRow` under the line/complexity
 * caps, mirroring `index.tsx`'s `TransactionRowDisplay`. "Set primary" is hidden
 * once already primary, the same "no button once true" pattern
 * `BudgetLineApplyControls`'s `isApplied` label already uses. */
function PaydayScheduleRowDisplay(props: PaydayScheduleRowDisplayProps) {
  const { schedule } = props;
  const rowActionsDisabled =
    props.isConfirmingDelete || props.isDeletePending || props.isPrimaryPending;
  return (
    <View>
      <View style={styles.scheduleRow}>
        <Text style={styles.scheduleText}>
          {schedule.name} — payday on day {schedule.paydayDaysOfMonth.join(", ")}
          {schedule.isPrimary ? " (primary)" : ""}
        </Text>
        <View style={styles.rowButtons}>
          {!schedule.isPrimary && (
            <Pressable
              style={styles.editButton}
              disabled={rowActionsDisabled}
              onPress={props.onSetPrimary}
            >
              <Text style={styles.editButtonText}>Set primary</Text>
            </Pressable>
          )}
          <Pressable style={styles.editButton} disabled={rowActionsDisabled} onPress={props.onEdit}>
            <Text style={styles.editButtonText}>Edit</Text>
          </Pressable>
          <Pressable
            style={styles.editButton}
            disabled={rowActionsDisabled}
            onPress={props.onStartDelete}
          >
            <Text style={styles.editButtonText}>Delete</Text>
          </Pressable>
        </View>
      </View>
      {props.isPrimaryError && <Text style={styles.error}>Couldn&apos;t update — try again.</Text>}
      {props.isDeleteError && <Text style={styles.error}>Couldn&apos;t delete — try again.</Text>}
      {props.isConfirmingDelete && (
        <DeleteConfirm
          message="Delete this payday schedule?"
          isPending={props.isDeletePending}
          onCancel={props.onCancelDelete}
          onConfirm={props.onConfirmDelete}
        />
      )}
    </View>
  );
}

/** Inline "Delete this X?" confirmation, shared by `PaydayScheduleRow` and
 * `BudgetLineRow`'s delete flows, mirroring `index.tsx`'s `TransactionDeleteConfirm`.
 * Neither underlying mutation can produce a meaningful specific rejection reason
 * (both are unconditional hard deletes — Increment 72), so no server error
 * passthrough is needed here; the generic fallback is shown by the caller. */
function DeleteConfirm({
  message,
  isPending,
  onCancel,
  onConfirm,
}: {
  message: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.form}>
      <Text>{message}</Text>
      <View style={styles.formButtons}>
        <Pressable style={styles.formButton} disabled={isPending} onPress={onCancel}>
          <Text>Cancel</Text>
        </Pressable>
        <Pressable style={styles.formButton} disabled={isPending} onPress={onConfirm}>
          <Text>{isPending ? "Deleting…" : "Confirm"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Resolves an account's display name, falling back to the raw id if unmatched. */
function accountName(accounts: readonly Account[], accountId: AccountId): string {
  return accounts.find((account) => account.id === accountId)?.name ?? accountId;
}

/**
 * A `SubEnvelopeId` single-select's toggle-open/pick state, always starting from a
 * concrete (never-undefined) id — split out of `useBudgetLineEdit` purely to keep it
 * under the length cap; distinct from `useAddBudgetLineForm`'s own inline version,
 * which starts `undefined` (no default) and would gain little from sharing this.
 */
function useSubEnvelopePickerState(initialId: SubEnvelopeId) {
  const [subEnvelopeId, setSubEnvelopeId] = useState(initialId);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  function reset(id: SubEnvelopeId) {
    setSubEnvelopeId(id);
    setIsPickerOpen(false);
  }

  return {
    subEnvelopeId,
    isPickerOpen,
    togglePicker: () => setIsPickerOpen((open) => !open),
    pick: reset,
    reset,
  };
}

/**
 * `BudgetLineRow`'s edit state and `updateBudgetLine` mutation — split into its own
 * hook so the row component itself stays under the line/complexity caps, mirroring
 * `usePaydayScheduleEdit` above. Server-side, `updateBudgetLine` rejects editing an
 * already-applied line (Increment 70), so this hook is never invoked once
 * `line.isApplied` is `true` — `BudgetLineRow` doesn't even offer an Edit control
 * in that case.
 */
function useBudgetLineEdit(line: BudgetLine) {
  const [isEditing, setIsEditing] = useState(false);
  const [paydayDate, setPaydayDate] = useState<string>(line.paydayDate);
  const picker = useSubEnvelopePickerState(line.subEnvelopeId);
  const [amount, setAmount] = useState(formatCents(line.amount));
  const [description, setDescription] = useState(line.description);
  const utils = trpc.useUtils();
  const updateBudgetLine = trpc.budget.updateBudgetLine.useMutation({
    onSuccess: () => {
      void utils.budget.budgetLines.invalidate();
      setIsEditing(false);
    },
  });

  function resetFields() {
    setPaydayDate(line.paydayDate);
    picker.reset(line.subEnvelopeId);
    setAmount(formatCents(line.amount));
    setDescription(line.description);
  }

  function startEdit() {
    resetFields();
    updateBudgetLine.reset();
    setIsEditing(true);
  }

  function cancelEdit() {
    resetFields();
    updateBudgetLine.reset();
    setIsEditing(false);
  }

  function handleSave() {
    updateBudgetLine.mutate({
      id: line.id,
      paydayDate: paydayDate.trim(),
      subEnvelopeId: picker.subEnvelopeId,
      amount,
      description: description.trim(),
    });
  }

  return {
    isEditing,
    paydayDate,
    setPaydayDate,
    subEnvelopeId: picker.subEnvelopeId,
    isPickerOpen: picker.isPickerOpen,
    togglePicker: picker.togglePicker,
    pickSubEnvelope: picker.pick,
    amount,
    setAmount,
    description,
    setDescription,
    updateBudgetLine,
    startEdit,
    cancelEdit,
    handleSave,
  };
}

/** `BudgetLineRow`'s delete-confirmation state and `deleteBudgetLine` mutation — split
 * into its own hook, mirroring `usePaydayScheduleDelete` above. Unlike
 * `useBudgetLineEdit`, deleting an already-applied line is allowed server-side
 * (Increment 72), so this hook (and the Delete control that uses it) is never
 * gated on `line.isApplied`. */
function useBudgetLineDelete(line: BudgetLine) {
  const [isConfirming, setIsConfirming] = useState(false);
  const utils = trpc.useUtils();
  const deleteBudgetLine = trpc.budget.deleteBudgetLine.useMutation({
    onSuccess: () => void utils.budget.budgetLines.invalidate(),
  });

  function startDelete() {
    deleteBudgetLine.reset();
    setIsConfirming(true);
  }

  function cancelDelete() {
    deleteBudgetLine.reset();
    setIsConfirming(false);
  }

  function confirmDelete() {
    deleteBudgetLine.mutate({ id: line.id });
  }

  return {
    isConfirming,
    isPending: deleteBudgetLine.isPending,
    isError: deleteBudgetLine.isError,
    startDelete,
    cancelDelete,
    confirmDelete,
  };
}

/**
 * Renders one `BudgetLine`: its target sub-envelope's resolved name (falling
 * back to the raw `subEnvelopeId` if no match is found), description,
 * payday date, amount, an Edit control (revealing `BudgetLineEditFields`
 * pre-filled — hidden once `isApplied`, since the server would reject the
 * mutation anyway), and the apply-to-ledger controls.
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
  const edit = useBudgetLineEdit(line);
  const del = useBudgetLineDelete(line);
  const targetSubEnvelope = subEnvelopes.find(
    (subEnvelope) => subEnvelope.id === line.subEnvelopeId,
  );
  const subEnvelopeName = targetSubEnvelope?.name ?? line.subEnvelopeId;
  const candidateAccountIds = targetSubEnvelope?.accountIds ?? [];

  if (edit.isEditing) {
    return (
      <BudgetLineEditFields
        subEnvelopes={subEnvelopes}
        paydayDate={edit.paydayDate}
        subEnvelopeId={edit.subEnvelopeId}
        isPickerOpen={edit.isPickerOpen}
        amount={edit.amount}
        description={edit.description}
        canSave={
          edit.paydayDate.trim().length > 0 &&
          isValidPositiveAmount(edit.amount) &&
          edit.description.trim().length > 0
        }
        isPending={edit.updateBudgetLine.isPending}
        isError={edit.updateBudgetLine.isError}
        onPaydayDateChange={edit.setPaydayDate}
        onTogglePicker={edit.togglePicker}
        onPickSubEnvelope={edit.pickSubEnvelope}
        onAmountChange={edit.setAmount}
        onDescriptionChange={edit.setDescription}
        onCancel={edit.cancelEdit}
        onSave={edit.handleSave}
      />
    );
  }

  return (
    <BudgetLineRowDisplay
      line={line}
      subEnvelopeName={subEnvelopeName}
      candidateAccountIds={candidateAccountIds}
      accounts={accounts}
      onEdit={edit.startEdit}
      isConfirmingDelete={del.isConfirming}
      isDeletePending={del.isPending}
      isDeleteError={del.isError}
      onStartDelete={del.startDelete}
      onCancelDelete={del.cancelDelete}
      onConfirmDelete={del.confirmDelete}
    />
  );
}

/** Props for `BudgetLineRowDisplay`, lifted out to a named interface so the function
 * body itself stays under the length cap. */
interface BudgetLineRowDisplayProps {
  line: BudgetLine;
  subEnvelopeName: string;
  candidateAccountIds: readonly AccountId[];
  accounts: readonly Account[];
  onEdit: () => void;
  isConfirmingDelete: boolean;
  isDeletePending: boolean;
  isDeleteError: boolean;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

/** `BudgetLineRow`'s non-editing display — split out to keep `BudgetLineRow` under
 * the line/complexity caps, mirroring `more.tsx`'s `AccountRowDisplay`. The Delete
 * control (unlike Edit) is always shown, even for an already-applied line — deleting
 * one is allowed server-side (Increment 72). */
function BudgetLineRowDisplay(props: BudgetLineRowDisplayProps) {
  const { line } = props;
  const rowActionsDisabled = props.isConfirmingDelete || props.isDeletePending;
  return (
    <View style={styles.rowContainer}>
      <View style={styles.row}>
        <View>
          <Text style={styles.lineSubEnvelope}>{props.subEnvelopeName}</Text>
          <Text style={styles.lineDescription}>{line.description}</Text>
          <Text style={styles.lineDate}>{line.paydayDate}</Text>
        </View>
        <View style={styles.rowButtons}>
          <Text style={styles.lineAmount}>{formatCents(line.amount)}</Text>
          {!line.isApplied && (
            <Pressable style={styles.editButton} disabled={rowActionsDisabled} onPress={props.onEdit}>
              <Text style={styles.editButtonText}>Edit</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.editButton}
            disabled={rowActionsDisabled}
            onPress={props.onStartDelete}
          >
            <Text style={styles.editButtonText}>Delete</Text>
          </Pressable>
        </View>
      </View>
      {props.isDeleteError && <Text style={styles.error}>Couldn&apos;t delete — try again.</Text>}
      {props.isConfirmingDelete && (
        <DeleteConfirm
          message="Delete this budget line?"
          isPending={props.isDeletePending}
          onCancel={props.onCancelDelete}
          onConfirm={props.onConfirmDelete}
        />
      )}
      <BudgetLineApplyControls
        budgetLineId={line.id}
        candidateAccountIds={props.candidateAccountIds}
        accounts={props.accounts}
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

/** Parses a single day-of-month input like "15" into `[15]` (or `[]` for a blank/
 * unparseable input), matching `budget.createPaydaySchedule`/`updatePaydaySchedule`'s
 * `paydayDaysOfMonth` array shape — kept as a single-element array, not a scalar,
 * purely to match that server-side shape (see `payday-schedule.ts`'s own doc comment
 * on `paydayDaysOfMonth` for why the array shape itself is kept). A `PaydaySchedule`
 * always has exactly one payday day — a second payday in the same month is a
 * separate schedule, not a second value here. Does not validate range —
 * `isValidPaydayDaysOfMonth` does that. */
function parsePaydayDayInput(raw: string): number[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? [] : [parsed];
}

function isValidPaydayDaysOfMonth(days: readonly number[]): boolean {
  const [day] = days;
  return day !== undefined && Number.isInteger(day) && day >= 1 && day <= 31;
}

/** `AddPaydayScheduleForm`'s state/mutation logic, split out to keep the form
 * component under the length cap — mirrors `envelopes.tsx`'s
 * `useAddSubEnvelopeForm`. */
function useAddPaydayScheduleForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [dayInput, setDayInput] = useState("");
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
    setDayInput("");
    createPaydaySchedule.reset();
  }

  function handleSave() {
    createPaydaySchedule.mutate({
      name: name.trim(),
      paydayDaysOfMonth: parsePaydayDayInput(dayInput),
    });
  }

  return { isOpen, setIsOpen, name, setName, dayInput, setDayInput, createPaydaySchedule, closeForm, handleSave };
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
      dayInput={form.dayInput}
      canSave={
        form.name.trim().length > 0 &&
        isValidPaydayDaysOfMonth(parsePaydayDayInput(form.dayInput))
      }
      isPending={form.createPaydaySchedule.isPending}
      isError={form.createPaydaySchedule.isError}
      onNameChange={form.setName}
      onDayInputChange={form.setDayInput}
      onCancel={form.closeForm}
      onSave={form.handleSave}
    />
  );
}

/** The revealed `AddPaydayScheduleForm`'s inputs/controls — split out to keep the parent under the line/complexity caps. */
function AddPaydayScheduleFields(props: {
  name: string;
  dayInput: string;
  canSave: boolean;
  isPending: boolean;
  isError: boolean;
  onNameChange: (value: string) => void;
  onDayInputChange: (value: string) => void;
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
        placeholder="Payday day of month (1-31)"
        keyboardType="number-pad"
        value={props.dayInput}
        editable={!disabled}
        onChangeText={props.onDayInputChange}
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
// BudgetLine side, wiring budget.createBudgetLine. Increment 74 replaces the
// original free-typed payday-date input with a picker: choose a named
// `PaydaySchedule`, then choose one of ITS actual computed payday dates
// (via `paydaysInMonth`) — not an arbitrary typed date, and not implicitly
// "whichever schedule happens to be first" the way `index.tsx`'s Today tab
// still does. Editing an existing `BudgetLine` (`BudgetLineEditFields` below)
// deliberately keeps the old free-text field instead: a `BudgetLine` doesn't
// persist which schedule it came from (a deliberate scope decision — no
// schema change), so the picker has nothing to pre-fill itself from there.
// ---------------------------------------------------------------------------

/** This month and next month as `{year, month}` pairs, from the real system clock —
 * the window `candidatePaydayDates` computes upcoming paydays within. */
function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function nextYearMonth({ year, month }: { year: number; month: number }): {
  year: number;
  month: number;
} {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** This month's and next month's actual payday dates for `schedule`, via the shared
 * `paydaysInMonth` — the concrete, pickable dates the "+ Add budget line" payday
 * picker offers once a schedule is chosen. */
function candidatePaydayDates(schedule: PaydaySchedule): readonly string[] {
  const current = currentYearMonth();
  const next = nextYearMonth(current);
  return [
    ...paydaysInMonth(schedule, current.year, current.month),
    ...paydaysInMonth(schedule, next.year, next.month),
  ];
}

/** The "+ Add budget line" payday picker's state: which `PaydaySchedule` is chosen,
 * its resulting candidate dates, and which of those is chosen — split out of
 * `useAddBudgetLineForm` purely to keep it under the length cap. */
interface PaydayPickerState {
  scheduleId: PaydayScheduleId | undefined;
  isSchedulePickerOpen: boolean;
  toggleSchedulePicker: () => void;
  pickSchedule: (id: PaydayScheduleId) => void;
  date: string | undefined;
  isDatePickerOpen: boolean;
  candidateDates: readonly string[];
  toggleDatePicker: () => void;
  pickDate: (date: string) => void;
  reset: () => void;
}

function usePaydayPickerState(paydaySchedules: readonly PaydaySchedule[]): PaydayPickerState {
  const [scheduleId, setScheduleId] = useState<PaydayScheduleId | undefined>(undefined);
  const [isSchedulePickerOpen, setIsSchedulePickerOpen] = useState(false);
  const [date, setDate] = useState<string | undefined>(undefined);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  function pickSchedule(id: PaydayScheduleId) {
    setScheduleId(id);
    setDate(undefined);
    setIsSchedulePickerOpen(false);
  }

  function pickDate(value: string) {
    setDate(value);
    setIsDatePickerOpen(false);
  }

  function reset() {
    setScheduleId(undefined);
    setDate(undefined);
    setIsSchedulePickerOpen(false);
    setIsDatePickerOpen(false);
  }

  const selectedSchedule = paydaySchedules.find((schedule) => schedule.id === scheduleId);
  const candidateDates =
    selectedSchedule === undefined ? [] : candidatePaydayDates(selectedSchedule);

  return {
    scheduleId,
    isSchedulePickerOpen,
    toggleSchedulePicker: () => setIsSchedulePickerOpen((open) => !open),
    pickSchedule,
    date,
    isDatePickerOpen,
    candidateDates,
    toggleDatePicker: () => setIsDatePickerOpen((open) => !open),
    pickDate,
    reset,
  };
}

/** `AddBudgetLineForm`'s state/mutation logic, split out to keep the form
 * component under the length cap. `budgetPeriod` is not collected here — the
 * server derives it from `paydayDate` (see `budget.ts`'s `createBudgetLine`). */
function useAddBudgetLineForm(paydaySchedules: readonly PaydaySchedule[]) {
  const [isOpen, setIsOpen] = useState(false);
  const payday = usePaydayPickerState(paydaySchedules);
  const [subEnvelopeId, setSubEnvelopeId] = useState<SubEnvelopeId | undefined>(undefined);
  const [isSubEnvelopePickerOpen, setIsSubEnvelopePickerOpen] = useState(false);
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
    payday.reset();
    setSubEnvelopeId(undefined);
    setIsSubEnvelopePickerOpen(false);
    setAmount("");
    setDescription("");
    createBudgetLine.reset();
  }

  function pickSubEnvelope(id: SubEnvelopeId) {
    setSubEnvelopeId(id);
    setIsSubEnvelopePickerOpen(false);
  }

  function handleSave() {
    if (subEnvelopeId === undefined || payday.date === undefined) {
      return;
    }
    createBudgetLine.mutate({
      paydayDate: payday.date,
      subEnvelopeId,
      amount,
      description: description.trim(),
    });
  }

  return {
    isOpen,
    setIsOpen,
    payday,
    subEnvelopeId,
    isSubEnvelopePickerOpen,
    toggleSubEnvelopePicker: () => setIsSubEnvelopePickerOpen((open) => !open),
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
 * payday and sub-envelope picker. */
function AddBudgetLineForm({
  subEnvelopes,
  paydaySchedules,
}: {
  subEnvelopes: readonly SubEnvelope[];
  paydaySchedules: readonly PaydaySchedule[];
}) {
  const form = useAddBudgetLineForm(paydaySchedules);

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
      paydaySchedules={paydaySchedules}
      payday={form.payday}
      subEnvelopeId={form.subEnvelopeId}
      isPickerOpen={form.isSubEnvelopePickerOpen}
      amount={form.amount}
      description={form.description}
      canSave={
        form.payday.date !== undefined &&
        form.subEnvelopeId !== undefined &&
        isValidPositiveAmount(form.amount) &&
        form.description.trim().length > 0
      }
      isPending={form.createBudgetLine.isPending}
      isError={form.createBudgetLine.isError}
      onTogglePicker={form.toggleSubEnvelopePicker}
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
  paydaySchedules: readonly PaydaySchedule[];
  payday: PaydayPickerState;
  subEnvelopeId: SubEnvelopeId | undefined;
  isPickerOpen: boolean;
  amount: string;
  description: string;
  canSave: boolean;
  isPending: boolean;
  isError: boolean;
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
      <PaydayPickerFields paydaySchedules={props.paydaySchedules} payday={props.payday} />
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

/** "Payday schedule: {name} ▾" toggle revealing the inline single-select list of
 * every `PaydaySchedule` — the first step of the payday picker: pick a schedule
 * before picking one of its actual computed dates. */
function PaydayScheduleFieldControl({
  paydaySchedules,
  selectedScheduleId,
  isOpen,
  onToggle,
  onPick,
}: {
  paydaySchedules: readonly PaydaySchedule[];
  selectedScheduleId: PaydayScheduleId | undefined;
  isOpen: boolean;
  onToggle: () => void;
  onPick: (id: PaydayScheduleId) => void;
}) {
  const selectedName =
    selectedScheduleId === undefined
      ? "Choose schedule"
      : (paydaySchedules.find((schedule) => schedule.id === selectedScheduleId)?.name ??
        selectedScheduleId);
  return (
    <View style={styles.pickerContainer}>
      <Pressable style={styles.pickerToggle} onPress={onToggle}>
        <Text style={styles.pickerToggleText}>Payday schedule: {selectedName} ▾</Text>
      </Pressable>
      {isOpen && (
        <View style={styles.picker}>
          {paydaySchedules.map((schedule) => (
            <Pressable
              key={schedule.id}
              style={styles.pickerOption}
              onPress={() => onPick(schedule.id)}
            >
              <Text>{schedule.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** "Payday: {date} ▾" toggle revealing the selected schedule's computed upcoming
 * dates (this month + next month) — disabled until a schedule is picked, since
 * there's nothing to offer before then. */
function PaydayDateFieldControl({
  candidateDates,
  selectedDate,
  isOpen,
  onToggle,
  onPick,
}: {
  candidateDates: readonly string[];
  selectedDate: string | undefined;
  isOpen: boolean;
  onToggle: () => void;
  onPick: (date: string) => void;
}) {
  const selectedLabel = selectedDate ?? "Choose date";
  return (
    <View style={styles.pickerContainer}>
      <Pressable
        style={styles.pickerToggle}
        disabled={candidateDates.length === 0}
        onPress={onToggle}
      >
        <Text style={styles.pickerToggleText}>Payday: {selectedLabel} ▾</Text>
      </Pressable>
      {isOpen && (
        <View style={styles.picker}>
          {candidateDates.map((date) => (
            <Pressable key={date} style={styles.pickerOption} onPress={() => onPick(date)}>
              <Text>{date}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** Combines `PaydayScheduleFieldControl` and `PaydayDateFieldControl` into the
 * "+ Add budget line" form's two-step payday picker. */
function PaydayPickerFields({
  paydaySchedules,
  payday,
}: {
  paydaySchedules: readonly PaydaySchedule[];
  payday: PaydayPickerState;
}) {
  return (
    <>
      <PaydayScheduleFieldControl
        paydaySchedules={paydaySchedules}
        selectedScheduleId={payday.scheduleId}
        isOpen={payday.isSchedulePickerOpen}
        onToggle={payday.toggleSchedulePicker}
        onPick={payday.pickSchedule}
      />
      <PaydayDateFieldControl
        candidateDates={payday.candidateDates}
        selectedDate={payday.date}
        isOpen={payday.isDatePickerOpen}
        onToggle={payday.toggleDatePicker}
        onPick={payday.pickDate}
      />
    </>
  );
}

/** Props for `BudgetLineEditFields`, lifted out to a named interface so the function
 * body itself stays under the length cap. Unlike `AddBudgetLineFields`, this keeps
 * the original plain free-typed `paydayDate` field — an existing `BudgetLine`
 * doesn't remember which `PaydaySchedule` it was created from (no persisted link,
 * a deliberate scope decision), so the schedule+date picker has nothing to pre-fill
 * itself from when editing. */
interface BudgetLineEditFieldsProps {
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

/** `BudgetLineRow`'s edit form — split from `AddBudgetLineFields` (Increment 74) once
 * create and edit stopped needing the exact same payday input; see the interface
 * doc comment above for why. */
function BudgetLineEditFields(props: BudgetLineEditFieldsProps) {
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
  editButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  editButtonText: {
    ...Typography.detail,
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
  },
  scheduleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  rowButtons: {
    flexDirection: "row",
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
