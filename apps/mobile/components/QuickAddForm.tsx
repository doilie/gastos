import { isSpendableEnvelope, SPENDABLE_ENVELOPE_ID, type SubEnvelope } from "@gastos/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { trpc } from "../lib/trpc";

/** Matches a plain non-negative decimal like "150" or "150.00" (max 2dp). */
const AMOUNT_SHAPE = /^\d+(\.\d{1,2})?$/;

/**
 * Resolves the account to quick-add against: the first account linked to
 * the Spendable envelope. Spendable can in principle span multiple linked
 * accounts (`SubEnvelope.accountIds`), but picking among them is out of
 * scope for this MVP quick-add pass — we always use the first one.
 */
export function findSpendableAccountId(
  subEnvelopes: readonly SubEnvelope[],
): string | undefined {
  const spendable = subEnvelopes.find(isSpendableEnvelope);
  return spendable?.accountIds[0];
}

function isValidAmount(amount: string): boolean {
  return AMOUNT_SHAPE.test(amount) && amount !== "0" && amount !== "0.00" && amount !== "";
}

function todayLedgerDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Inline "+ Add" quick-add form for the Today screen: always logs an
 * expense against the Spendable envelope (account/envelope/card picker is
 * later work). Collapsed to a single button until tapped.
 */
export function QuickAddForm({ spendableAccountId }: { spendableAccountId: string | undefined }) {
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const utils = trpc.useUtils();
  const addTransaction = trpc.ledger.addTransaction.useMutation({
    onSuccess: () => {
      void utils.ledger.spendableBalance.invalidate();
      closeForm();
    },
  });

  function closeForm() {
    setIsOpen(false);
    setAmount("");
    setDescription("");
    addTransaction.reset();
  }

  function handleSave() {
    if (spendableAccountId === undefined) {
      return;
    }
    addTransaction.mutate({
      date: todayLedgerDate(),
      description: description.trim(),
      categoryId: null,
      accountId: spendableAccountId,
      subEnvelopeId: SPENDABLE_ENVELOPE_ID,
      amount: `-${amount}`,
    });
  }

  if (!isOpen) {
    return (
      <Pressable
        style={styles.addButton}
        disabled={spendableAccountId === undefined}
        onPress={() => setIsOpen(true)}
      >
        <Text style={styles.addButtonText}>+ Add</Text>
      </Pressable>
    );
  }

  const canSave = isValidAmount(amount) && description.trim().length > 0;
  return (
    <QuickAddFields
      amount={amount}
      description={description}
      canSave={canSave}
      isPending={addTransaction.isPending}
      isError={addTransaction.isError}
      onAmountChange={setAmount}
      onDescriptionChange={setDescription}
      onCancel={closeForm}
      onSave={handleSave}
    />
  );
}

/** The revealed form's inputs/controls — split out to keep `QuickAddForm` under the line/complexity caps. */
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
    <View style={styles.form}>
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
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  form: {
    marginTop: 16,
    width: 240,
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
