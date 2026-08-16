import { formatCents } from "@gastos/shared";
import { StyleSheet, Text, View } from "react-native";

import { trpc } from "../../lib/trpc";

/**
 * Today tab: shows the Spendable envelope's derived balance, read straight
 * from `ledger.spendableBalance`. Quick-add is a later increment.
 */
export default function TodayScreen() {
  const spendableBalance = trpc.ledger.spendableBalance.useQuery();

  if (spendableBalance.isPending) {
    return (
      <View style={styles.container}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (spendableBalance.isError) {
    return (
      <View style={styles.container}>
        <Text>Something went wrong.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Today</Text>
      {/* Currency-aware formatting (per-account currencies, no resolved
          "base currency" concept yet) is deferred future work — show the
          plain formatted number for now. */}
      <Text style={styles.balance}>{formatCents(spendableBalance.data)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "600",
  },
  balance: {
    marginTop: 8,
    fontSize: 40,
    fontWeight: "700",
  },
});
