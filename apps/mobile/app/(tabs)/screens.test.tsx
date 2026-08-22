import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";

import ReportsScreen from "./reports";

// Today (./index) is intentionally NOT covered here: it now calls
// trpc.ledger.spendableBalance.useQuery() and renders one of three
// network-dependent states (loading/error/success) instead of a static
// PlaceholderScreen title+subtitle, so it can't share this generic table.
// Its dedicated coverage lives in ./index.test.tsx.
//
// Envelopes (./envelopes) is likewise intentionally NOT covered here: it now
// calls trpc.reference.envelopeGroups.useQuery()/subEnvelopes.useQuery()/
// useQueries() and renders network-dependent states instead of a static
// PlaceholderScreen title+subtitle. Its dedicated coverage lives in
// ./envelopes.test.tsx.
//
// Cards (./cards) is likewise intentionally NOT covered here: it now calls
// trpc.cards.creditCards.useQuery()/cardPurchases.useQuery() and renders
// network-dependent states instead of a static PlaceholderScreen
// title+subtitle. Its dedicated coverage lives in ./cards.test.tsx.
//
// Budget (./budget) is likewise intentionally NOT covered here: it now calls
// trpc.budget.paydaySchedules.useQuery()/budgetLines.useQuery()/
// trpc.reference.subEnvelopes.useQuery() and renders network-dependent
// states instead of a static PlaceholderScreen title+subtitle. Its dedicated
// coverage lives in ./budget.test.tsx.
//
// More (./more) is likewise intentionally NOT covered here: it now calls
// trpc.reference.accounts.useQuery()/categories.useQuery() and renders
// network-dependent states instead of a static PlaceholderScreen
// title+subtitle. Its dedicated coverage lives in ./more.test.tsx.

type ScreenCase = [
  name: string,
  Screen: () => ReactElement,
  title: string,
  subtitle: string,
];

const cases: ScreenCase[] = [
  [
    "Reports",
    ReportsScreen,
    "Reports",
    "Spending and income reports — coming soon",
  ],
];

describe("tab screens", () => {
  it.each(cases)(
    "%s screen renders its title and subtitle",
    async (_name, Screen, title, subtitle) => {
      const { getByText } = await render(<Screen />);

      expect(getByText(title)).toBeTruthy();
      expect(getByText(subtitle)).toBeTruthy();
    },
  );
});
