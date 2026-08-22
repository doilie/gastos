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
 * One `Account` row: read-only display plus an "Edit" control that reveals
 * pre-filled `AccountEditFields`, mirroring `AddAccountForm`'s split.
 */
function AccountRow({ account }: { account: Account }) {
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

  if (!isEditing) {
    return (
      <View style={styles.row}>
        <View>
          <Text style={styles.rowName}>{account.name}</Text>
          <Text style={styles.rowDetail}>{account.currency}</Text>
        </View>
        <Pressable style={styles.editButton} onPress={startEdit}>
          <Text style={styles.editButtonText}>Edit</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <AccountEditFields
      name={name}
      currency={currency}
      canSave={name.trim().length > 0 && isValidCurrency(currency)}
      isPending={updateAccount.isPending}
      isError={updateAccount.isError}
      onNameChange={setName}
      onCurrencyChange={(text) => setCurrency(text.toUpperCase())}
      onCancel={cancelEdit}
      onSave={handleSave}
    />
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
 * One `Category` row: read-only display plus an "Edit" control that reveals
 * pre-filled `CategoryEditFields`, mirroring `AddCategoryForm`'s split.
 */
function CategoryRow({ category }: { category: Category }) {
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

  if (!isEditing) {
    return (
      <View style={styles.row}>
        <Text style={styles.rowName}>
          {category.name}
          {category.isIncome ? " (income)" : ""}
        </Text>
        <Pressable style={styles.editButton} onPress={startEdit}>
          <Text style={styles.editButtonText}>Edit</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <CategoryEditFields
      name={name}
      isIncome={isIncome}
      canSave={name.trim().length > 0}
      isPending={updateCategory.isPending}
      isError={updateCategory.isError}
      onNameChange={setName}
      onToggleIsIncome={() => setIsIncome((current) => !current)}
      onCancel={cancelEdit}
      onSave={handleSave}
    />
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
