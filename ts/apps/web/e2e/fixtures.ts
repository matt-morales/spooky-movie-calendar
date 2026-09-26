import { chromium, test as base, type Locator, type Page } from "@playwright/test";

// With ANDROID_CDP set (see scripts/android-e2e.sh), tests drive the real
// Chrome inside an Android emulator over the DevTools protocol, instead of
// launching a browser on this machine. Android Chrome can't open isolated
// contexts, so tests share its one context and each gets a fresh tab.
const cdp = process.env.ANDROID_CDP;

export const test = cdp
  ? base.extend({
      browser: [
        // eslint-disable-next-line no-empty-pattern
        async ({}, use) => {
          // Don't close it afterwards: that would quit Chrome on the phone.
          await use(await chromium.connectOverCDP(cdp));
        },
        { scope: "worker" },
      ],
      context: async ({ browser }, use) => {
        const context = browser.contexts()[0]!;
        await context.clearCookies();
        await use(context);
      },
      page: async ({ context, baseURL }, use) => {
        const page = await context.newPage();
        await page.bringToFront(); // touches only reach the tab on screen
        // Playwright only applies baseURL to contexts it creates, so resolve paths here.
        const goto = page.goto.bind(page);
        page.goto = (url, options) => goto(new URL(url, baseURL).href, options);
        // Start each test with the site's saved state (watched movies, etc.) cleared.
        await page.goto(baseURL!);
        await page.evaluate(() => localStorage.clear());
        await use(page);
        await page.close();
      },
    })
  : base;

export { expect } from "@playwright/test";

/** Taps the middle of `target` with a real touch, on emulated phones and on Android alike. */
export async function tap(target: Locator) {
  await target.waitFor();
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await tapAt(target.page(), box.x + box.width / 2, box.y + box.height / 2);
}

/** Taps the screen at `x`, `y` (CSS px from the top left of the viewport). */
export async function tapAt(page: Page, x: number, y: number) {
  // Playwright's own tap needs a browser it launched with touch enabled.
  if (!cdp) return page.touchscreen.tap(x, y);
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}
