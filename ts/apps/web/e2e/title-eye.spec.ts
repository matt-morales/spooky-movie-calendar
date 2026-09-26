import { expect, test, type Page } from "@playwright/test";

// The eye in the title dozes when left alone and is startled by any new mouse
// movement or tap (see src/components/eye.ts).

const pupil = (page: Page) =>
  page.locator(".eye").evaluate((el) => Number(getComputedStyle(el).getPropertyValue("--pupil")));

test("is startled by a tap or mouse move", async ({ page }) => {
  await page.goto("/");
  await page.locator(".eye").waitFor();
  await page.waitForTimeout(2000);
  const { width } = page.viewportSize()!;
  const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  if (touch) await page.touchscreen.tap(width - 10, 200);
  else await page.mouse.move(width - 10, 200, { steps: 3 });
  await expect.poll(() => pupil(page)).toBeLessThan(0.7);
});

test("stays still with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator(".eye").waitFor();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(2500);
  expect(await pupil(page)).toBe(1);
});
