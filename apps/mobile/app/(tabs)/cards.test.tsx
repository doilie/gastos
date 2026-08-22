import { fireEvent, render, within } from "@testing-library/react-native";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    cards: {
      creditCards: {
        useQuery: jest.fn(),
      },
      cardPurchases: {
        useQuery: jest.fn(),
      },
    },
  },
}));

import {
  type CardPurchase,
  type CreditCard,
  cardCycleContaining,
  cardPurchaseIdFromString,
  centsFromInt,
  createCardPurchase,
  createCreditCard,
  creditCardIdFromString,
  currencyCodeFromString,
  formatCents,
  ledgerDateFromString,
  sumCardPurchasesInCycle,
} from "@gastos/shared";

import { trpc } from "../../lib/trpc";
import CardsScreen from "./cards";

// The component only reads `isPending`, `isError`, and `data` off each query
// result, so the mocks only need to supply those fields — not full
// `UseTRPCQueryResult` shapes (same approach as envelopes.test.tsx).
interface MockQueryResult<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}

const mockCreditCardsUseQuery = trpc.cards.creditCards
  .useQuery as unknown as jest.Mock<MockQueryResult<CreditCard[]>>;
const mockCardPurchasesUseQuery = trpc.cards.cardPurchases
  .useQuery as unknown as jest.Mock<MockQueryResult<CardPurchase[]>>;

/** A pending query result, used for the "still loading" states. */
function pending<T>(): MockQueryResult<T> {
  return { isPending: true, isError: false, data: undefined };
}

/** A successful query result carrying `data`. */
function success<T>(data: T): MockQueryResult<T> {
  return { isPending: false, isError: false, data };
}

/** An errored query result. */
function errored<T>(): MockQueryResult<T> {
  return { isPending: false, isError: true, data: undefined };
}

// `cards.tsx` computes "today" live via `new Date()` and feeds it into
// `cardCycleContaining`, so the cycle window it derives is otherwise
// dependent on wall-clock time at test-run time. Pinning the system clock
// (rather than picking fixture dates "far enough" from an unknown real
// "today") lets every assertion below hand-compute an exact expected cycle
// via the real `cardCycleContaining`/`sumCardPurchasesInCycle` — jest 29's
// modern fake timers + `setSystemTime` work cleanly under the jest-expo
// preset (verified locally), so there's no need to fall back to relative
// dates. Pinned at UTC noon so `toISOString().slice(0, 10)` can't roll to an
// adjacent day regardless of the host machine's timezone.
const PINNED_TODAY = "2024-06-10";

beforeAll(() => {
  jest.useFakeTimers({ advanceTimers: false });
  jest.setSystemTime(new Date(`${PINNED_TODAY}T12:00:00.000Z`));
});

afterAll(() => {
  jest.useRealTimers();
});

afterEach(() => {
  mockCreditCardsUseQuery.mockReset();
  mockCardPurchasesUseQuery.mockReset();
});

const php = currencyCodeFromString("PHP");

// Visa: cutoffDay 17. Relative to PINNED_TODAY (2024-06-10, on-or-before this
// month's 17th cutoff), its current cycle is 2024-05-18 – 2024-06-17.
const visaId = creditCardIdFromString("cc-1");
const visa: CreditCard = createCreditCard({
  id: visaId,
  name: "Visa",
  currency: php,
  cutoffDay: 17,
});

// Mastercard: cutoffDay 25. Its current cycle is 2024-05-26 – 2024-06-25.
const mastercardId = creditCardIdFromString("cc-2");
const mastercard: CreditCard = createCreditCard({
  id: mastercardId,
  name: "Mastercard",
  currency: php,
  cutoffDay: 25,
});

const groceries: CardPurchase = createCardPurchase({
  id: cardPurchaseIdFromString("p-1"),
  creditCardId: visaId,
  date: ledgerDateFromString("2024-06-01"),
  description: "Groceries",
  categoryId: null,
  amount: centsFromInt(5000),
});

const gas: CardPurchase = createCardPurchase({
  id: cardPurchaseIdFromString("p-2"),
  creditCardId: visaId,
  date: ledgerDateFromString("2024-06-05"),
  description: "Gas",
  categoryId: null,
  amount: centsFromInt(2500),
});

// After Visa's cycle end (2024-06-17) — must not appear under Visa.
const outsideCyclePurchase: CardPurchase = createCardPurchase({
  id: cardPurchaseIdFromString("p-3"),
  creditCardId: visaId,
  date: ledgerDateFromString("2024-06-20"),
  description: "Outside Cycle Purchase",
  categoryId: null,
  amount: centsFromInt(9999),
});

const subscription: CardPurchase = createCardPurchase({
  id: cardPurchaseIdFromString("p-4"),
  creditCardId: mastercardId,
  date: ledgerDateFromString("2024-06-12"),
  description: "Subscription",
  categoryId: null,
  amount: centsFromInt(9900),
});

// Visa fixtures for cycle-navigation coverage: Coffee/Tea fall in Visa's
// *previous* cycle (2024-04-18 – 2024-05-17) relative to PINNED_TODAY's
// current cycle (2024-05-18 – 2024-06-17); Old Rent/Utilities fall in the
// cycle *two before* that (2024-03-18 – 2024-04-17). Each pair sums to a
// total distinct from either individual amount, and from the current
// cycle's own total (groceries + gas), so `getByText` on a cycle-total
// figure never ambiguously matches a purchase row instead (same rationale
// as the "multiple cards" test above).
const coffee: CardPurchase = createCardPurchase({
  id: cardPurchaseIdFromString("p-7"),
  creditCardId: visaId,
  date: ledgerDateFromString("2024-05-01"),
  description: "Coffee",
  categoryId: null,
  amount: centsFromInt(300),
});

const tea: CardPurchase = createCardPurchase({
  id: cardPurchaseIdFromString("p-8"),
  creditCardId: visaId,
  date: ledgerDateFromString("2024-05-03"),
  description: "Tea",
  categoryId: null,
  amount: centsFromInt(150),
});

const oldRent: CardPurchase = createCardPurchase({
  id: cardPurchaseIdFromString("p-9"),
  creditCardId: visaId,
  date: ledgerDateFromString("2024-04-01"),
  description: "Old Rent",
  categoryId: null,
  amount: centsFromInt(50000),
});

const utilities: CardPurchase = createCardPurchase({
  id: cardPurchaseIdFromString("p-10"),
  creditCardId: visaId,
  date: ledgerDateFromString("2024-03-20"),
  description: "Utilities",
  categoryId: null,
  amount: centsFromInt(20000),
});

/** Hand-computes the expected cycle-total text for `card` as viewed from
 * `referenceDate`, using the real domain functions (not a hardcoded
 * literal). */
function expectedCycleTotalTextAt(
  card: CreditCard,
  referenceDate: string,
  purchases: readonly CardPurchase[],
): string {
  const cycle = cardCycleContaining(card.cutoffDay, ledgerDateFromString(referenceDate));
  return formatCents(sumCardPurchasesInCycle(purchases, cycle));
}

/** Same as `expectedCycleTotalTextAt`, pinned to `PINNED_TODAY` — the
 * default view every non-navigation test in this file exercises. */
function expectedCycleTotalText(card: CreditCard, purchases: readonly CardPurchase[]): string {
  return expectedCycleTotalTextAt(card, PINNED_TODAY, purchases);
}

/** Hand-computes the expected cycle-range heading text (`"{start} –
 * {end}"`) for `card` as viewed from `referenceDate`, using the real domain
 * function (not a hardcoded literal) — mirrors `CycleNavigation`'s own
 * `{cycle.start} – {cycle.end}` rendering in `cards.tsx`. */
function expectedCycleRangeText(card: CreditCard, referenceDate: string): string {
  const cycle = cardCycleContaining(card.cutoffDay, ledgerDateFromString(referenceDate));
  return `${cycle.start} – ${cycle.end}`;
}

describe("CardsScreen loading state", () => {
  it("renders Loading… while creditCards is pending", async () => {
    mockCreditCardsUseQuery.mockReturnValue(pending());
    mockCardPurchasesUseQuery.mockReturnValue(success([]));

    const { getByText } = await render(<CardsScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });

  it("renders Loading… while cardPurchases is pending (not creditCards)", async () => {
    mockCreditCardsUseQuery.mockReturnValue(success([]));
    mockCardPurchasesUseQuery.mockReturnValue(pending());

    const { getByText } = await render(<CardsScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });
});

describe("CardsScreen error state", () => {
  it("renders an error message when creditCards errors", async () => {
    mockCreditCardsUseQuery.mockReturnValue(errored());
    mockCardPurchasesUseQuery.mockReturnValue(success([]));

    const { getByText } = await render(<CardsScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });

  it("renders an error message when cardPurchases errors (not creditCards)", async () => {
    mockCreditCardsUseQuery.mockReturnValue(success([]));
    mockCardPurchasesUseQuery.mockReturnValue(errored());

    const { getByText } = await render(<CardsScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });
});

describe("CardsScreen success state", () => {
  it("renders a card's in-cycle purchases and cycle total, excluding a purchase outside the cycle", async () => {
    mockCreditCardsUseQuery.mockReturnValue(success([visa]));
    mockCardPurchasesUseQuery.mockReturnValue(
      success([groceries, gas, outsideCyclePurchase]),
    );

    const { getByText, queryByText } = await render(<CardsScreen />);

    expect(getByText("Cards")).toBeTruthy();
    expect(getByText("Visa")).toBeTruthy();
    expect(getByText("Groceries")).toBeTruthy();
    expect(getByText("Gas")).toBeTruthy();
    expect(queryByText("Outside Cycle Purchase")).toBeNull();

    const expectedTotal = expectedCycleTotalText(visa, [
      groceries,
      gas,
      outsideCyclePurchase,
    ]);
    expect(getByText(expectedTotal)).toBeTruthy();
  });

  it('renders "No purchases this cycle" for a card whose only purchase falls outside its cycle', async () => {
    const outsideMastercardCycle = createCardPurchase({
      id: cardPurchaseIdFromString("p-5"),
      creditCardId: mastercardId,
      date: ledgerDateFromString("2024-04-01"),
      description: "Old Subscription",
      categoryId: null,
      amount: centsFromInt(1500),
    });
    mockCreditCardsUseQuery.mockReturnValue(success([mastercard]));
    mockCardPurchasesUseQuery.mockReturnValue(success([outsideMastercardCycle]));

    const { getByText, queryByText } = await render(<CardsScreen />);

    expect(getByText("Mastercard")).toBeTruthy();
    expect(getByText("No purchases this cycle")).toBeTruthy();
    expect(queryByText("Old Subscription")).toBeNull();
  });
});

// Split into its own `describe` (rather than a third `it` alongside the two
// above) purely to keep each `describe` callback's line count under the
// `max-lines-per-function` cap — the assertions themselves belong with the
// rest of the success-state coverage.
describe("CardsScreen success state — multiple cards", () => {
  it("renders multiple cards independently, each showing only its own purchases", async () => {
    // Each card gets two in-cycle purchases so its cycle total (the sum)
    // never happens to equal either individual purchase's amount text —
    // otherwise `within(section).getByText(total)` would ambiguously match
    // both the total row and a purchase row showing the same figure.
    const cloudStorage: CardPurchase = createCardPurchase({
      id: cardPurchaseIdFromString("p-6"),
      creditCardId: mastercardId,
      date: ledgerDateFromString("2024-06-15"),
      description: "Cloud Storage",
      categoryId: null,
      amount: centsFromInt(100),
    });
    mockCreditCardsUseQuery.mockReturnValue(success([visa, mastercard]));
    mockCardPurchasesUseQuery.mockReturnValue(
      success([groceries, gas, subscription, cloudStorage]),
    );

    const { getByText } = await render(<CardsScreen />);

    expect(getByText("Visa")).toBeTruthy();
    expect(getByText("Mastercard")).toBeTruthy();

    const visaSection = getByText("Visa").parent;
    const mastercardSection = getByText("Mastercard").parent;
    if (!visaSection || !mastercardSection) {
      throw new Error("expected each card name to have an enclosing section view");
    }

    expect(within(visaSection).getByText("Groceries")).toBeTruthy();
    expect(within(visaSection).getByText("Gas")).toBeTruthy();
    expect(within(visaSection).queryByText("Subscription")).toBeNull();
    expect(within(visaSection).queryByText("Cloud Storage")).toBeNull();
    expect(
      within(visaSection).getByText(expectedCycleTotalText(visa, [groceries, gas])),
    ).toBeTruthy();

    expect(within(mastercardSection).getByText("Subscription")).toBeTruthy();
    expect(within(mastercardSection).getByText("Cloud Storage")).toBeTruthy();
    expect(within(mastercardSection).queryByText("Groceries")).toBeNull();
    expect(within(mastercardSection).queryByText("Gas")).toBeNull();
    expect(
      within(mastercardSection).getByText(
        expectedCycleTotalText(mastercard, [subscription, cloudStorage]),
      ),
    ).toBeTruthy();
  });
});

// Covers the Prev/Next billing-cycle drilldown navigation added to
// `CreditCardSection`/`CycleNavigation` in cards.tsx. A single card (Visa,
// cutoffDay 17) is used throughout so each test's assertions can focus on
// which cycle is displayed rather than re-deriving a second card's cycle
// math too.
describe("CardsScreen cycle navigation", () => {
  const navPurchases = [groceries, gas, coffee, tea, oldRent, utilities];

  it("shows the cycle containing today by default, with Next disabled", async () => {
    mockCreditCardsUseQuery.mockReturnValue(success([visa]));
    mockCardPurchasesUseQuery.mockReturnValue(success(navPurchases));

    const { getByText } = await render(<CardsScreen />);

    expect(getByText(expectedCycleRangeText(visa, PINNED_TODAY))).toBeTruthy();
    expect(getByText("Groceries")).toBeTruthy();
    expect(getByText("Gas")).toBeTruthy();
    expect(getByText(expectedCycleTotalText(visa, navPurchases))).toBeTruthy();
    expect(getByText("Next ›")).toBeDisabled();
  });

  it("moves back one cycle on Prev, showing that cycle's purchases and total", async () => {
    mockCreditCardsUseQuery.mockReturnValue(success([visa]));
    mockCardPurchasesUseQuery.mockReturnValue(success(navPurchases));

    const { getByText, queryByText } = await render(<CardsScreen />);

    await fireEvent.press(getByText("‹ Prev"));

    expect(getByText(expectedCycleRangeText(visa, "2024-05-17"))).toBeTruthy();
    expect(getByText("Coffee")).toBeTruthy();
    expect(getByText("Tea")).toBeTruthy();
    expect(getByText(expectedCycleTotalTextAt(visa, "2024-05-17", navPurchases))).toBeTruthy();
    expect(queryByText("Groceries")).toBeNull();
    expect(queryByText("Gas")).toBeNull();
    expect(queryByText("Old Rent")).toBeNull();
    expect(queryByText("Utilities")).toBeNull();
  });

  it("returns to the current cycle on Next after one Prev, re-disabling Next", async () => {
    mockCreditCardsUseQuery.mockReturnValue(success([visa]));
    mockCardPurchasesUseQuery.mockReturnValue(success(navPurchases));

    const { getByText, queryByText } = await render(<CardsScreen />);

    await fireEvent.press(getByText("‹ Prev"));
    await fireEvent.press(getByText("Next ›"));

    expect(getByText(expectedCycleRangeText(visa, PINNED_TODAY))).toBeTruthy();
    expect(getByText("Groceries")).toBeTruthy();
    expect(getByText("Gas")).toBeTruthy();
    expect(getByText(expectedCycleTotalText(visa, navPurchases))).toBeTruthy();
    expect(queryByText("Coffee")).toBeNull();
    expect(queryByText("Tea")).toBeNull();
    expect(getByText("Next ›")).toBeDisabled();
  });

  it("moves back two cycles after two Prev taps in a row", async () => {
    mockCreditCardsUseQuery.mockReturnValue(success([visa]));
    mockCardPurchasesUseQuery.mockReturnValue(success(navPurchases));

    const { getByText, queryByText } = await render(<CardsScreen />);

    await fireEvent.press(getByText("‹ Prev"));
    await fireEvent.press(getByText("‹ Prev"));

    expect(getByText(expectedCycleRangeText(visa, "2024-04-17"))).toBeTruthy();
    expect(getByText("Old Rent")).toBeTruthy();
    expect(getByText("Utilities")).toBeTruthy();
    expect(getByText(expectedCycleTotalTextAt(visa, "2024-04-17", navPurchases))).toBeTruthy();
    expect(queryByText("Coffee")).toBeNull();
    expect(queryByText("Tea")).toBeNull();
    expect(queryByText("Groceries")).toBeNull();
    expect(queryByText("Gas")).toBeNull();
    expect(getByText("Next ›")).not.toBeDisabled();
  });
});
