import {
  formatCents,
  type Account,
  type AccountId,
  type BudgetLine,
  type PaydaySchedule,
  type SubEnvelope,
} from "@gastos/shared";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { trpc } from "../../lib/trpc";
import { Colors, Radius, Spacing, Typography } from "../../theme";

/**
 * Budget tab: read-only display of the seeded `PaydaySchedule`s and
 * `BudgetLine`s, plus the "apply" mutation UI on each `BudgetLineRow` —
 * wiring `budget.applyBudgetLine` into the ledger. Mirrors `QuickAddForm`'s
 * collapsed-button → inline-controls → mutate → invalidate pattern.
 *
 * `BudgetLine.isApplied` is real, server-persisted state (not a transient
 * mutation flag) — once a line has been applied, `BudgetLineApplyControls`
 * renders a persistent "Applied" label instead of the Apply
 * button/picker, and this survives navigating away from the tab and back,
 * since it's read straight from the `budget.budgetLines` query rather than
 * a mutation's local `isSuccess`.
 */
export default function BudgetScreen() {
  const paydaySchedules = trpc.budget.paydaySchedules.useQuery();
  const budgetLines = trpc.budget.budgetLines.useQuery();
  const subEnvelopes = trpc.reference.subEnvelopes.useQuery();
  const accounts = trpc.reference.accounts.useQuery();

  const isPending =
    paydaySchedules.isPending ||
    budgetLines.isPending ||
    subEnvelopes.isPending ||
    accounts.isPending;
  const isError =
    paydaySchedules.isError || budgetLines.isError || subEnvelopes.isError || accounts.isError;

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
          <BudgetLineRow
            key={line.id}
            line={line}
            subEnvelopes={subEnvelopes.data}
            accounts={accounts.data}
          />
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

/** Resolves an account's display name, falling back to the raw id if unmatched. */
function accountName(accounts: readonly Account[], accountId: AccountId): string {
  return accounts.find((account) => account.id === accountId)?.name ?? accountId;
}

/**
 * Renders one `BudgetLine`: its target sub-envelope's resolved name (falling
 * back to the raw `subEnvelopeId` if no match is found), description,
 * payday date, amount, and the apply-to-ledger controls.
 */
function BudgetLineRow({
  line,
  subEnvelopes,
  accounts,
}: {
  line: BudgetLine;
  subEnvelopes: readonly SubEnvelope[];
  accounts: readonly Account[];
}) {
  const targetSubEnvelope = subEnvelopes.find(
    (subEnvelope) => subEnvelope.id === line.subEnvelopeId,
  );
  const subEnvelopeName = targetSubEnvelope?.name ?? line.subEnvelopeId;
  const candidateAccountIds = targetSubEnvelope?.accountIds ?? [];

  return (
    <View style={styles.rowContainer}>
      <View style={styles.row}>
        <View>
          <Text style={styles.lineSubEnvelope}>{subEnvelopeName}</Text>
          <Text style={styles.lineDescription}>{line.description}</Text>
          <Text style={styles.lineDate}>{line.paydayDate}</Text>
        </View>
        <Text style={styles.lineAmount}>{formatCents(line.amount)}</Text>
      </View>
      <BudgetLineApplyControls
        budgetLineId={line.id}
        candidateAccountIds={candidateAccountIds}
        accounts={accounts}
        isApplied={line.isApplied}
      />
    </View>
  );
}

/**
 * The apply-to-ledger controls for one `BudgetLine` row. When `isApplied` is
 * `true` (real, server-persisted state), renders only a persistent "Applied"
 * label — no button, nothing clickable, since re-applying would now be
 * rejected server-side anyway. Otherwise renders a single "Apply" button
 * when the target sub-envelope has exactly one linked account (or is
 * disabled when it has none), or an inline account picker when it has more
 * than one. On error shows a transient inline message. Split out of
 * `BudgetLineRow` to keep it under the complexity/length caps.
 */
function BudgetLineApplyControls({
  budgetLineId,
  candidateAccountIds,
  accounts,
  isApplied,
}: {
  budgetLineId: string;
  candidateAccountIds: readonly AccountId[];
  accounts: readonly Account[];
  isApplied: boolean;
}) {
  if (isApplied) {
    return (
      <View style={styles.applyContainer}>
        <Text style={styles.appliedLabel}>Applied</Text>
      </View>
    );
  }

  return (
    <PendingApplyControls
      budgetLineId={budgetLineId}
      candidateAccountIds={candidateAccountIds}
      accounts={accounts}
    />
  );
}

/**
 * The not-yet-applied path of `BudgetLineApplyControls`: a single "Apply"
 * button when the target sub-envelope has exactly one linked account (or is
 * disabled when it has none), or an inline account picker when it has more
 * than one, plus a transient error message on failure. Split out to keep
 * `BudgetLineApplyControls` under the length cap.
 */
function PendingApplyControls({
  budgetLineId,
  candidateAccountIds,
  accounts,
}: {
  budgetLineId: string;
  candidateAccountIds: readonly AccountId[];
  accounts: readonly Account[];
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const utils = trpc.useUtils();
  const applyBudgetLine = trpc.budget.applyBudgetLine.useMutation({
    onSuccess: () => {
      void utils.budget.budgetLines.invalidate();
      void utils.ledger.subEnvelopeBalance.invalidate();
      void utils.ledger.transactions.invalidate();
    },
  });

  function applyToAccount(accountId: AccountId) {
    setIsPickerOpen(false);
    applyBudgetLine.mutate({ budgetLineId, accountId });
  }

  function handleApplyPress() {
    const onlyAccountId = candidateAccountIds.length === 1 ? candidateAccountIds[0] : undefined;
    if (onlyAccountId !== undefined) {
      applyToAccount(onlyAccountId);
      return;
    }
    setIsPickerOpen(true);
  }

  return (
    <View style={styles.applyContainer}>
      <Pressable
        style={styles.applyButton}
        disabled={candidateAccountIds.length === 0 || applyBudgetLine.isPending}
        onPress={handleApplyPress}
      >
        <Text style={styles.applyButtonText}>
          {applyBudgetLine.isPending ? "Applying…" : "Apply"}
        </Text>
      </Pressable>
      {isPickerOpen && (
        <AccountPicker
          candidateAccountIds={candidateAccountIds}
          accounts={accounts}
          onPick={applyToAccount}
        />
      )}
      {applyBudgetLine.isError && (
        <Text style={styles.applyError}>Couldn&apos;t apply — try again.</Text>
      )}
    </View>
  );
}

/** Inline list of one Pressable per candidate account, for the multi-account case. */
function AccountPicker({
  candidateAccountIds,
  accounts,
  onPick,
}: {
  candidateAccountIds: readonly AccountId[];
  accounts: readonly Account[];
  onPick: (accountId: AccountId) => void;
}) {
  return (
    <View style={styles.picker}>
      {candidateAccountIds.map((accountId) => (
        <Pressable
          key={accountId}
          style={styles.pickerOption}
          onPress={() => onPick(accountId)}
        >
          <Text>{accountName(accounts, accountId)}</Text>
        </Pressable>
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
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  title: {
    ...Typography.titleLarge,
    marginBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeading: {
    ...Typography.heading,
    marginBottom: Spacing.sm,
  },
  scheduleText: {
    ...Typography.body,
    paddingLeft: Spacing.md,
    marginBottom: Spacing.xs,
  },
  rowContainer: {
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lineSubEnvelope: {
    ...Typography.body,
    fontWeight: "600",
  },
  lineDescription: {
    ...Typography.detail,
  },
  lineDate: {
    ...Typography.detail,
    color: Colors.textMuted,
  },
  lineAmount: {
    ...Typography.body,
    fontWeight: "600",
  },
  applyContainer: {
    marginTop: Spacing.sm,
  },
  applyButton: {
    alignSelf: "flex-start",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.default,
  },
  applyButtonText: {
    ...Typography.detail,
    fontWeight: "600",
  },
  picker: {
    marginTop: Spacing.xs,
  },
  pickerOption: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  appliedLabel: {
    alignSelf: "flex-start",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    ...Typography.detail,
    fontWeight: "600",
    color: Colors.positive,
  },
  applyError: {
    marginTop: Spacing.xs,
    ...Typography.detail,
    color: Colors.error,
  },
});
