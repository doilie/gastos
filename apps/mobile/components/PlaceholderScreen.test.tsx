import { render } from "@testing-library/react-native";

import { PlaceholderScreen } from "./PlaceholderScreen";

describe("PlaceholderScreen", () => {
  it("renders both the title and subtitle text", async () => {
    const { getByText } = await render(
      <PlaceholderScreen title="X" subtitle="Y" />,
    );

    expect(getByText("X")).toBeTruthy();
    expect(getByText("Y")).toBeTruthy();
  });
});
