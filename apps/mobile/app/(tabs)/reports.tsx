import { formatCents, type Category, type CategoryId, type Cents } from "@gastos/shared";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { trpc } from "../../lib/trpc";
import { Colors, Spacing, Typography } from "../../theme";

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

/**
 * Shifts `{year, month}` by `delta` calendar months (positive or negative),
 * rolling the year over correctly in either direction. Same technique as
 * `packages/shared/src/domain/card-cycle.ts`'s internal `shiftMonth` (not
 * exported, so reimplemented here per this repo's per-file duplication
 * convention for small helpers).
 */
function shiftYearMonth(
  { year, month }: { year: number; month: number },
  delta: number,
): { year: number; month: number } {
  const zeroIndexedMonth = month - 1 + delta;
  const newMonth = ((zeroIndexedMonth % 12) + 12) % 12;
  const yearOffset = Math.floor(zeroIndexedMonth / 12);
  return { year: year + yearOffset, month: newMonth + 1 };
}

/** Resolves a category's display name, falling back to the raw id if unmatched. */
function categoryName(categories: readonly Category[], categoryId: CategoryId): string {
  return categories.find((category) => category.id === categoryId)?.name ?? categoryId;
}

/**
 * Reports tab: read-only display of a chosen calendar month's category
 * spending vs. income (`reporting.categorySpending`), defaulting to the
 * current month with Prev/Next navigation (`MonthNavigation`) to browse past
 * months (and back to the present) — mirrors `cards.tsx`'s `CycleNavigation`
 * pattern. No navigation past the current month into the future.
 */
export default function ReportsScreen() {
  const [period, setPeriod] = useState(currentYearMonth());
  const report = trpc.reporting.categorySpending.useQuery({
    year: period.year,
    month: period.month,
  });
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
      <MonthNavigation
        period={period}
        isCurrentMonth={
          period.year === currentYearMonth().year && period.month === currentYearMonth().month
        }
        onPrev={() => setPeriod(shiftYearMonth(period, -1))}
        onNext={() => setPeriod(shiftYearMonth(period, 1))}
      />
      <IncomeSection incomeTotal={report.data.incomeTotal} />
      <CategorySpendingSection
        spendingByCategory={report.data.spendingByCategory}
        categories={categories.data}
      />
    </ScrollView>
  );
}

/** Prev/heading/Next row for browsing the Reports tab's displayed month.
 * Mirrors `cards.tsx`'s `CycleNavigation`. Prev is always enabled; Next is
 * disabled once the currently-displayed month already is the current
 * calendar month. */
function MonthNavigation({
  period,
  isCurrentMonth,
  onPrev,
  onNext,
}: {
  period: { year: number; month: number };
  isCurrentMonth: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.cycleNavRow}>
      <Pressable style={styles.cycleNavButton} onPress={onPrev}>
        <Text style={styles.cycleNavButtonText}>‹ Prev</Text>
      </Pressable>
      <Text style={styles.periodLabel}>{periodLabel(period)}</Text>
      <Pressable style={styles.cycleNavButton} disabled={isCurrentMonth} onPress={onNext}>
        <Text style={styles.cycleNavButtonText}>Next ›</Text>
      </Pressable>
    </View>
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
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  title: {
    ...Typography.titleLarge,
    marginBottom: Spacing.xs,
  },
  periodLabel: {
    ...Typography.body,
    color: Colors.textMuted,
  },
  cycleNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  cycleNavButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  cycleNavButtonText: {
    ...Typography.detail,
    fontWeight: "600",
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeading: {
    ...Typography.heading,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.md,
  },
  rowName: {
    ...Typography.body,
  },
  rowAmount: {
    ...Typography.body,
    fontWeight: "600",
  },
  emptyText: {
    ...Typography.detail,
    color: Colors.textMuted,
    paddingLeft: Spacing.md,
  },
});
