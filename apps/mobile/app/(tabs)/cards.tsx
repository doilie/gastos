import {
  type CardPurchase,
  cardCycleContaining,
  type CreditCard,
  formatCents,
  isDateWithinCardCycle,
  type LedgerDate,
  ledgerDateFromString,
  sumCardPurchasesInCycle,
} from "@gastos/shared";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { trpc } from "../../lib/trpc";

/** Same one-liner as `QuickAddForm.tsx`'s `todayLedgerDate` — not worth
 * extracting into a shared util yet for a single duplicated line. */
function todayLedgerDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Cards tab: one section per `CreditCard` showing its current billing
 * cycle's date range, total spend, and the list of purchases in that cycle.
 * Drilling into past cycles and the settlement/payment-allocation flow are
 * later increments — this is read-only display of the current cycle only.
 */
export default function CardsScreen() {
  const creditCards = trpc.cards.creditCards.useQuery();
  const cardPurchases = trpc.cards.cardPurchases.useQuery();

  if (creditCards.isPending || cardPurchases.isPending) {
    return (
      <View style={styles.container}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (creditCards.isError || cardPurchases.isError) {
    return (
      <View style={styles.container}>
        <Text>Something went wrong.</Text>
      </View>
    );
  }

  const today = ledgerDateFromString(todayLedgerDate());

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Cards</Text>
      {creditCards.data.map((card) => (
        <CreditCardSection
          key={card.id}
          card={card}
          today={today}
          purchases={cardPurchases.data.filter((purchase) => purchase.creditCardId === card.id)}
        />
      ))}
    </ScrollView>
  );
}

/** Renders one `CreditCard`'s current-cycle heading plus its purchase list. */
function CreditCardSection({
  card,
  today,
  purchases,
}: {
  card: CreditCard;
  today: LedgerDate;
  purchases: readonly CardPurchase[];
}) {
  const cycle = cardCycleContaining(card.cutoffDay, today);
  const cycleTotal = sumCardPurchasesInCycle(purchases, cycle);
  const cyclePurchases = purchases.filter((purchase) =>
    isDateWithinCardCycle(purchase.date, cycle),
  );

  return (
    <View style={styles.section}>
      <Text style={styles.cardName}>{card.name}</Text>
      <Text style={styles.cycleRange}>
        {cycle.start} – {cycle.end}
      </Text>
      <Text style={styles.cycleTotal}>{formatCents(cycleTotal)}</Text>
      {cyclePurchases.length === 0 ? (
        <Text style={styles.emptyText}>No purchases this cycle</Text>
      ) : (
        cyclePurchases.map((purchase) => (
          <CardPurchaseRow key={purchase.id} purchase={purchase} />
        ))
      )}
    </View>
  );
}

/** Renders one card purchase's description, date, and amount. */
function CardPurchaseRow({ purchase }: { purchase: CardPurchase }) {
  return (
    <View style={styles.row}>
      <View>
        <Text style={styles.purchaseDescription}>{purchase.description}</Text>
        <Text style={styles.purchaseDate}>{purchase.date}</Text>
      </View>
      <Text style={styles.purchaseAmount}>{formatCents(purchase.amount)}</Text>
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
  cardName: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  cycleRange: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  cycleTotal: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    paddingLeft: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingLeft: 12,
  },
  purchaseDescription: {
    fontSize: 16,
  },
  purchaseDate: {
    fontSize: 12,
    color: "#666",
  },
  purchaseAmount: {
    fontSize: 16,
    fontWeight: "600",
  },
});
