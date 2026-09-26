import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HauntedHouse, { HouseScene } from "./HauntedHouse";
import { ATTIC, DOOR, STORY, WINDOW, storyAt } from "./houseStory";

const rest = { figure: null, door: 1, peek: null, lurker: null };

describe("HouseScene", () => {
  it("draws the house as designed when nothing is happening", () => {
    const { container } = render(<HouseScene frame={rest} />);
    expect(container.querySelector("[data-part=figure]")).toBeNull();
    expect(container.querySelector("[data-part=peek]")).toBeNull();
    expect(container.querySelector("[data-part=door-light]")).toHaveAttribute("width", String(DOOR.width));
  });

  it("draws the stick figure where the story puts it", () => {
    const { container } = render(<HouseScene frame={storyAt(1)} />);
    const figure = container.querySelector("[data-part=figure]")!;
    expect(figure).not.toBeNull();
    expect(figure.getAttribute("transform")).toMatch(/^translate\(/);
  });

  it("mirrors the figure when it faces left", () => {
    const { container } = render(<HouseScene frame={storyAt(STORY.lookLeftAt + 0.3)} />);
    expect(container.querySelector("[data-part=figure]")!.getAttribute("transform")).toContain("scale(-1");
  });

  it("darkens the doorway when the door is shut", () => {
    const { container } = render(<HouseScene frame={storyAt(STORY.closedAt)} />);
    expect(container.querySelector("[data-part=door-light]")).toHaveAttribute("width", "0");
  });

  it("shows a silhouette in the upstairs window while peeking", () => {
    const { container } = render(<HouseScene frame={storyAt(STORY.peekFrom + 1)} />);
    expect(container.querySelector("[data-part=peek]")).not.toBeNull();
  });

  it("moves the head into the left pane, then the right pane, as it looks around", () => {
    const head = (t: number) => {
      const { container } = render(<HouseScene frame={storyAt(t)} />);
      return Number(container.querySelector("[data-part=peek] circle")!.getAttribute("cx"));
    };
    const centre = WINDOW.x + WINDOW.width / 2; // where the vertical window bar is
    expect(head(STORY.peekFrom + 1)).toBeLessThan(centre - 2); // clear of the bar, in the left pane
    expect(head(STORY.peekTo - 1)).toBeGreaterThan(centre + 2);
  });
});

describe("the figure in the attic", () => {
  const lurking = (p: number) =>
    render(<HouseScene frame={storyAt(STORY.lurkFrom + (STORY.lurkTo - STORY.lurkFrom) * p)} />).container;

  it("is only visible through the attic window", () => {
    const scene = lurking(0.5);
    const lurker = scene.querySelector("[data-part=lurker]")!;
    expect(lurker).not.toBeNull();
    expect(lurker.getAttribute("clip-path")).toBe("url(#sb-attic)");
    expect(scene.querySelector("#sb-attic rect")).toHaveAttribute("width", String(ATTIC.width));
  });

  it("has glowing red eyes once it has risen", () => {
    expect(lurking(0.01).querySelector("[data-part=lurker-eyes]")).toHaveAttribute("opacity", "0");
    expect(lurking(0.6).querySelector("[data-part=lurker-eyes]")).toHaveAttribute("opacity", "1");
  });

  it("raises a knife above its head", () => {
    // The blade is drawn from the hand to the tip; the tip is its second point.
    const tipY = (p: number) => {
      const d = lurking(p).querySelector("[data-part=knife]")!.getAttribute("d")!;
      const numbers = [...d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]));
      return numbers[3]!;
    };
    expect(tipY(0.6)).toBeLessThan(tipY(0.01) - 4); // raised high, not held down
  });
});

describe("HauntedHouse", () => {
  afterEach(() => vi.restoreAllMocks());

  it("stays still for visitors who prefer reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (q) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    );
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const { container } = render(<HauntedHouse />);
    expect(raf).not.toHaveBeenCalled();
    expect(container.querySelector("[data-part=figure]")).toBeNull();
  });

  it("plays the story over time", () => {
    let frameCallback: FrameRequestCallback = () => {};
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frameCallback = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const now = vi.spyOn(performance, "now").mockReturnValue(0);

    const { container } = render(<HauntedHouse startDelay={0} />);
    act(() => frameCallback(1000)); // one second in: running toward the house
    expect(container.querySelector("[data-part=figure]")).not.toBeNull();
    now.mockRestore();
  });
});
