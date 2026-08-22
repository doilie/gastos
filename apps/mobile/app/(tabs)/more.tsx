import type { Account, Category } from "@gastos/shared";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { trpc } from "../../lib/trpc";

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

/** Renders the "Accounts" section: one row per `Account`. */
function AccountsSection({ accounts }: { accounts: readonly Account[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Accounts</Text>
      {accounts.map((account) => (
        <View key={account.id} style={styles.row}>
          <Text style={styles.rowName}>{account.name}</Text>
          <Text style={styles.rowDetail}>{account.currency}</Text>
        </View>
      ))}
    </View>
  );
}

/** Renders the "Categories" section: one row per `Category`. */
function CategoriesSection({ categories }: { categories: readonly Category[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Categories</Text>
      {categories.map((category) => (
        <View key={category.id} style={styles.row}>
          <Text style={styles.rowName}>
            {category.name}
            {category.isIncome ? " (income)" : ""}
          </Text>
        </View>
      ))}
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
});
