import { formatCents, type Cents, type EnvelopeGroup, type SubEnvelope } from "@gastos/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { trpc } from "../../lib/trpc";

/** One sub-envelope's balance, keyed by `SubEnvelope.id`, from `useQueries`. */
type BalanceQuery = UseQueryResult<Cents>;
type BalancesById = ReadonlyMap<string, BalanceQuery | undefined>;

/**
 * Envelopes tab: envelope groups → sub-envelopes, each showing its derived
 * balance. The reserved Spendable envelope (`groupId: null`) is excluded —
 * it already has its own home on the Today tab.
 */
export default function EnvelopesScreen() {
  const envelopeGroups = trpc.reference.envelopeGroups.useQuery();
  const subEnvelopes = trpc.reference.subEnvelopes.useQuery();
  const groupedSubEnvelopes = (subEnvelopes.data ?? []).filter(
    (subEnvelope) => subEnvelope.groupId !== null,
  );
  const balanceQueries = trpc.useQueries((t) =>
    groupedSubEnvelopes.map((subEnvelope) =>
      t.ledger.subEnvelopeBalance({ subEnvelopeId: subEnvelope.id }),
    ),
  );

  if (envelopeGroups.isPending || subEnvelopes.isPending) {
    return (
      <View style={styles.container}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (envelopeGroups.isError || subEnvelopes.isError) {
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
        />
      ))}
    </ScrollView>
  );
}

/** Renders one `EnvelopeGroup` heading plus a row per sub-envelope in it. */
function EnvelopeGroupSection({
  group,
  subEnvelopes,
  balancesById,
}: {
  group: EnvelopeGroup;
  subEnvelopes: readonly SubEnvelope[];
  balancesById: BalancesById;
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
});
