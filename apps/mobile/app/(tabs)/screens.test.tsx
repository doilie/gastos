import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";

import BudgetScreen from "./budget";
import CardsScreen from "./cards";
import EnvelopesScreen from "./envelopes";
import TodayScreen from "./index";
import MoreScreen from "./more";
import ReportsScreen from "./reports";

type ScreenCase = [
  name: string,
  Screen: () => ReactElement,
  title: string,
  subtitle: string,
];

const cases: ScreenCase[] = [
  [
    "Today",
    TodayScreen,
    "Today",
    "Spendable balance and quick-add — coming soon",
  ],
  [
    "Envelopes",
    EnvelopesScreen,
    "Envelopes",
    "Envelope groups and sub-envelope balances — coming soon",
  ],
  [
    "Cards",
    CardsScreen,
    "Cards",
    "Credit card cycles and purchases — coming soon",
  ],
  ["Budget", BudgetScreen, "Budget", "Payday allocation — coming soon"],
  [
    "Reports",
    ReportsScreen,
    "Reports",
    "Spending and income reports — coming soon",
  ],
  [
    "More",
    MoreScreen,
    "More",
    "Accounts, categories, and settings — coming soon",
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
