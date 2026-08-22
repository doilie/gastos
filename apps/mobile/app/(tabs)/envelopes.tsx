import {
  formatCents,
  type Account,
  type AccountId,
  type Cents,
  type EnvelopeGroup,
  type SubEnvelope,
} from "@gastos/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { trpc } from "../../lib/trpc";

/** One sub-envelope's balance, keyed by `SubEnvelope.id`, from `useQueries`. */
type BalanceQuery = UseQueryResult<Cents>;
type BalancesById = ReadonlyMap<string, BalanceQuery | undefined>;

/**
 * Envelopes tab: envelope groups → sub-envelopes, each showing its derived
 * balance, plus "+ Add group"/"+ Add sub-envelope" forms wiring
 * `createEnvelopeGroup`/`createSubEnvelope` — the Create-only start of the
 * "Envelope CRUD" thread (Update/Archive/Delete are not yet scoped). The
 * reserved Spendable envelope (`groupId: null`) is excluded — it already has
 * its own home on the Today tab.
 */
export default function EnvelopesScreen() {
  const envelopeGroups = trpc.reference.envelopeGroups.useQuery();
  const subEnvelopes = trpc.reference.subEnvelopes.useQuery();
  const accounts = trpc.reference.accounts.useQuery();
  const groupedSubEnvelopes = (subEnvelopes.data ?? []).filter(
    (subEnvelope) => subEnvelope.groupId !== null,
  );
  const balanceQueries = trpc.useQueries((t) =>
    groupedSubEnvelopes.map((subEnvelope) =>
      t.ledger.subEnvelopeBalance({ subEnvelopeId: subEnvelope.id }),
    ),
  );

  if (envelopeGroups.isPending || subEnvelopes.isPending || accounts.isPending) {
    return (
      <View style={styles.container}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (envelopeGroups.isError || subEnvelopes.isError || accounts.isError) {
    return (
      <View style={styles.container}>
        <Text>Something went wrong.</Text>
      </View>
    );
  }

  const balancesById: BalancesById = new Map(
    groupedSubEnvelopes.map((subEnvelope, index) => [subEnvelope.id, balanceQueries[index]]),
  );

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Envelopes</Text>
      {(envelopeGroups.data ?? []).map((group) => (
        <EnvelopeGroupSection
          key={group.id}
          group={group}
          subEnvelopes={groupedSubEnvelopes.filter(
            (subEnvelope) => subEnvelope.groupId === group.id,
          )}
          balancesById={balancesById}
          accounts={accounts.data}
        />
      ))}
      <AddEnvelopeGroupForm />
    </ScrollView>
  );
}

/** Renders one `EnvelopeGroup` heading plus a row per sub-envelope in it, plus its "+ Add sub-envelope" form. */
function EnvelopeGroupSection({
  group,
  subEnvelopes,
  balancesById,
  accounts,
}: {
  group: EnvelopeGroup;
  subEnvelopes: readonly SubEnvelope[];
  balancesById: BalancesById;
  accounts: readonly Account[];
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.groupName}>{group.name}</Text>
      {subEnvelopes.map((subEnvelope) => (
        <SubEnvelopeRow
          key={subEnvelope.id}
          subEnvelope={subEnvelope}
          balanceQuery={balancesById.get(subEnvelope.id)}
        />
      ))}
      <AddSubEnvelopeForm groupId={group.id} accounts={accounts} />
    </View>
  );
}

/** Renders one sub-envelope's name + its balance, "…" while still loading. */
function SubEnvelopeRow({
  subEnvelope,
  balanceQuery,
}: {
  subEnvelope: SubEnvelope;
  balanceQuery: BalanceQuery | undefined;
}) {
  const balanceText =
    balanceQuery === undefined || balanceQuery.isPending
      ? "…"
      : balanceQuery.isError
        ? "—"
        : formatCents(balanceQuery.data);
  return (
    <View style={styles.row}>
      <Text style={styles.subEnvelopeName}>{subEnvelope.name}</Text>
      <Text style={styles.subEnvelopeBalance}>{balanceText}</Text>
    </View>
  );
}

/**
 * Inline "+ Add group" form: collapsed to a single button until tapped,
 * mirroring `more.tsx`'s `AddAccountForm`/`AddCategoryForm` pattern.
 */
function AddEnvelopeGroupForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const utils = trpc.useUtils();
  const createEnvelopeGroup = trpc.reference.createEnvelopeGroup.useMutation({
    onSuccess: () => {
      void utils.reference.envelopeGroups.invalidate();
      closeForm();
    },
  });

  function closeForm() {
    setIsOpen(false);
    setName("");
    createEnvelopeGroup.reset();
  }

  function handleSave() {
    createEnvelopeGroup.mutate({ name: name.trim() });
  }

  if (!isOpen) {
    return (
      <Pressable style={styles.addButton} onPress={() => setIsOpen(true)}>
        <Text style={styles.addButtonText}>+ Add group</Text>
      </Pressable>
    );
  }

  return (
    <AddEnvelopeGroupFields
      name={name}
      canSave={name.trim().length > 0}
      isPending={createEnvelopeGroup.isPending}
      isError={createEnvelopeGroup.isError}
      onNameChange={setName}
      onCancel={closeForm}
      onSave={handleSave}
    />
  );
}

/** The revealed `AddEnvelopeGroupForm`'s inputs/controls — split out to keep the parent under the line/complexity caps. */
function AddEnvelopeGroupFields(props: {
  name: string;
  canSave: boolean;
  isPending: boolean;
  isError: boolean;
  onNameChange: (value: string) => void;
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

/**
 * `AddSubEnvelopeForm`'s form state, toggle logic, and `createSubEnvelope`
 * mutation — split into its own hook so the form component itself stays
 * under the line/complexity caps.
 */
function useAddSubEnvelopeForm(groupId: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<ReadonlySet<AccountId>>(
    new Set(),
  );
  const utils = trpc.useUtils();
  const createSubEnvelope = trpc.reference.createSubEnvelope.useMutation({
    onSuccess: () => {
      void utils.reference.subEnvelopes.invalidate();
      closeForm();
    },
  });

  function closeForm() {
    setIsOpen(false);
    setName("");
    setSelectedAccountIds(new Set());
    createSubEnvelope.reset();
  }

  function toggleAccount(accountId: AccountId) {
    const next = new Set(selectedAccountIds);
    if (next.has(accountId)) {
      next.delete(accountId);
    } else {
      next.add(accountId);
    }
    setSelectedAccountIds(next);
  }

  function handleSave() {
    createSubEnvelope.mutate({
      name: name.trim(),
      groupId,
      accountIds: [...selectedAccountIds],
    });
  }

  return {
    isOpen,
    setIsOpen,
    name,
    setName,
    selectedAccountIds,
    createSubEnvelope,
    closeForm,
    toggleAccount,
    handleSave,
  };
}

/**
 * Inline "+ Add sub-envelope" form, scoped to one `EnvelopeGroup` (`groupId`
 * is implicit, no group picker): collapsed to a single button until tapped,
 * mirroring `AddEnvelopeGroupForm`, but with an added account multi-select.
 */
function AddSubEnvelopeForm({
  groupId,
  accounts,
}: {
  groupId: string;
  accounts: readonly Account[];
}) {
  const form = useAddSubEnvelopeForm(groupId);

  if (!form.isOpen) {
    return (
      <Pressable style={styles.addButton} onPress={() => form.setIsOpen(true)}>
        <Text style={styles.addButtonText}>+ Add sub-envelope</Text>
      </Pressable>
    );
  }

  return (
    <AddSubEnvelopeFields
      name={form.name}
      accounts={accounts}
      selectedAccountIds={form.selectedAccountIds}
      canSave={form.name.trim().length > 0 && form.selectedAccountIds.size > 0}
      isPending={form.createSubEnvelope.isPending}
      isError={form.createSubEnvelope.isError}
      onNameChange={form.setName}
      onToggleAccount={form.toggleAccount}
      onCancel={form.closeForm}
      onSave={form.handleSave}
    />
  );
}

/** The revealed `AddSubEnvelopeForm`'s inputs/controls — split out to keep the parent under the line/complexity caps. */
function AddSubEnvelopeFields(props: {
  name: string;
  accounts: readonly Account[];
  selectedAccountIds: ReadonlySet<AccountId>;
  canSave: boolean;
  isPending: boolean;
  isError: boolean;
  onNameChange: (value: string) => void;
  onToggleAccount: (accountId: AccountId) => void;
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
      <AccountMultiSelect
        accounts={props.accounts}
        selectedAccountIds={props.selectedAccountIds}
        disabled={disabled}
        onToggleAccount={props.onToggleAccount}
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

/**
 * One selectable `Pressable` row per `Account`, toggling its membership in
 * `selectedAccountIds` — unlike `budget.tsx`'s `AccountPicker` (single-select,
 * closes on pick) this is a MULTI-select that stays open, marking selected
 * accounts with a leading "✓ ".
 */
function AccountMultiSelect({
  accounts,
  selectedAccountIds,
  disabled,
  onToggleAccount,
}: {
  accounts: readonly Account[];
  selectedAccountIds: ReadonlySet<AccountId>;
  disabled: boolean;
  onToggleAccount: (accountId: AccountId) => void;
}) {
  return (
    <View style={styles.multiSelect}>
      {accounts.map((account) => {
        const isSelected = selectedAccountIds.has(account.id);
        return (
          <Pressable
            key={account.id}
            style={styles.multiSelectOption}
            disabled={disabled}
            onPress={() => onToggleAccount(account.id)}
          >
            <Text style={isSelected ? styles.multiSelectOptionSelectedText : styles.multiSelectOptionText}>
              {isSelected ? "✓ " : ""}
              {account.name}
            </Text>
          </Pressable>
        );
      })}
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
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "600",
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  groupName: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingLeft: 12,
  },
  subEnvelopeName: {
    fontSize: 16,
  },
  subEnvelopeBalance: {
    fontSize: 16,
    fontWeight: "600",
  },
  addButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  form: {
    marginTop: 8,
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
  multiSelect: {
    marginBottom: 8,
  },
  multiSelectOption: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  multiSelectOptionText: {
    fontSize: 15,
  },
  multiSelectOptionSelectedText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
