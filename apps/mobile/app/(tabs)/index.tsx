import {
  CREDIT_CARD_BUDGET_ENVELOPE_ID,
  dailySpendableAllowance,
  formatCents,
  ledgerDateFromString,
  type Category,
  type CategoryId,
  type Transaction,
} from "@gastos/shared";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { findSpendableAccountId, QuickAddForm } from "../../components/QuickAddForm";
import { trpc } from "../../lib/trpc";
import { Colors, Spacing, Typography } from "../../theme";

/** Same one-liner as `QuickAddForm.tsx`'s/`cards.tsx`'s `todayLedgerDate` —
 * not worth extracting into a shared util yet for a single duplicated line. */
function todayLedgerDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Matches a signed decimal like "150", "150.00", or "-150.00" (max 2dp). */
const SIGNED_AMOUNT_SHAPE = /^-?\d+(\.\d{1,2})?$/;

function isValidSignedAmount(amount: string): boolean {
  return SIGNED_AMOUNT_SHAPE.test(amount) && amount !== "0" && amount !== "0.00" && amount !== "";
}

/** Resolves a category's display name, falling back to "Uncategorized" when `categoryId` is `null`
 * (or to the raw id if unmatched — same fallback `reports.tsx`'s `categoryName` uses). */
function categoryName(categories: readonly Category[], categoryId: CategoryId | null): string {
  if (categoryId === null) {
    return "Uncategorized";
  }
  return categories.find((category) => category.id === categoryId)?.name ?? categoryId;
}

/** Sorts transactions most-recent-first by date, tie-broken deterministically by id. */
function sortTransactionsByDateDescending(
  transactions: readonly Transaction[],
): readonly Transaction[] {
  return transactions
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/**
 * Today tab: shows the Spendable envelope's derived balance, read straight
 * from `ledger.spendableBalance`, a quick-add form that always logs an
 * expense against Spendable (account/envelope/card picker is later work),
 * and the full transaction list with inline Edit/Delete controls.
 */
export default function TodayScreen() {
  const spendableBalance = trpc.ledger.spendableBalance.useQuery();
  const subEnvelopes = trpc.reference.subEnvelopes.useQuery();
  const paydaySchedules = trpc.budget.paydaySchedules.useQuery();
  const ccBudgetBalance = trpc.ledger.subEnvelopeBalance.useQuery({
    subEnvelopeId: CREDIT_CARD_BUDGET_ENVELOPE_ID,
  });

  const isPending =
    spendableBalance.isPending || paydaySchedules.isPending || ccBudgetBalance.isPending;
  const isError =
    spendableBalance.isError || paydaySchedules.isError || ccBudgetBalance.isError;

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

  const spendableAccountId = subEnvelopes.data
    ? findSpendableAccountId(subEnvelopes.data)
    : undefined;

  const dailyAllowance = dailySpendableAllowance(
    spendableBalance.data,
    paydaySchedules.data[0],
    ledgerDateFromString(todayLedgerDate()),
  );

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>Today</Text>
        {/* Currency-aware formatting (per-account currencies, no resolved
            "base currency" concept yet) is deferred future work — show the
            plain formatted number for now. */}
        <Text style={styles.balance}>{formatCents(spendableBalance.data)}</Text>
        <Text style={styles.subDetail}>≈ {formatCents(dailyAllowance)} / day</Text>
        <Text style={styles.subDetail}>
          Credit Card Budget: {formatCents(ccBudgetBalance.data)}
        </Text>
        <QuickAddForm spendableAccountId={spendableAccountId} />
      </View>
      <TransactionsSection />
    </ScrollView>
  );
}

/**
 * Renders the "Transactions" section: the full `Transaction` list (most
 * recent first), each with inline Edit/Delete controls. Queries its own data
 * independently of the Spendable-balance/QuickAddForm above it, so a slow
 * transactions/categories fetch doesn't block that already-loaded content.
 */
function TransactionsSection() {
  const transactions = trpc.ledger.transactions.useQuery();
  const categories = trpc.reference.categories.useQuery();

  if (transactions.isPending || categories.isPending) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transactions</Text>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (transactions.isError || categories.isError) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transactions</Text>
        <Text>Something went wrong.</Text>
      </View>
    );
  }

  const sorted = sortTransactionsByDateDescending(transactions.data);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Transactions</Text>
      {sorted.map((transaction) => (
        <TransactionRow
          key={transaction.id}
          transaction={transaction}
          categories={categories.data}
        />
      ))}
    </View>
  );
}

/**
 * `TransactionRow`'s date/description/amount edit state and
 * `updateTransaction` mutation — split into its own hook so `TransactionRow`
 * itself stays under the line/complexity caps. Only `date`/`description`/
 * `amount` are editable from this screen (see module doc); `categoryId`/
 * `accountId`/`subEnvelopeId` are read-only display fields here.
 */
function useTransactionEdit(transaction: Transaction) {
  const [isEditing, setIsEditing] = useState(false);
  const [date, setDate] = useState<string>(transaction.date);
  const [description, setDescription] = useState(transaction.description);
  const [amount, setAmount] = useState(formatCents(transaction.amount));
  const utils = trpc.useUtils();
  const updateTransaction = trpc.ledger.updateTransaction.useMutation({
    onSuccess: () => {
      void utils.ledger.transactions.invalidate();
      void utils.ledger.spendableBalance.invalidate();
      setIsEditing(false);
    },
  });

  function resetFields() {
    setDate(transaction.date);
    setDescription(transaction.description);
    setAmount(formatCents(transaction.amount));
  }

  function startEdit() {
    resetFields();
    updateTransaction.reset();
    setIsEditing(true);
  }

  function cancelEdit() {
    resetFields();
    updateTransaction.reset();
    setIsEditing(false);
  }

  function handleSave() {
    updateTransaction.mutate({
      id: transaction.id,
      date,
      description: description.trim(),
      amount,
    });
  }

  return {
    isEditing,
    date,
    description,
    amount,
    setDate,
    setDescription,
    setAmount,
    updateTransaction,
    startEdit,
    cancelEdit,
    handleSave,
  };
}

/**
 * `TransactionRow`'s delete-confirmation state and `deleteTransaction`
 * mutation — split into its own hook so `TransactionRow` itself stays under
 * the line/complexity caps. Unlike `deleteCategory`, `deleteTransaction` has
 * no referential-integrity rejection possible (an unconditional hard
 * delete), so a generic fallback message alone is sufficient.
 */
function useTransactionDelete(transaction: Transaction) {
  const [isConfirming, setIsConfirming] = useState(false);
  const utils = trpc.useUtils();
  const deleteTransaction = trpc.ledger.deleteTransaction.useMutation({
    onSuccess: () => {
      void utils.ledger.transactions.invalidate();
      void utils.ledger.spendableBalance.invalidate();
    },
  });

  function startDelete() {
    deleteTransaction.reset();
    setIsConfirming(true);
  }

  function cancelDelete() {
    deleteTransaction.reset();
    setIsConfirming(false);
  }

  function confirmDelete() {
    deleteTransaction.mutate({ id: transaction.id });
  }

  return {
    isConfirming,
    isPending: deleteTransaction.isPending,
    isError: deleteTransaction.isError,
    startDelete,
    cancelDelete,
    confirmDelete,
  };
}

/**
 * One `Transaction` row: read-only display plus an "Edit" control that
 * reveals pre-filled `TransactionEditFields`, mirroring `more.tsx`'s
 * `AccountRow`/`CategoryRow` split. Also offers a Delete control with an
 * inline confirmation step.
 */
function TransactionRow({
  transaction,
  categories,
}: {
  transaction: Transaction;
  categories: readonly Category[];
}) {
  const edit = useTransactionEdit(transaction);
  const del = useTransactionDelete(transaction);

  if (edit.isEditing) {
    return (
      <TransactionEditFields
        date={edit.date}
        description={edit.description}
        amount={edit.amount}
        canSave={
          edit.date.trim().length > 0 &&
          edit.description.trim().length > 0 &&
          isValidSignedAmount(edit.amount)
        }
        isPending={edit.updateTransaction.isPending}
        isError={edit.updateTransaction.isError}
        onDateChange={edit.setDate}
        onDescriptionChange={edit.setDescription}
        onAmountChange={edit.setAmount}
        onCancel={edit.cancelEdit}
        onSave={edit.handleSave}
      />
    );
  }

  return (
    <TransactionRowDisplay
      transaction={transaction}
      categoryLabel={categoryName(categories, transaction.categoryId)}
      isConfirmingDelete={del.isConfirming}
      isDeletePending={del.isPending}
      isDeleteError={del.isError}
      onEdit={edit.startEdit}
      onStartDelete={del.startDelete}
      onCancelDelete={del.cancelDelete}
      onConfirmDelete={del.confirmDelete}
    />
  );
}

/**
 * `TransactionRow`'s non-editing display: date/description/amount/category
 * plus read-only account/sub-envelope ids, and Edit/Delete controls — split
 * out to keep `TransactionRow` under the line/complexity caps.
 */
function TransactionRowDisplay(props: {
  transaction: Transaction;
  categoryLabel: string;
  isConfirmingDelete: boolean;
  isDeletePending: boolean;
  isDeleteError: boolean;
  onEdit: () => void;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const { transaction } = props;
  const rowActionsDisabled = props.isConfirmingDelete || props.isDeletePending;
  return (
    <View>
      <View style={styles.row}>
        <View>
          <Text style={styles.rowName}>
            {transaction.date} — {transaction.description}
          </Text>
          <Text style={styles.rowDetail}>
            {formatCents(transaction.amount)} · {props.categoryLabel}
          </Text>
          <Text style={styles.rowDetail}>
            account: {transaction.accountId} · envelope: {transaction.subEnvelopeId}
          </Text>
        </View>
        <View style={styles.rowButtons}>
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
      {props.isDeleteError && (
        <Text style={[styles.error, styles.rowError]}>Couldn&apos;t delete — try again.</Text>
      )}
      {props.isConfirmingDelete && (
        <TransactionDeleteConfirm
          isPending={props.isDeletePending}
          onCancel={props.onCancelDelete}
          onConfirm={props.onConfirmDelete}
        />
      )}
    </View>
  );
}

/**
 * Inline "Delete this transaction?" confirmation revealed by
 * `TransactionRowDisplay`'s Delete button, mirroring `more.tsx`'s
 * `CategoryDeleteConfirm`. `deleteTransaction` has no meaningful specific
 * rejection message (unconditional hard delete), so no server error
 * passthrough is needed here — the generic fallback is shown by the parent.
 */
function TransactionDeleteConfirm(props: {
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.form}>
      <Text>Delete this transaction?</Text>
      <View style={styles.formButtons}>
        <Pressable style={styles.formButton} disabled={props.isPending} onPress={props.onCancel}>
          <Text>Cancel</Text>
        </Pressable>
        <Pressable style={styles.formButton} disabled={props.isPending} onPress={props.onConfirm}>
          <Text>{props.isPending ? "Deleting…" : "Confirm"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The revealed `TransactionRow`'s edit inputs/controls — split out to keep the parent under the line/complexity caps. */
function TransactionEditFields(props: {
  date: string;
  description: string;
  amount: string;
  canSave: boolean;
  isPending: boolean;
  isError: boolean;
  onDateChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const disabled = props.isPending;
  return (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        placeholder="Date (YYYY-MM-DD)"
        value={props.date}
        editable={!disabled}
        onChangeText={props.onDateChange}
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
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingVertical: 24,
    alignItems: "center",
  },
  header: {
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "600",
  },
  balance: {
    marginTop: 8,
    fontSize: 40,
    fontWeight: "700",
  },
  subDetail: {
    marginTop: Spacing.xs,
    color: Colors.textMuted,
    ...Typography.detail,
  },
  section: {
    marginTop: 24,
    width: "100%",
    maxWidth: 480,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 6,
    paddingLeft: 12,
  },
  rowName: {
    fontSize: 16,
  },
  rowDetail: {
    fontSize: 13,
    color: "#666",
  },
  rowButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowError: {
    paddingLeft: 12,
  },
  editButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  form: {
    marginTop: 8,
    width: "100%",
    maxWidth: 320,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    fontSize: 16,
  },
  formButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  formButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  error: {
    color: "#c00",
    marginBottom: 8,
    fontSize: 14,
  },
});
