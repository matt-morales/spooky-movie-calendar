// Every story the haunted house can play. One is picked at random each time
// the page loads; add ?story=<id> to the URL to watch a particular one.
//
// To add a story: write stories/<name>.tsx exporting defineStory({...}) (see
// runForIt.tsx and HouseStory in ../scene.ts), add it to this list, and run
// the tests. stories/contract.test.tsx checks every story in the list.

import type { AnyHouseStory } from "../scene";
import { abduction } from "./abduction";
import { runForIt } from "./runForIt";

export const STORIES: AnyHouseStory[] = [runForIt, abduction];

export function pickStory(
  stories: readonly AnyHouseStory[],
  search: string = window.location.search,
  random: () => number = Math.random,
): AnyHouseStory {
  const wanted = new URLSearchParams(search).get("story");
  return stories.find((s) => s.id === wanted) ?? stories[Math.floor(random() * stories.length)]!;
}
