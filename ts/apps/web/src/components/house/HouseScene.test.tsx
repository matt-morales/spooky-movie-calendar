import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseScene } from "./HouseScene";
import { DOOR, defineStory, type SceneFrame } from "./scene";

interface Frame extends SceneFrame {
  who: string;
}

const story = defineStory<Frame>({
  id: "test",
  title: "Test",
  loop: 10,
  still: { door: 1, who: "" },
  frameAt: () => ({ door: 1, who: "" }),
  Inside: ({ frame }) => (frame.who ? <circle data-testid="inside" /> : null),
  Outside: ({ frame }) => (frame.who ? <circle data-testid="outside" /> : null),
});

// A frame of the test story (typed as the stage sees it).
const frame = (who: string, door = 1): SceneFrame => ({ door, who }) as Frame;

const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("HouseScene", () => {
  it("draws the story's actors in their layers", () => {
    const { container, getByTestId } = render(<HouseScene story={story} frame={frame("someone")} />);
    const inside = getByTestId("inside");
    const outside = getByTestId("outside");
    const bars = container.querySelector("[data-part=window-bars]")!;
    const trees = container.querySelector("[data-part=near-trees]")!;

    // Inside the windows: behind the window bars. Outdoors: over the ground,
    // behind the big trees in front.
    expect(follows(inside, bars)).toBe(true);
    expect(follows(bars, outside)).toBe(true);
    expect(follows(outside, trees)).toBe(true);
  });

  it("opens and shuts the door for the story", () => {
    const open = render(<HouseScene story={story} frame={frame("")} />).container;
    expect(open.querySelector("[data-part=door-light]")).toHaveAttribute("width", String(DOOR.width));
    const shut = render(<HouseScene story={story} frame={frame("", 0)} />).container;
    expect(shut.querySelector("[data-part=door-light]")).toHaveAttribute("width", "0");
  });

  it("gives stories the window clip paths to draw through", () => {
    const { container } = render(<HouseScene story={story} frame={story.still} />);
    expect(container.querySelector("#sb-window")).not.toBeNull();
    expect(container.querySelector("#sb-attic")).not.toBeNull();
  });
});
