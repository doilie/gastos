import { formatCents, type BudgetLine, type PaydaySchedule, type SubEnvelope } from "@gastos/shared";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { trpc } from "../../lib/trpc";

/**
 * Budget tab: read-only display of the seeded `PaydaySchedule`s and
 * `BudgetLine`s. Applying/confirming a budget line into the ledger (the
 * `budget.applyBudgetLine`/`applyBudgetLines` mutations) is later,
 * separate UI work — mirroring how Today's quick-add mutation came after
 * its initial read-only balance wiring.
 */
export default function BudgetScreen() {
  const paydaySchedules = trpc.budget.paydaySchedules.useQuery();
  const budgetLines = trpc.budget.budgetLines.useQuery();
  const subEnvelopes = trpc.reference.subEnvelopes.useQuery();

  if (paydaySchedules.isPending || budgetLines.isPending || subEnvelopes.isPending) {
    return (
      <View style={styles.container}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (paydaySchedules.isError || budgetLines.isError || subEnvelopes.isError) {
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
          <PaydayScheduleSummary key={schedule.id} schedule={schedule} />
        ))}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Budget lines</Text>
        {budgetLines.data.map((line) => (
          <BudgetLineRow key={line.id} line={line} subEnvelopes={subEnvelopes.data} />
        ))}
      </View>
    </ScrollView>
  );
}

/** Renders one `PaydaySchedule`'s name plus its configured payday days. */
function PaydayScheduleSummary({ schedule }: { schedule: PaydaySchedule }) {
  const days = schedule.paydayDaysOfMonth.join(", ");
  return (
    <Text style={styles.scheduleText}>
      {schedule.name} — paydays on day {days}
    </Text>
  );
}

/**
 * Renders one `BudgetLine`: its target sub-envelope's resolved name (falling
 * back to the raw `subEnvelopeId` if no match is found), description,
 * payday date, and amount.
 */
function BudgetLineRow({
  line,
  subEnvelopes,
}: {
  line: BudgetLine;
  subEnvelopes: readonly SubEnvelope[];
}) {
  const subEnvelopeName =
    subEnvelopes.find((subEnvelope) => subEnvelope.id === line.subEnvelopeId)?.name ??
    line.subEnvelopeId;

  return (
    <View style={styles.row}>
      <View>
        <Text style={styles.lineSubEnvelope}>{subEnvelopeName}</Text>
        <Text style={styles.lineDescription}>{line.description}</Text>
        <Text style={styles.lineDate}>{line.paydayDate}</Text>
      </View>
      <Text style={styles.lineAmount}>{formatCents(line.amount)}</Text>
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
  sectionHeading: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  scheduleText: {
    fontSize: 16,
    paddingLeft: 12,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingLeft: 12,
  },
  lineSubEnvelope: {
    fontSize: 16,
    fontWeight: "600",
  },
  lineDescription: {
    fontSize: 14,
  },
  lineDate: {
    fontSize: 12,
    color: "#666",
  },
  lineAmount: {
    fontSize: 16,
    fontWeight: "600",
  },
});
