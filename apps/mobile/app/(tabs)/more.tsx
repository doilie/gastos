import type { Account, Category } from "@gastos/shared";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { trpc } from "../../lib/trpc";

/** Matches exactly 3 uppercase letters, e.g. "USD", "PHP". */
const CURRENCY_SHAPE = /^[A-Z]{3}$/;

/**
 * More tab: read-only display of `Account`s and `Category`s. No settings, no
 * CRUD, no editing — those are separate, larger, not-yet-scoped future
 * increments.
 */
export default function MoreScreen() {
  const accounts = trpc.reference.accounts.useQuery();
  const categories = trpc.reference.categories.useQuery();

  if (accounts.isPending || categories.isPending) {
    return (
      <View style={styles.container}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (accounts.isError || categories.isError) {
    return (
      <View style={styles.container}>
        <Text>Something went wrong.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>More</Text>
      <AccountsSection accounts={accounts.data} />
      <CategoriesSection categories={categories.data} />
    </ScrollView>
  );
}

/** Renders the "Accounts" section: one row per `Account`, plus an "+ Add account" form. */
function AccountsSection({ accounts }: { accounts: readonly Account[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Accounts</Text>
      {accounts.map((account) => (
        <AccountRow key={account.id} account={account} />
      ))}
      <AddAccountForm />
    </View>
  );
}

/** Renders the "Categories" section: one row per `Category`, plus an "+ Add category" form. */
function CategoriesSection({ categories }: { categories: readonly Category[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Categories</Text>
      {categories.map((category) => (
        <CategoryRow key={category.id} category={category} />
      ))}
      <AddCategoryForm />
    </View>
  );
}

/**
 * `AccountRow`'s name/currency edit state and `updateAccount` mutation — split
 * into its own hook so `AccountRow` itself stays under the line/complexity caps.
 */
function useAccountEdit(account: Account) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [currency, setCurrency] = useState<string>(account.currency);
  const utils = trpc.useUtils();
  const updateAccount = trpc.reference.updateAccount.useMutation({
    onSuccess: () => {
      void utils.reference.accounts.invalidate();
      setIsEditing(false);
    },
  });

  function startEdit() {
    setName(account.name);
    setCurrency(account.currency);
    updateAccount.reset();
    setIsEditing(true);
  }

  function cancelEdit() {
    setName(account.name);
    setCurrency(account.currency);
    updateAccount.reset();
    setIsEditing(false);
  }

  function handleSave() {
    // Always send both fields — simpler than diffing against the original, and the
    // mutation accepts idempotent same-value updates, so this is also correct.
    updateAccount.mutate({ id: account.id, name: name.trim(), currency });
  }

  return { isEditing, name, currency, setName, setCurrency, updateAccount, startEdit, cancelEdit, handleSave };
}

/**
 * `AccountRow`'s Archive/Unarchive state and mutations — split into its own
 * hook so `AccountRow` itself stays under the line/complexity caps.
 */
function useAccountArchive(account: Account) {
  const utils = trpc.useUtils();
  const archiveAccount = trpc.reference.archiveAccount.useMutation({
    onSuccess: () => void utils.reference.accounts.invalidate(),
  });
  const unarchiveAccount = trpc.reference.unarchiveAccount.useMutation({
    onSuccess: () => void utils.reference.accounts.invalidate(),
  });

  function toggleArchive() {
    if (account.isArchived) {
      unarchiveAccount.mutate({ id: account.id });
    } else {
      archiveAccount.mutate({ id: account.id });
    }
  }

  return {
    toggleArchive,
    isPending: archiveAccount.isPending || unarchiveAccount.isPending,
    isError: archiveAccount.isError || unarchiveAccount.isError,
  };
}

/**
 * One `Account` row: read-only display plus an "Edit" control that reveals
 * pre-filled `AccountEditFields`, mirroring `AddAccountForm`'s split. Also
 * offers an Archive/Unarchive toggle alongside the display.
 */
function AccountRow({ account }: { account: Account }) {
  const edit = useAccountEdit(account);
  const archive = useAccountArchive(account);

  if (!edit.isEditing) {
    return (
      <AccountRowDisplay
        account={account}
        onEdit={edit.startEdit}
        onToggleArchive={archive.toggleArchive}
        isArchivePending={archive.isPending}
        isArchiveError={archive.isError}
      />
    );
  }

  return (
    <AccountEditFields
      name={edit.name}
      currency={edit.currency}
      canSave={edit.name.trim().length > 0 && isValidCurrency(edit.currency)}
      isPending={edit.updateAccount.isPending}
      isError={edit.updateAccount.isError}
      onNameChange={edit.setName}
      onCurrencyChange={(text) => edit.setCurrency(text.toUpperCase())}
      onCancel={edit.cancelEdit}
      onSave={edit.handleSave}
    />
  );
}

/**
 * `AccountRow`'s non-editing display: name/currency (with an "(archived)" suffix
 * when applicable) plus Edit and Archive/Unarchive controls — split out to keep
 * `AccountRow` under the line/complexity caps.
 */
function AccountRowDisplay(props: {
  account: Account;
  onEdit: () => void;
  onToggleArchive: () => void;
  isArchivePending: boolean;
  isArchiveError: boolean;
}) {
  const { account } = props;
  const archiveLabel = account.isArchived ? "Unarchive" : "Archive";
  return (
    <View>
      <View style={styles.row}>
        <View>
          <Text style={styles.rowName}>{account.name}</Text>
          <Text style={styles.rowDetail}>
            {account.currency}
            {account.isArchived ? " (archived)" : ""}
          </Text>
        </View>
        <View style={styles.rowButtons}>
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

/** The revealed `AccountRow`'s edit inputs/controls — split out to keep the parent under the line/complexity caps. */
function AccountEditFields(props: {
  name: string;
  currency: string;
  canSave: boolean;
  isPending: boolean;
  isError: boolean;
  onNameChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
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
        placeholder="Currency (e.g. USD)"
        autoCapitalize="characters"
        value={props.currency}
        editable={!disabled}
        onChangeText={props.onCurrencyChange}
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
 * `CategoryRow`'s name/isIncome edit state and `updateCategory` mutation —
 * split into its own hook so `CategoryRow` itself stays under the
 * line/complexity caps.
 */
function useCategoryEdit(category: Category) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [isIncome, setIsIncome] = useState(category.isIncome);
  const utils = trpc.useUtils();
  const updateCategory = trpc.reference.updateCategory.useMutation({
    onSuccess: () => {
      void utils.reference.categories.invalidate();
      setIsEditing(false);
    },
  });

  function startEdit() {
    setName(category.name);
    setIsIncome(category.isIncome);
    updateCategory.reset();
    setIsEditing(true);
  }

  function cancelEdit() {
    setName(category.name);
    setIsIncome(category.isIncome);
    updateCategory.reset();
    setIsEditing(false);
  }

  function handleSave() {
    updateCategory.mutate({ id: category.id, name: name.trim(), isIncome });
  }

  return { isEditing, name, isIncome, setName, setIsIncome, updateCategory, startEdit, cancelEdit, handleSave };
}

/**
 * `CategoryRow`'s delete-confirmation state and `deleteCategory` mutation —
 * split into its own hook so `CategoryRow` itself stays under the
 * line/complexity caps.
 */
function useCategoryDelete(category: Category) {
  const [isConfirming, setIsConfirming] = useState(false);
  const utils = trpc.useUtils();
  const deleteCategory = trpc.reference.deleteCategory.useMutation({
    onSuccess: () => void utils.reference.categories.invalidate(),
  });

  function startDelete() {
    deleteCategory.reset();
    setIsConfirming(true);
  }

  function cancelDelete() {
    deleteCategory.reset();
    setIsConfirming(false);
  }

  function confirmDelete() {
    deleteCategory.mutate({ id: category.id });
  }

  const errorMessage = deleteCategory.isError
    ? deleteCategory.error?.message || "Couldn't delete — try again."
    : undefined;

  return {
    isConfirming,
    isPending: deleteCategory.isPending,
    errorMessage,
    startDelete,
    cancelDelete,
    confirmDelete,
  };
}

/**
 * One `Category` row: read-only display plus an "Edit" control that reveals
 * pre-filled `CategoryEditFields`, mirroring `AddCategoryForm`'s split. Also
 * offers a Delete control with an inline confirmation step.
 */
function CategoryRow({ category }: { category: Category }) {
  const edit = useCategoryEdit(category);
  const del = useCategoryDelete(category);

  if (edit.isEditing) {
    return (
      <CategoryEditFields
        name={edit.name}
        isIncome={edit.isIncome}
        canSave={edit.name.trim().length > 0}
        isPending={edit.updateCategory.isPending}
        isError={edit.updateCategory.isError}
        onNameChange={edit.setName}
        onToggleIsIncome={() => edit.setIsIncome((current) => !current)}
        onCancel={edit.cancelEdit}
        onSave={edit.handleSave}
      />
    );
  }

  return (
    <CategoryRowDisplay
      category={category}
      isConfirmingDelete={del.isConfirming}
      isDeletePending={del.isPending}
      deleteErrorMessage={del.errorMessage}
      onEdit={edit.startEdit}
      onStartDelete={del.startDelete}
      onCancelDelete={del.cancelDelete}
      onConfirmDelete={del.confirmDelete}
    />
  );
}

/**
 * `CategoryRow`'s non-editing display: name plus Edit and Delete controls, the
 * latter revealing an inline confirmation — split out to keep `CategoryRow`
 * under the line/complexity caps.
 */
function CategoryRowDisplay(props: {
  category: Category;
  isConfirmingDelete: boolean;
  isDeletePending: boolean;
  deleteErrorMessage: string | undefined;
  onEdit: () => void;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const { category } = props;
  const rowActionsDisabled = props.isConfirmingDelete || props.isDeletePending;
  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.rowName}>
          {category.name}
          {category.isIncome ? " (income)" : ""}
        </Text>
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
      {props.isConfirmingDelete && (
        <CategoryDeleteConfirm
          isPending={props.isDeletePending}
          errorMessage={props.deleteErrorMessage}
          onCancel={props.onCancelDelete}
          onConfirm={props.onConfirmDelete}
        />
      )}
    </View>
  );
}

/**
 * Inline "Delete this category?" confirmation revealed by `CategoryRowDisplay`'s
 * Delete button — shows the mutation's server-provided error message (e.g. "still
 * in use") when the delete fails, and stays open on error so the user can read it.
 */
function CategoryDeleteConfirm(props: {
  isPending: boolean;
  errorMessage: string | undefined;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.form}>
      <Text>Delete this category?</Text>
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

/** The revealed `CategoryRow`'s edit inputs/controls — split out to keep the parent under the line/complexity caps. */
function CategoryEditFields(props: {
  name: string;
  isIncome: boolean;
  canSave: boolean;
  isPending: boolean;
  isError: boolean;
  onNameChange: (value: string) => void;
  onToggleIsIncome: () => void;
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
      <Pressable
        style={styles.toggleButton}
        disabled={disabled}
        onPress={props.onToggleIsIncome}
      >
        <Text>{props.isIncome ? "Income" : "Expense"}</Text>
      </Pressable>
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

function isValidCurrency(currency: string): boolean {
  return CURRENCY_SHAPE.test(currency);
}

/**
 * Inline "+ Add account" form: collapsed to a single button until tapped,
 * mirroring `QuickAddForm`'s interaction pattern.
 */
function AddAccountForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");
  const utils = trpc.useUtils();
  const createAccount = trpc.reference.createAccount.useMutation({
    onSuccess: () => {
      void utils.reference.accounts.invalidate();
      closeForm();
    },
  });

  function closeForm() {
    setIsOpen(false);
    setName("");
    setCurrency("");
    createAccount.reset();
  }

  function handleSave() {
    createAccount.mutate({ name: name.trim(), currency });
  }

  if (!isOpen) {
    return (
      <Pressable style={styles.addButton} onPress={() => setIsOpen(true)}>
        <Text style={styles.addButtonText}>+ Add account</Text>
      </Pressable>
    );
  }

  const canSave = name.trim().length > 0 && isValidCurrency(currency);
  return (
    <AddAccountFields
      name={name}
      currency={currency}
      canSave={canSave}
      isPending={createAccount.isPending}
      isError={createAccount.isError}
      onNameChange={setName}
      onCurrencyChange={(text) => setCurrency(text.toUpperCase())}
      onCancel={closeForm}
      onSave={handleSave}
    />
  );
}

/** The revealed `AddAccountForm`'s inputs/controls — split out to keep the parent under the line/complexity caps. */
function AddAccountFields(props: {
  name: string;
  currency: string;
  canSave: boolean;
  isPending: boolean;
  isError: boolean;
  onNameChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
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
        placeholder="Currency (e.g. USD)"
        autoCapitalize="characters"
        value={props.currency}
        editable={!disabled}
        onChangeText={props.onCurrencyChange}
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
 * Inline "+ Add category" form: collapsed to a single button until tapped,
 * mirroring `QuickAddForm`'s interaction pattern. The income/expense toggle
 * is a plain `Pressable` (no `Switch` — not used elsewhere in this codebase).
 */
function AddCategoryForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [isIncome, setIsIncome] = useState(false);
  const utils = trpc.useUtils();
  const createCategory = trpc.reference.createCategory.useMutation({
    onSuccess: () => {
      void utils.reference.categories.invalidate();
      closeForm();
    },
  });

  function closeForm() {
    setIsOpen(false);
    setName("");
    setIsIncome(false);
    createCategory.reset();
  }

  function handleSave() {
    createCategory.mutate({ name: name.trim(), isIncome });
  }

  if (!isOpen) {
    return (
      <Pressable style={styles.addButton} onPress={() => setIsOpen(true)}>
        <Text style={styles.addButtonText}>+ Add category</Text>
      </Pressable>
    );
  }

  return (
    <AddCategoryFields
      name={name}
      isIncome={isIncome}
      canSave={name.trim().length > 0}
      isPending={createCategory.isPending}
      isError={createCategory.isError}
      onNameChange={setName}
      onToggleIsIncome={() => setIsIncome((current) => !current)}
      onCancel={closeForm}
      onSave={handleSave}
    />
  );
}

/** The revealed `AddCategoryForm`'s inputs/controls — split out to keep the parent under the line/complexity caps. */
function AddCategoryFields(props: {
  name: string;
  isIncome: boolean;
  canSave: boolean;
  isPending: boolean;
  isError: boolean;
  onNameChange: (value: string) => void;
  onToggleIsIncome: () => void;
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
      <Pressable
        style={styles.toggleButton}
        disabled={disabled}
        onPress={props.onToggleIsIncome}
      >
        <Text>{props.isIncome ? "Income" : "Expense"}</Text>
      </Pressable>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingLeft: 12,
  },
  rowName: {
    fontSize: 16,
  },
  rowDetail: {
    fontSize: 14,
    color: "#666",
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
  toggleButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    alignSelf: "flex-start",
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
