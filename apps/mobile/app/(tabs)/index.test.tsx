import { render } from "@testing-library/react-native";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    ledger: {
      spendableBalance: {
        useQuery: jest.fn(),
      },
    },
  },
}));

import { centsFromInt, formatCents } from "@gastos/shared";

import { trpc } from "../../lib/trpc";
import TodayScreen from "./index";

// The component only reads `isPending`, `isError`, and `data` off the query
// result, so the mock only needs to supply those fields — not a full
// `UseQueryResult<Cents, unknown>` shape.
interface MockQueryResult {
  isPending: boolean;
  isError: boolean;
  data: number | undefined;
}

const mockUseQuery = trpc.ledger.spendableBalance
  .useQuery as unknown as jest.Mock<MockQueryResult>;

describe("TodayScreen", () => {
  afterEach(() => {
    mockUseQuery.mockReset();
  });

  it("renders a loading state while the query is pending", async () => {
    mockUseQuery.mockReturnValue({
      isPending: true,
      isError: false,
      data: undefined,
    });

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });

  it("renders an error state when the query fails", async () => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      isError: true,
      data: undefined,
    });

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });

  it("renders the formatted spendable balance on success", async () => {
    const balance = centsFromInt(4790950);
    mockUseQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: balance,
    });

    const { getByText } = await render(<TodayScreen />);

    expect(getByText("Today")).toBeTruthy();
    expect(getByText(formatCents(balance))).toBeTruthy();
  });
});
