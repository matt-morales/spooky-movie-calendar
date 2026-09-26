import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HauntedHouse from "./HauntedHouse";
import { defineStory, type SceneFrame } from "./scene";

// A fake story: something moves for the first 2 seconds, then nothing
// changes until it loops at 10.
interface Frame extends SceneFrame {
  x: number;
}
let outsideRenders = 0;
const moving = defineStory<Frame>({
  id: "moving",
  title: "Moving",
  loop: 10,
  still: { door: 1, x: -1 },
  frameAt: (t) => (t < 2 ? { door: 1, x: Math.round(t * 100) } : { door: 1, x: -1 }),
  Outside: ({ frame }) => {
    outsideRenders++;
    return frame.x >= 0 ? <circle data-testid="actor" data-x={frame.x} /> : null;
  },
});
const other = defineStory<Frame>({ ...moving, id: "other", Outside: () => <rect data-testid="other" /> } as never);

// Drive requestAnimationFrame by hand, 16ms at a time.
let callbacks: FrameRequestCallback[] = [];
let now = 0;
function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) {
    now += 16;
    const due = callbacks;
    callbacks = [];
    act(() => due.forEach((cb) => cb(now)));
  }
}

// A controllable IntersectionObserver: tests decide when the house is on screen.
let setVisible: (visible: boolean) => void = () => {};
class FakeIntersectionObserver {
  constructor(private cb: IntersectionObserverCallback) {
    setVisible = (visible) =>
      act(() => this.cb([{ isIntersecting: visible } as IntersectionObserverEntry], this as never));
  }
  observe() {
    setVisible(true);
  }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  callbacks = [];
  now = 0;
  outsideRenders = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => callbacks.push(cb));
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
    callbacks = [];
  });
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const actorX = (c: HTMLElement) => Number(c.querySelector("[data-testid=actor]")?.getAttribute("data-x") ?? NaN);

describe("HauntedHouse", () => {
  it("plays the chosen story over time", () => {
    const { container } = render(<HauntedHouse stories={[moving]} startDelay={0} />);
    advance(500);
    expect(actorX(container)).toBeGreaterThan(40);
    expect(actorX(container)).toBeLessThan(60);
  });

  it("picks a story at random", () => {
    const { queryByTestId } = render(<HauntedHouse stories={[moving, other]} random={() => 0.9} startDelay={0} />);
    advance(100);
    expect(queryByTestId("other")).not.toBeNull();
  });

  it("doesn't redraw while nothing is changing", () => {
    render(<HauntedHouse stories={[moving]} startDelay={0} />);
    advance(2500); // past the moving part
    const before = outsideRenders;
    advance(3000); // three quiet seconds
    expect(outsideRenders).toBe(before);
  });

  it("pauses while scrolled out of view, then carries on where it left off", () => {
    const { container } = render(<HauntedHouse stories={[moving]} startDelay={0} />);
    advance(500);
    const x = actorX(container);

    setVisible(false);
    advance(5000);
    expect(callbacks).toHaveLength(0); // no frames are requested off-screen
    expect(actorX(container)).toBe(x);

    setVisible(true);
    advance(100);
    expect(actorX(container)).toBeGreaterThan(x);
    expect(actorX(container)).toBeLessThan(x + 20); // resumed, didn't jump ahead 5s
  });

  it("stays still for visitors who prefer reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (q) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    );
    const { container } = render(<HauntedHouse stories={[moving]} startDelay={0} />);
    advance(500);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid=actor]")).toBeNull();
  });
});
