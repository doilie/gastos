import { render } from "@testing-library/react-native";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    ledger: {
      spendableBalance: {
        useQuery: jest.fn(),
      },
      addTransaction: {
        useMutation: jest.fn(),
      },
    },
    reference: {
      subEnvelopes: {
        useQuery: jest.fn(),
      },
    },
    useUtils: jest.fn(),
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

// Minimal shape of a `SubEnvelope` as read by `findSpendableAccountId` —
// a plain object literal is fine here since this suite tests `TodayScreen`'s
// wiring, not `@gastos/shared`'s validation.
interface MockSubEnvelope {
  id: string;
  name: string;
  groupId: string | null;
  accountIds: string[];
}

interface MockSubEnvelopesQueryResult {
  isPending: boolean;
  isError: boolean;
  data: MockSubEnvelope[] | undefined;
}

interface MockMutationResult {
  mutate: jest.Mock;
  isPending: boolean;
  isError: boolean;
  reset: jest.Mock;
}

const mockUseQuery = trpc.ledger.spendableBalance
  .useQuery as unknown as jest.Mock<MockQueryResult>;
const mockSubEnvelopesUseQuery = trpc.reference.subEnvelopes
  .useQuery as unknown as jest.Mock<MockSubEnvelopesQueryResult>;
const mockAddTransactionUseMutation = trpc.ledger.addTransaction
  .useMutation as unknown as jest.Mock<MockMutationResult>;
const mockUseUtils = trpc.useUtils as unknown as jest.Mock<{
  ledger: { spendableBalance: { invalidate: jest.Mock } };
}>;

describe("TodayScreen", () => {
  beforeEach(() => {
    // Default wiring for `QuickAddForm`'s own hooks — these existing tests
    // exercise `TodayScreen`'s three balance states, not the quick-add form
    // itself (that's covered in QuickAddForm.test.tsx), so these are
    // harmless no-ops plus one Spendable-shaped sub-envelope so the "+ Add"
    // button ends up enabled.
    mockSubEnvelopesUseQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: [
        {
          id: "spendable",
          name: "Spendable",
          groupId: null,
          accountIds: ["acc-1"],
        },
      ],
    });
    mockAddTransactionUseMutation.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      isError: false,
      reset: jest.fn(),
    });
    mockUseUtils.mockReturnValue({
      ledger: { spendableBalance: { invalidate: jest.fn() } },
    });
  });

  afterEach(() => {
    mockUseQuery.mockReset();
    mockSubEnvelopesUseQuery.mockReset();
    mockAddTransactionUseMutation.mockReset();
    mockUseUtils.mockReset();
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
