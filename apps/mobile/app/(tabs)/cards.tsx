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
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { trpc } from "../../lib/trpc";

/** Same one-liner as `QuickAddForm.tsx`'s `todayLedgerDate` — not worth
 * extracting into a shared util yet for a single duplicated line. */
function todayLedgerDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Shifts a `LedgerDate` by `delta` calendar days (UTC, no DST concerns since
 * `LedgerDate` is a plain `YYYY-MM-DD` string), re-validating the result. */
function shiftLedgerDateByDays(date: LedgerDate, delta: number): LedgerDate {
  const parsed = new Date(`${date}T00:00:00Z`);
  const shifted = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate() + delta),
  );
  return ledgerDateFromString(shifted.toISOString().slice(0, 10));
}

/**
 * Cards tab: one section per `CreditCard` showing a billing cycle's date
 * range, total spend, and the list of purchases in that cycle. Defaults to
 * the cycle containing today, with Prev/Next controls to browse past cycles
 * (and back to the present) per card. The settlement/payment-allocation flow
 * is still a later increment — this remains read-only.
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

/** Renders one `CreditCard`'s cycle heading (with Prev/Next navigation) plus
 * its purchase list. Defaults to the cycle containing `today`, but the user
 * can browse past cycles via `referenceDate` local state. */
function CreditCardSection({
  card,
  today,
  purchases,
}: {
  card: CreditCard;
  today: LedgerDate;
  purchases: readonly CardPurchase[];
}) {
  const [referenceDate, setReferenceDate] = useState<LedgerDate>(today);
  const cycle = cardCycleContaining(card.cutoffDay, referenceDate);
  const cycleTotal = sumCardPurchasesInCycle(purchases, cycle);
  const cyclePurchases = purchases.filter((purchase) =>
    isDateWithinCardCycle(purchase.date, cycle),
  );
  const isCurrentCycle = isDateWithinCardCycle(today, cycle);

  return (
    <View style={styles.section}>
      <Text style={styles.cardName}>{card.name}</Text>
      <CycleNavigation
        cycle={cycle}
        isCurrentCycle={isCurrentCycle}
        onPrev={() => setReferenceDate(shiftLedgerDateByDays(cycle.start, -1))}
        onNext={() => setReferenceDate(shiftLedgerDateByDays(cycle.end, 1))}
      />
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

/** Prev/heading/Next row for browsing a `CreditCardSection`'s cycles. Next is
 * disabled once the currently-displayed cycle already contains `today`. */
function CycleNavigation({
  cycle,
  isCurrentCycle,
  onPrev,
  onNext,
}: {
  cycle: { start: LedgerDate; end: LedgerDate };
  isCurrentCycle: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.cycleNavRow}>
      <Pressable style={styles.cycleNavButton} onPress={onPrev}>
        <Text style={styles.cycleNavButtonText}>‹ Prev</Text>
      </Pressable>
      <Text style={styles.cycleRange}>
        {cycle.start} – {cycle.end}
      </Text>
      <Pressable
        style={styles.cycleNavButton}
        disabled={isCurrentCycle}
        onPress={onNext}
      >
        <Text style={styles.cycleNavButtonText}>Next ›</Text>
      </Pressable>
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
  cycleNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  cycleNavButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  cycleNavButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  cycleRange: {
    fontSize: 14,
    color: "#666",
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
