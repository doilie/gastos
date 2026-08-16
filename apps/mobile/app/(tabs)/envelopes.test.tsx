import { render } from "@testing-library/react-native";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    reference: {
      envelopeGroups: {
        useQuery: jest.fn(),
      },
      subEnvelopes: {
        useQuery: jest.fn(),
      },
    },
    useQueries: jest.fn(),
  },
}));

import { centsFromInt, formatCents } from "@gastos/shared";

import { trpc } from "../../lib/trpc";
import EnvelopesScreen from "./envelopes";

// The component only reads `isPending`, `isError`, and `data` off each query
// result, so the mocks only need to supply those fields — not full
// `UseQueryResult`/`UseTRPCQueryResult` shapes.
interface MockQueryResult<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}

// Minimal shapes of `EnvelopeGroup`/`SubEnvelope` as read by `EnvelopesScreen`
// — plain object literals are fine here since this suite tests the screen's
// wiring, not `@gastos/shared`'s validation.
interface MockEnvelopeGroup {
  id: string;
  name: string;
}

interface MockSubEnvelope {
  id: string;
  name: string;
  groupId: string | null;
  accountIds: string[];
}

const mockEnvelopeGroupsUseQuery = trpc.reference.envelopeGroups
  .useQuery as unknown as jest.Mock<MockQueryResult<MockEnvelopeGroup[]>>;
const mockSubEnvelopesUseQuery = trpc.reference.subEnvelopes
  .useQuery as unknown as jest.Mock<MockQueryResult<MockSubEnvelope[]>>;
const mockUseQueries = trpc.useQueries as unknown as jest.Mock<
  MockQueryResult<number>[]
>;

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

afterEach(() => {
  mockEnvelopeGroupsUseQuery.mockReset();
  mockSubEnvelopesUseQuery.mockReset();
  mockUseQueries.mockReset();
});

describe("EnvelopesScreen loading state", () => {
  it("renders Loading… while envelopeGroups is pending", async () => {
    mockEnvelopeGroupsUseQuery.mockReturnValue(pending());
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockUseQueries.mockReturnValue([]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });

  it("renders Loading… while subEnvelopes is pending (not envelopeGroups)", async () => {
    mockEnvelopeGroupsUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(pending());
    mockUseQueries.mockReturnValue([]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Loading…")).toBeTruthy();
  });
});

describe("EnvelopesScreen error state", () => {
  it("renders an error message when envelopeGroups errors", async () => {
    mockEnvelopeGroupsUseQuery.mockReturnValue(errored());
    mockSubEnvelopesUseQuery.mockReturnValue(success([]));
    mockUseQueries.mockReturnValue([]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });

  it("renders an error message when subEnvelopes errors (not envelopeGroups)", async () => {
    mockEnvelopeGroupsUseQuery.mockReturnValue(success([]));
    mockSubEnvelopesUseQuery.mockReturnValue(errored());
    mockUseQueries.mockReturnValue([]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Something went wrong.")).toBeTruthy();
  });
});

const everydayGroup: MockEnvelopeGroup = { id: "grp-1", name: "Everyday" };
const groceriesFund: MockSubEnvelope = {
  id: "sub-1",
  name: "Groceries Fund",
  groupId: "grp-1",
  accountIds: ["acc-1"],
};
const spendable: MockSubEnvelope = {
  id: "spendable",
  name: "Spendable",
  groupId: null,
  accountIds: ["acc-1"],
};

/** Wires the two list queries with one group + one grouped + one Spendable sub-envelope. */
function mockOneGroupWithOneSubEnvelope(): void {
  mockEnvelopeGroupsUseQuery.mockReturnValue(success([everydayGroup]));
  mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund, spendable]));
}

describe("EnvelopesScreen success state", () => {
  it("renders groups and grouped sub-envelopes, excluding Spendable", async () => {
    mockOneGroupWithOneSubEnvelope();
    const balance = centsFromInt(300000);
    mockUseQueries.mockReturnValue([success(balance)]);

    const { getByText, queryByText } = await render(<EnvelopesScreen />);

    expect(getByText("Envelopes")).toBeTruthy();
    expect(getByText("Everyday")).toBeTruthy();
    expect(getByText("Groceries Fund")).toBeTruthy();
    expect(getByText(formatCents(balance))).toBeTruthy();
    expect(queryByText("Spendable")).toBeNull();
  });

  it('shows "…" for a sub-envelope whose balance query is still pending', async () => {
    mockOneGroupWithOneSubEnvelope();
    mockUseQueries.mockReturnValue([pending()]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Everyday")).toBeTruthy();
    expect(getByText("Groceries Fund")).toBeTruthy();
    expect(getByText("…")).toBeTruthy();
  });

  it('shows "—" for a sub-envelope whose balance query errored', async () => {
    mockOneGroupWithOneSubEnvelope();
    mockUseQueries.mockReturnValue([errored()]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Everyday")).toBeTruthy();
    expect(getByText("Groceries Fund")).toBeTruthy();
    expect(getByText("—")).toBeTruthy();
  });

  it("renders a group's heading even when it has no sub-envelopes", async () => {
    const emptyGroup: MockEnvelopeGroup = { id: "grp-2", name: "Savings" };
    mockEnvelopeGroupsUseQuery.mockReturnValue(
      success([everydayGroup, emptyGroup]),
    );
    mockSubEnvelopesUseQuery.mockReturnValue(success([groceriesFund, spendable]));
    const balance = centsFromInt(300000);
    mockUseQueries.mockReturnValue([success(balance)]);

    const { getByText } = await render(<EnvelopesScreen />);

    expect(getByText("Everyday")).toBeTruthy();
    expect(getByText("Savings")).toBeTruthy();
  });
});
