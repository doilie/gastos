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

/**
 * `EnvelopeGroupSection`'s heading name-edit state and `updateEnvelopeGroup`
 * mutation — split into its own hook so the section component itself stays
 * under the line/complexity caps.
 */
function useEnvelopeGroupEdit(group: EnvelopeGroup) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const utils = trpc.useUtils();
  const updateEnvelopeGroup = trpc.reference.updateEnvelopeGroup.useMutation({
    onSuccess: () => {
      void utils.reference.envelopeGroups.invalidate();
      setIsEditing(false);
    },
  });

  function startEdit() {
    setName(group.name);
    updateEnvelopeGroup.reset();
    setIsEditing(true);
  }

  function cancelEdit() {
    setName(group.name);
    updateEnvelopeGroup.reset();
    setIsEditing(false);
  }

  function handleSave() {
    updateEnvelopeGroup.mutate({ id: group.id, name: name.trim() });
  }

  return { isEditing, name, setName, updateEnvelopeGroup, startEdit, cancelEdit, handleSave };
}

/**
 * `EnvelopeGroupSection`'s heading delete-confirmation state and
 * `deleteEnvelopeGroup` mutation — split into its own hook so the section
 * component itself stays under the line/complexity caps. Mirrors
 * `more.tsx`'s `useCategoryDelete` exactly.
 */
function useEnvelopeGroupDelete(group: EnvelopeGroup) {
  const [isConfirming, setIsConfirming] = useState(false);
  const utils = trpc.useUtils();
  const deleteEnvelopeGroup = trpc.reference.deleteEnvelopeGroup.useMutation({
    onSuccess: () => void utils.reference.envelopeGroups.invalidate(),
  });

  function startDelete() {
    deleteEnvelopeGroup.reset();
    setIsConfirming(true);
  }

  function cancelDelete() {
    deleteEnvelopeGroup.reset();
    setIsConfirming(false);
  }

  function confirmDelete() {
    deleteEnvelopeGroup.mutate({ id: group.id });
  }

  const errorMessage = deleteEnvelopeGroup.isError
    ? deleteEnvelopeGroup.error?.message || "Couldn't delete — try again."
    : undefined;

  return {
    isConfirming,
    isPending: deleteEnvelopeGroup.isPending,
    errorMessage,
    startDelete,
    cancelDelete,
    confirmDelete,
  };
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
  const edit = useEnvelopeGroupEdit(group);
  const del = useEnvelopeGroupDelete(group);
  return (
    <View style={styles.section}>
      {edit.isEditing ? (
        <EnvelopeGroupEditFields
          name={edit.name}
          canSave={edit.name.trim().length > 0}
          isPending={edit.updateEnvelopeGroup.isPending}
          isError={edit.updateEnvelopeGroup.isError}
          onNameChange={edit.setName}
          onCancel={edit.cancelEdit}
          onSave={edit.handleSave}
        />
      ) : (
        <EnvelopeGroupHeadingDisplay
          group={group}
          isConfirmingDelete={del.isConfirming}
          isDeletePending={del.isPending}
          deleteErrorMessage={del.errorMessage}
          onEdit={edit.startEdit}
          onStartDelete={del.startDelete}
          onCancelDelete={del.cancelDelete}
          onConfirmDelete={del.confirmDelete}
        />
      )}
      {subEnvelopes.map((subEnvelope) => (
        <SubEnvelopeRow
          key={subEnvelope.id}
          subEnvelope={subEnvelope}
          balanceQuery={balancesById.get(subEnvelope.id)}
          accounts={accounts}
        />
      ))}
      <AddSubEnvelopeForm groupId={group.id} accounts={accounts} />
    </View>
  );
}

/**
 * `EnvelopeGroupSection`'s non-editing heading display: group name plus Edit
 * and Delete controls, the latter revealing an inline confirmation — split
 * out to keep `EnvelopeGroupSection` under the line/complexity caps. Mirrors
 * `more.tsx`'s `CategoryRowDisplay` exactly.
 */
function EnvelopeGroupHeadingDisplay(props: {
  group: EnvelopeGroup;
  isConfirmingDelete: boolean;
  isDeletePending: boolean;
  deleteErrorMessage: string | undefined;
  onEdit: () => void;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const { group } = props;
  const headingActionsDisabled = props.isConfirmingDelete || props.isDeletePending;
  return (
    <View>
      <View style={styles.groupHeading}>
        <Text style={styles.groupName}>{group.name}</Text>
        <View style={styles.rowButtons}>
          <Pressable
            style={styles.editButton}
            disabled={headingActionsDisabled}
            onPress={props.onEdit}
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </Pressable>
          <Pressable
            style={styles.editButton}
            disabled={headingActionsDisabled}
            onPress={props.onStartDelete}
          >
            <Text style={styles.editButtonText}>Delete</Text>
          </Pressable>
        </View>
      </View>
      {props.isConfirmingDelete && (
        <EnvelopeGroupDeleteConfirm
          isPending={props.isDeletePending}
          errorMessage={props.deleteErrorMessage}
          onCancel={props.onCancelDelete}
          onConfirm={props.onConfirmDelete}
        />
      )}
    </View>
  );
}

/** The revealed group-heading edit inputs/controls — split out to keep `EnvelopeGroupSection` under the line/complexity caps. */
function EnvelopeGroupEditFields(props: {
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
 * Inline "Delete this group?" confirmation revealed by `EnvelopeGroupSection`'s
 * heading Delete button — shows the mutation's server-provided error message
 * (e.g. "still in use") when the delete fails, and stays open on error so the
 * user can read it. Mirrors `more.tsx`'s `CategoryDeleteConfirm` exactly.
 */
function EnvelopeGroupDeleteConfirm(props: {
  isPending: boolean;
  errorMessage: string | undefined;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.form}>
      <Text>Delete this group?</Text>
      {props.errorMessage !== undefined && <Text style={styles.error}>{props.errorMessage}</Text>}
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

/**
 * `SubEnvelopeRow`'s name/account-membership edit state and
 * `updateSubEnvelope` mutation — split into its own hook so the row component
 * itself stays under the line/complexity caps.
 */
function useSubEnvelopeEdit(subEnvelope: SubEnvelope) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(subEnvelope.name);
  const [selectedAccountIds, setSelectedAccountIds] = useState<ReadonlySet<AccountId>>(
    new Set(subEnvelope.accountIds),
  );
  const utils = trpc.useUtils();
  const updateSubEnvelope = trpc.reference.updateSubEnvelope.useMutation({
    onSuccess: () => {
      void utils.reference.subEnvelopes.invalidate();
      setIsEditing(false);
    },
  });

  function startEdit() {
    setName(subEnvelope.name);
    setSelectedAccountIds(new Set(subEnvelope.accountIds));
    updateSubEnvelope.reset();
    setIsEditing(true);
  }

  function cancelEdit() {
    setName(subEnvelope.name);
    setSelectedAccountIds(new Set(subEnvelope.accountIds));
    updateSubEnvelope.reset();
    setIsEditing(false);
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
    updateSubEnvelope.mutate({
      id: subEnvelope.id,
      name: name.trim(),
      accountIds: [...selectedAccountIds],
    });
  }

  return {
    isEditing,
    name,
    setName,
    selectedAccountIds,
    updateSubEnvelope,
    startEdit,
    cancelEdit,
    toggleAccount,
    handleSave,
  };
}

/**
 * `SubEnvelopeRow`'s Archive/Unarchive state and mutations — split into its
 * own hook so `SubEnvelopeRow` itself stays under the line/complexity caps.
 * Mirrors `more.tsx`'s `useAccountArchive` exactly.
 */
function useSubEnvelopeArchive(subEnvelope: SubEnvelope) {
  const utils = trpc.useUtils();
  const archiveSubEnvelope = trpc.reference.archiveSubEnvelope.useMutation({
    onSuccess: () => void utils.reference.subEnvelopes.invalidate(),
  });
  const unarchiveSubEnvelope = trpc.reference.unarchiveSubEnvelope.useMutation({
    onSuccess: () => void utils.reference.subEnvelopes.invalidate(),
  });

  function toggleArchive() {
    if (subEnvelope.isArchived) {
      unarchiveSubEnvelope.mutate({ id: subEnvelope.id });
    } else {
      archiveSubEnvelope.mutate({ id: subEnvelope.id });
    }
  }

  return {
    toggleArchive,
    isPending: archiveSubEnvelope.isPending || unarchiveSubEnvelope.isPending,
    isError: archiveSubEnvelope.isError || unarchiveSubEnvelope.isError,
  };
}

/**
 * Renders one sub-envelope's name + its balance, "…" while still loading,
 * plus Edit and Archive/Unarchive controls that swap in pre-filled
 * `SubEnvelopeEditFields` (name + account multi-select) instead of the
 * balance display, mirroring `more.tsx`'s `AccountRow` display/edit swap.
 */
function SubEnvelopeRow({
  subEnvelope,
  balanceQuery,
  accounts,
}: {
  subEnvelope: SubEnvelope;
  balanceQuery: BalanceQuery | undefined;
  accounts: readonly Account[];
}) {
  const edit = useSubEnvelopeEdit(subEnvelope);
  const archive = useSubEnvelopeArchive(subEnvelope);

  if (edit.isEditing) {
    return (
      <SubEnvelopeEditFields
        name={edit.name}
        accounts={accounts}
        selectedAccountIds={edit.selectedAccountIds}
        canSave={edit.name.trim().length > 0 && edit.selectedAccountIds.size > 0}
        isPending={edit.updateSubEnvelope.isPending}
        isError={edit.updateSubEnvelope.isError}
        onNameChange={edit.setName}
        onToggleAccount={edit.toggleAccount}
        onCancel={edit.cancelEdit}
        onSave={edit.handleSave}
      />
    );
  }

  return (
    <SubEnvelopeRowDisplay
      subEnvelope={subEnvelope}
      balanceQuery={balanceQuery}
      onEdit={edit.startEdit}
      onToggleArchive={archive.toggleArchive}
      isArchivePending={archive.isPending}
      isArchiveError={archive.isError}
    />
  );
}

/**
 * `SubEnvelopeRow`'s non-editing display: name (with an "(archived)" suffix
 * when applicable) plus its balance and Edit/Archive controls — split out to
 * keep `SubEnvelopeRow` under the line/complexity caps.
 */
function SubEnvelopeRowDisplay(props: {
  subEnvelope: SubEnvelope;
  balanceQuery: BalanceQuery | undefined;
  onEdit: () => void;
  onToggleArchive: () => void;
  isArchivePending: boolean;
  isArchiveError: boolean;
}) {
  const { subEnvelope, balanceQuery } = props;
  const balanceText =
    balanceQuery === undefined || balanceQuery.isPending
      ? "…"
      : balanceQuery.isError
        ? "—"
        : formatCents(balanceQuery.data);
  const archiveLabel = subEnvelope.isArchived ? "Unarchive" : "Archive";
  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.subEnvelopeName}>
          {subEnvelope.name}
          {subEnvelope.isArchived ? " (archived)" : ""}
        </Text>
        <View style={styles.rowButtons}>
          <Text style={styles.subEnvelopeBalance}>{balanceText}</Text>
          <Pressable
            style={styles.editButton}
            disabled={props.isArchivePending}
            onPress={props.onEdit}
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </Pressable>
          <Pressable
            style={styles.editButton}
            disabled={props.isArchivePending}
            onPress={props.onToggleArchive}
          >
            <Text style={styles.editButtonText}>
              {props.isArchivePending ? "…" : archiveLabel}
            </Text>
          </Pressable>
        </View>
      </View>
      {props.isArchiveError && (
        <Text style={[styles.error, styles.rowError]}>Couldn&apos;t update — try again.</Text>
      )}
    </View>
  );
}

/** The revealed `SubEnvelopeRow`'s edit inputs/controls — split out to keep the parent under the line/complexity caps. */
function SubEnvelopeEditFields(props: {
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
  groupHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  groupName: {
    fontSize: 18,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  rowButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowError: {
    paddingLeft: 12,
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
