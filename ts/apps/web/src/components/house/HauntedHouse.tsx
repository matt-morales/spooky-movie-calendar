import { useEffect, useRef, useState, type RefObject } from "react";
import { HouseScene } from "./HouseScene";
import type { AnyHouseStory, SceneFrame } from "./scene";
import { STORIES, pickStory } from "./stories";

// The haunted house in the sidebar, acting out a story picked at random when
// the page loads.

export default function HauntedHouse({
  stories = STORIES,
  random = Math.random,
  startDelay = 1.5,
}: {
  stories?: readonly AnyHouseStory[];
  random?: () => number;
  startDelay?: number;
}) {
  const [story] = useState(() => pickStory(stories, window.location.search, random));
  const ref = useRef<HTMLDivElement>(null);
  const frame = useStoryFrame(story, startDelay, ref);
  return <HouseScene story={story} frame={frame} ref={ref} />;
}

// Longest step the story clock takes in one frame, so it pauses (rather than
// jumps ahead) while the tab is in the background.
const MAX_STEP_MS = 100;

/**
 * The story's current frame, driven by requestAnimationFrame. It's cheap:
 *  - it only re-renders when the frame actually changes (not during rests),
 *  - it stops entirely while the house is scrolled out of view, and resumes
 *    where it left off,
 *  - it never starts for visitors who prefer reduced motion.
 */
function useStoryFrame(story: AnyHouseStory, startDelay: number, ref: RefObject<HTMLElement | null>): SceneFrame {
  const [frame, setFrame] = useState(story.still);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let elapsed = -startDelay * 1000; // ms of story time; negative while waiting to start
    let last: number | null = null;
    let raf = 0;
    let shown = JSON.stringify(story.still);

    const tick = (now: number) => {
      if (last !== null) elapsed += Math.min(now - last, MAX_STEP_MS);
      last = now;
      if (elapsed >= 0) {
        const next = story.frameAt((elapsed / 1000) % story.loop);
        const key = JSON.stringify(next);
        if (key !== shown) {
          shown = key;
          setFrame(next);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf) return;
      last = null;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const el = ref.current;
    if (typeof IntersectionObserver === "undefined" || !el) {
      start();
      return stop;
    }
    const observer = new IntersectionObserver(([entry]) => (entry?.isIntersecting ? start() : stop()));
    observer.observe(el);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [story, startDelay, ref]);

  return frame;
}
