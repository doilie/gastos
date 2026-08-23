import {
  type Account,
  type AccountId,
  type CardPurchase,
  cardCycleContaining,
  type CreditCard,
  formatCents,
  isDateWithinCardCycle,
  type LedgerDate,
  ledgerDateFromString,
  SPENDABLE_ENVELOPE_ID,
  type SubEnvelope,
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
 * (and back to the present) per card. Each `CardPurchaseRow` also has a
 * "Settle" control wiring `cards.settleCardPurchase` into the ledger for that
 * single purchase — the multi-purchase "Settle cycle" batch mutation/UI
 * remains a separate, later increment.
 */
export default function CardsScreen() {
  const creditCards = trpc.cards.creditCards.useQuery();
  const cardPurchases = trpc.cards.cardPurchases.useQuery();
  const subEnvelopes = trpc.reference.subEnvelopes.useQuery();
  const accounts = trpc.reference.accounts.useQuery();

  const isPending =
    creditCards.isPending ||
    cardPurchases.isPending ||
    subEnvelopes.isPending ||
    accounts.isPending;
  const isError =
    creditCards.isError || cardPurchases.isError || subEnvelopes.isError || accounts.isError;

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
          subEnvelopes={subEnvelopes.data}
          accounts={accounts.data}
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
  subEnvelopes,
  accounts,
}: {
  card: CreditCard;
  today: LedgerDate;
  purchases: readonly CardPurchase[];
  subEnvelopes: readonly SubEnvelope[];
  accounts: readonly Account[];
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
          <CardPurchaseRow
            key={purchase.id}
            purchase={purchase}
            subEnvelopes={subEnvelopes}
            accounts={accounts}
          />
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

/** Renders one card purchase's description, date, amount, and settle controls. */
function CardPurchaseRow({
  purchase,
  subEnvelopes,
  accounts,
}: {
  purchase: CardPurchase;
  subEnvelopes: readonly SubEnvelope[];
  accounts: readonly Account[];
}) {
  return (
    <View style={styles.rowContainer}>
      <View style={styles.row}>
        <View>
          <Text style={styles.purchaseDescription}>{purchase.description}</Text>
          <Text style={styles.purchaseDate}>{purchase.date}</Text>
        </View>
        <Text style={styles.purchaseAmount}>{formatCents(purchase.amount)}</Text>
      </View>
      <CardPurchaseSettleControls
        purchase={purchase}
        subEnvelopes={subEnvelopes}
        accounts={accounts}
      />
    </View>
  );
}

/**
 * Resolves the fixed `subEnvelopeId` a settlement of `purchase` must use, per
 * its `FundingSource` — `"account"` funding has no natural sub-envelope, so
 * this defaults to the reserved Spendable envelope (this app's established
 * "defaults to Spendable" convention, see `QuickAddForm`). `"envelope"`
 * funding must settle against that exact sub-envelope (the domain function
 * enforces it). `"none"` has no valid target at all.
 */
function settlementSubEnvelopeIdForPurchase(purchase: CardPurchase): string | undefined {
  switch (purchase.fundingSource.kind) {
    case "account":
      return SPENDABLE_ENVELOPE_ID;
    case "envelope":
      return purchase.fundingSource.subEnvelopeId;
    case "none":
      return undefined;
  }
}

/**
 * Resolves the candidate `accountId`s a settlement of `purchase` may use, per
 * its `FundingSource` — `"account"` funding always settles against that
 * exact account (a single-element list, so `CardPurchaseSettleControls`
 * auto-settles with no picker). `"envelope"` funding may settle against any
 * of that sub-envelope's own linked accounts (possibly several, since a
 * `SubEnvelope` can span multiple accounts). `"none"` has no candidates.
 */
function candidateAccountIdsForPurchase(
  purchase: CardPurchase,
  subEnvelopes: readonly SubEnvelope[],
): readonly AccountId[] {
  const source = purchase.fundingSource;
  if (source.kind === "account") {
    return [source.accountId];
  }
  if (source.kind === "envelope") {
    const fundingSubEnvelope = subEnvelopes.find(
      (subEnvelope) => subEnvelope.id === source.subEnvelopeId,
    );
    return fundingSubEnvelope?.accountIds ?? [];
  }
  return [];
}

/** Resolves an account's display name, falling back to the raw id if unmatched. */
function accountName(accounts: readonly Account[], accountId: AccountId): string {
  return accounts.find((account) => account.id === accountId)?.name ?? accountId;
}

/**
 * The settle-to-ledger controls for one `CardPurchase` row: a single
 * "Settle" button when there's exactly one candidate account (or a disabled
 * button when there are none), or an inline account picker when there's more
 * than one — mirrors `budget.tsx`'s `BudgetLineApplyControls` exactly, with
 * one addition: an unfunded (`"none"`) purchase has no candidate account at
 * all, so it shows a "Not funded yet" label instead of a pointless disabled
 * button. On success/error shows a transient message; neither persists past
 * this component's lifetime, same accepted limitation as `applyBudgetLine`
 * (re-settling the same purchase would create a second `Transaction`).
 */
function CardPurchaseSettleControls({
  purchase,
  subEnvelopes,
  accounts,
}: {
  purchase: CardPurchase;
  subEnvelopes: readonly SubEnvelope[];
  accounts: readonly Account[];
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const utils = trpc.useUtils();
  const settleCardPurchase = trpc.cards.settleCardPurchase.useMutation({
    onSuccess: () => {
      void utils.cards.cardPurchases.invalidate();
      void utils.ledger.transactions.invalidate();
      void utils.ledger.subEnvelopeBalance.invalidate();
    },
  });

  const candidateAccountIds = candidateAccountIdsForPurchase(purchase, subEnvelopes);
  const subEnvelopeId = settlementSubEnvelopeIdForPurchase(purchase);

  function settleWithAccount(accountId: AccountId) {
    setIsPickerOpen(false);
    if (subEnvelopeId === undefined) {
      return;
    }
    settleCardPurchase.mutate({ purchaseId: purchase.id, accountId, subEnvelopeId });
  }

  function handleSettlePress() {
    const onlyAccountId = candidateAccountIds.length === 1 ? candidateAccountIds[0] : undefined;
    if (onlyAccountId !== undefined) {
      settleWithAccount(onlyAccountId);
      return;
    }
    setIsPickerOpen(true);
  }

  if (purchase.fundingSource.kind === "none") {
    return <Text style={styles.notFundedText}>Not funded yet</Text>;
  }

  return (
    <View style={styles.settleContainer}>
      <SettleButtonAndStatus
        candidateAccountIds={candidateAccountIds}
        isPickerOpen={isPickerOpen}
        accounts={accounts}
        settleCardPurchase={settleCardPurchase}
        onPress={handleSettlePress}
        onPick={settleWithAccount}
      />
    </View>
  );
}

/** The "Settle" button, its account picker, and its success/error status —
 * split out of `CardPurchaseSettleControls` to keep it under the length cap. */
function SettleButtonAndStatus({
  candidateAccountIds,
  isPickerOpen,
  accounts,
  settleCardPurchase,
  onPress,
  onPick,
}: {
  candidateAccountIds: readonly AccountId[];
  isPickerOpen: boolean;
  accounts: readonly Account[];
  settleCardPurchase: { isPending: boolean; isSuccess: boolean; isError: boolean };
  onPress: () => void;
  onPick: (accountId: AccountId) => void;
}) {
  return (
    <>
      <Pressable
        style={styles.settleButton}
        disabled={candidateAccountIds.length === 0 || settleCardPurchase.isPending}
        onPress={onPress}
      >
        <Text style={styles.settleButtonText}>
          {settleCardPurchase.isPending ? "Settling…" : "Settle"}
        </Text>
      </Pressable>
      {isPickerOpen && (
        <AccountPicker
          candidateAccountIds={candidateAccountIds}
          accounts={accounts}
          onPick={onPick}
        />
      )}
      {settleCardPurchase.isSuccess && <Text style={styles.settleSuccess}>Settled ✓</Text>}
      {settleCardPurchase.isError && (
        <Text style={styles.settleError}>Couldn&apos;t settle — try again.</Text>
      )}
    </>
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
  rowContainer: {
    paddingVertical: 6,
    paddingLeft: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  notFundedText: {
    marginTop: 4,
    fontSize: 13,
    color: "#666",
  },
  settleContainer: {
    marginTop: 6,
  },
  settleButton: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
  },
  settleButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  picker: {
    marginTop: 4,
  },
  pickerOption: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  settleSuccess: {
    marginTop: 4,
    fontSize: 13,
    color: "#0a0",
  },
  settleError: {
    marginTop: 4,
    fontSize: 13,
    color: "#c00",
  },
});
