import { formatCents, type Category, type CategoryId, type Cents } from "@gastos/shared";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { trpc } from "../../lib/trpc";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Computes the current calendar month as the `{year, month}` shape `reporting.categorySpending` takes. */
function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Renders "August 2026" for a given `{year, month}`. */
function periodLabel({ year, month }: { year: number; month: number }): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Resolves a category's display name, falling back to the raw id if unmatched. */
function categoryName(categories: readonly Category[], categoryId: CategoryId): string {
  return categories.find((category) => category.id === categoryId)?.name ?? categoryId;
}

/**
 * Reports tab: read-only display of the current calendar month's category
 * spending vs. income (`reporting.categorySpending`). No month picker, no
 * navigation to past/future months — that's a separate, later, not-yet-
 * scoped increment, matching every other tab's "MVP read-only first" pattern
 * (Cards shows only the current billing cycle, Budget has no
 * apply-tracking).
 */
export default function ReportsScreen() {
  const { year, month } = currentYearMonth();
  const report = trpc.reporting.categorySpending.useQuery({ year, month });
  const categories = trpc.reference.categories.useQuery();

  if (report.isPending || categories.isPending) {
    return (
      <View style={styles.container}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (report.isError || categories.isError) {
    return (
      <View style={styles.container}>
        <Text>Something went wrong.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Reports</Text>
      <Text style={styles.periodLabel}>{periodLabel(report.data.period)}</Text>
      <IncomeSection incomeTotal={report.data.incomeTotal} />
      <CategorySpendingSection
        spendingByCategory={report.data.spendingByCategory}
        categories={categories.data}
      />
    </ScrollView>
  );
}

/** Renders the "Income" row. */
function IncomeSection({ incomeTotal }: { incomeTotal: Cents }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>Income</Text>
      <View style={styles.row}>
        <Text style={styles.rowAmount}>{formatCents(incomeTotal)}</Text>
      </View>
    </View>
  );
}

/** Renders the "Spending by category" section: one row per category, or an empty-state message. */
function CategorySpendingSection({
  spendingByCategory,
  categories,
}: {
  spendingByCategory: readonly { readonly categoryId: CategoryId; readonly total: Cents }[];
  categories: readonly Category[];
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>Spending by category</Text>
      {spendingByCategory.length === 0 ? (
        <Text style={styles.emptyText}>No spending recorded this month.</Text>
      ) : (
        spendingByCategory.map((entry) => (
          <View key={entry.categoryId} style={styles.row}>
            <Text style={styles.rowName}>{categoryName(categories, entry.categoryId)}</Text>
            <Text style={styles.rowAmount}>{formatCents(entry.total)}</Text>
          </View>
        ))
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
  scrollContent: {
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "600",
    marginBottom: 4,
  },
  periodLabel: {
    fontSize: 16,
    color: "#666",
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
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
  rowAmount: {
    fontSize: 16,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    paddingLeft: 12,
  },
});
