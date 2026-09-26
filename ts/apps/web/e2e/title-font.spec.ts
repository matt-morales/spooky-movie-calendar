import { expect, test } from "@playwright/test";

// The hero title uses Bebas Neue, a narrow display font. If the page ever
// paints it in a fallback font first, the wider letters overflow: "NIGHTS"
// is clipped to "NIGHT" and the "S" of "MOVIES" wraps onto its own line.

test("fonts are self-hosted, not fetched from Google", async ({ page }) => {
  const thirdParty: string[] = [];
  page.on("request", (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) thirdParty.push(r.url());
  });
  await page.goto("/");
  await page.locator(".title").waitFor();
  expect(thirdParty).toEqual([]);
});

test("the title font is preloaded with the HTML", async ({ page }) => {
  await page.goto("/");
  const preloaded = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]')].map((l) => l.href),
  );
  expect(preloaded.some((href) => /bebas-neue/i.test(href))).toBe(true);
});

test("the title never renders in a fallback font", async ({ page }) => {
  // Delay our own font file, as on a slow first visit.
  await page.route(/\/fonts\/bebas-neue/, async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.goto("/", { waitUntil: "commit" });
  const title = page.locator(".title");
  await title.waitFor({ state: "attached" });

  // While the font is loading, the title must be invisible (font-display:
  // block), not drawn in a wider fallback font.
  const whileLoading = await title.evaluate((el) => {
    const loaded = document.fonts.check('40px "Bebas Neue"');
    const face = [...document.fonts].find((f) => f.family.replace(/"/g, "") === "Bebas Neue");
    return { loaded, display: face?.display };
  });
  if (!whileLoading.loaded) expect(whileLoading.display).toBe("block");

  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('40px "Bebas Neue"'))).toBe(true);
});

test("every line of the title fits its column", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.locator(".title").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator(".title")).toHaveText(/31\s*NIGHTS OF\s*HALL\s*WEEN\s*MOVIES/i);
});
