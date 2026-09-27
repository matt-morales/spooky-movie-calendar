import type { Locator, Page } from "@playwright/test";
import { expect, tap, test } from "./fixtures";

// Regression checks for the things visitors actually do, run on desktop and
// on phones (touch taps, real WebKit for iPhone). See playwright.config.ts.

const nights = (page: Page) => page.getByRole("group", { name: "Choose a night" }).getByRole("button");
const night = (page: Page, day: number) =>
  page.getByRole("group", { name: "Choose a night" }).getByRole("button", { name: new RegExp(`^${day}(, watched)?$`) });

// Tap on touch screens, click everywhere else.
async function press(target: Locator) {
  const touch = await target.page().evaluate(() => matchMedia("(pointer: coarse)").matches);
  if (touch) await tap(target);
  else await target.click();
}

// Collects uncaught errors and console errors for the whole test. Cloudflare's
// analytics beacon rejects localhost (a CORS error), so its errors are expected
// in dev; the API itself is same-origin, so no CORS error can come from us.
function watchErrors(page: Page) {
  const errors: string[] = [];
  const ours = (text: string, url = "") =>
    !/cloudflareinsights\.com|not allowed by Access-Control-Allow-Origin/.test(text + url);
  page.on("pageerror", (e) => ours(e.message) && errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && ours(m.text(), m.location().url)) errors.push(m.text());
  });
  return errors;
}

async function open(page: Page, path = "/2025") {
  await page.goto(path);
  await expect(nights(page)).toHaveCount(31);
  await expect(page.locator(".movie-section")).toHaveCount(31);
}

// The night's movie is on screen, just below the sticky calendar (not hidden
// under it, not left further down). Waits for the smooth scroll to finish.
async function expectLandedOn(page: Page, day: number) {
  const gap = async () => {
    const cal = (await page.locator(".sticky-cal").boundingBox())!;
    const box = (await page.locator(`#movie-${day}`).boundingBox())!;
    return Math.round(box.y - (cal.y + cal.height));
  };
  // The last nights can't scroll all the way up: the page ends first.
  const atBottom = () => page.evaluate(() => scrollY >= document.documentElement.scrollHeight - innerHeight - 1);
  await expect.poll(gap, { timeout: 5000 }).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => (await gap()) < 40 || (await atBottom()), { timeout: 5000 }).toBe(true);
}

// The scroll position once any smooth scrolling has finished.
async function settledScrollY(page: Page): Promise<number> {
  let last = -1;
  for (;;) {
    const y = await page.evaluate(() => scrollY);
    if (y === last) return y;
    last = y;
    await page.waitForTimeout(150);
  }
}

const scrollPageTo = (page: Page, y: number) => page.evaluate((y) => window.scrollTo(0, y), y);

test.describe("loading", () => {
  test("loads every night with no errors", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page);
    await expect(page.getByRole("heading", { name: "Christine" })).toBeVisible();
    await page.waitForTimeout(1000); // let the first effects and requests settle
    expect(errors).toEqual([]);
  });

  test("stays up over plain HTTP, where browsers have no crypto.randomUUID", async ({ page }) => {
    // Phones testing the dev server at http://192.168.x.x:3000 are not a secure
    // context. The page used to crash a moment after loading, and date taps did nothing.
    await page.addInitScript(() =>
      Object.defineProperty(Crypto.prototype, "randomUUID", {
        value: undefined,
      }),
    );
    const errors = watchErrors(page);
    await open(page);
    await press(night(page, 13));
    await expectLandedOn(page, 13);
    await page.waitForTimeout(1000);
    await expect(nights(page)).toHaveCount(31);
    expect(errors).toEqual([]);
  });

  test("scrolls the window, not a box inside the page", async ({ page }) => {
    // With <body> as its own scroll box, Android Chrome ignored the calendar's
    // smooth scrolls, so tapping a date did nothing. Desktop browsers and their
    // phone emulation scroll it fine, so check the cause, which shows everywhere.
    await open(page);
    await scrollPageTo(page, 3000);
    await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(3000);
    expect(await page.evaluate(() => document.body.scrollTop)).toBe(0);
  });

  test("shows a message if the movies can't load", async ({ page }) => {
    await page.route("**/api/movies*", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText("couldn't load the movies");
  });
});

test.describe("calendar", () => {
  test("tapping a night scrolls to its movie, just below the calendar", async ({ page }) => {
    await open(page);
    for (const day of [13, 31, 2]) {
      await press(night(page, day));
      await expect(page).toHaveURL(new RegExp(`#movie-${day}$`));
      await expect(night(page, day)).toHaveAttribute("aria-pressed", "true");
      await expectLandedOn(page, day);
    }
  });

  test("tapping a night still works after scrolling by hand", async ({ page }) => {
    await open(page);
    await scrollPageTo(page, 6000);
    await press(night(page, 5));
    await expectLandedOn(page, 5);
  });

  test("stays pinned to the top while the page scrolls", async ({ page }) => {
    await open(page);
    await scrollPageTo(page, 4000);
    await expect.poll(async () => Math.round((await page.locator(".sticky-cal").boundingBox())!.y)).toBe(0);
    await expect(night(page, 1)).toBeInViewport();
  });

  test("folds away and comes back", async ({ page }) => {
    await open(page);
    const header = page.getByRole("button", { name: /October 2025/ });
    await press(header);
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await expect.poll(async () => (await page.locator(".cal-grid").boundingBox())!.height).toBeLessThan(1);
    await press(header);
    await expect(header).toHaveAttribute("aria-expanded", "true");
    await press(night(page, 20));
    await expectLandedOn(page, 20);
  });

  // Known bug: the browser jumps to #movie-20 before the movies have loaded,
  // so a shared link opens at the top of the page. Remove .fixme once fixed.
  test.fixme("a shared link to a night opens on that night", async ({ page }) => {
    await open(page, "/2025#movie-20");
    await expectLandedOn(page, 20);
  });
});

test.describe("movies", () => {
  test("marking a movie watched shows on the calendar and survives a reload", async ({ page }) => {
    await open(page);
    const card = page.locator("#movie-1");
    const toggle = card.getByRole("button", { name: /watched/i });
    await press(toggle);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(night(page, 1)).toHaveAccessibleName("1, watched");

    await page.reload();
    await expect(page.locator("#movie-1").getByRole("button", { name: /watched/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await press(page.locator("#movie-1").getByRole("button", { name: /watched/i }));
    await expect(night(page, 1)).toHaveAccessibleName("1");
  });

  test("reviews open from the card and close again", async ({ page }) => {
    await open(page);
    const card = page.locator("#movie-1 article.movie-card");
    await press(card.getByText(/Nerdy high schooler/));
    const detail = page.getByRole("dialog", { name: "Christine" });
    await expect(detail.getByRole("heading", { name: "Reviews" })).toBeVisible();
    await press(detail.getByRole("button", { name: "Close reviews" }));
    await expect(detail).toBeHidden();
  });

  test("closing the reviews or the review form keeps your place on the page", async ({ page }) => {
    await open(page);
    await press(night(page, 10));
    await expectLandedOn(page, 10);
    const card = page.locator("#movie-10 article.movie-card");

    // Presses target (scrolled into view first, as a visitor would), runs
    // close, and checks the page is back exactly where it was.
    async function keepsPlace(target: Locator, close: () => Promise<void>) {
      await target.scrollIntoViewIfNeeded();
      const before = await settledScrollY(page);
      expect(before).toBeGreaterThan(500);
      await press(target);
      await close();
      await expect.poll(async () => Math.abs((await settledScrollY(page)) - before)).toBeLessThanOrEqual(2);
    }

    await keepsPlace(card.locator(".tile-desc"), async () => {
      await expect(page.locator('.detail-layer[data-phase="open"]')).toBeVisible();
      const detail = page.getByRole("dialog", { name: "Mirrors" });
      await press(detail.getByRole("button", { name: "Close reviews" }));
      await expect(detail).toBeHidden();
    });

    await keepsPlace(card.getByRole("button", { name: "Add your review" }), async () => {
      const modal = page.getByRole("dialog", { name: "Review Mirrors" });
      await expect(modal).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(modal).toBeHidden();
    });
  });

  test("the review form opens, takes a rating and closes", async ({ page }) => {
    await open(page);
    await press(page.locator("#movie-2").getByRole("button", { name: "Add your review" }));
    const modal = page.getByRole("dialog", { name: /^Review / });
    await expect(modal).toBeVisible();
    await press(modal.getByRole("button", { name: "Rate 3 drops" }));
    await expect(modal.getByLabel("Your review")).toBeVisible();
    await modal.getByLabel("Your review").fill("Regression test review, not posted.");
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
  });

  test("Letterboxd links open in a new tab", async ({ page }) => {
    await open(page);
    const link = page.locator("#movie-1").getByRole("link", { name: /Letterboxd/ });
    await expect(link).toHaveAttribute("href", /letterboxd\.com/);
    await expect(link).toHaveAttribute("target", "_blank");
  });
});

test.describe("layout", () => {
  test("on wide screens, the rating sits above one row of buttons", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1024, "phones stack the buttons full width");
    await page.setViewportSize({ width: 2300, height: 900 });
    await open(page);
    const card = page.locator("#movie-1");
    const box = async (el: Locator) => (await el.boundingBox())!;
    const score = await box(card.locator(".tile-score"));
    const buttons = await Promise.all(
      [
        card.getByRole("link", { name: "View on Letterboxd" }),
        card.getByRole("button", { name: "Mark as watched" }),
        card.getByRole("button", { name: "Add your review" }),
      ].map(box),
    );
    expect(new Set(buttons.map((b) => Math.round(b.y))).size).toBe(1); // one row
    expect(buttons[0]!.y).toBeGreaterThan(score.y + score.height - 1); // below the rating
    expect(Math.round(buttons[0]!.x)).toBe(Math.round(score.x)); // left-aligned with it
  });

  for (const width of [320, 360, 390, 412]) {
    test(`no sideways scrolling at ${width}px wide`, async ({ page, isMobile }) => {
      test.skip(!isMobile, "phone widths only");
      await page.setViewportSize({ width, height: 800 });
      await open(page);
      const overflow = await page.evaluate(() =>
        [document.documentElement, document.body].map((el) => el.scrollWidth - el.clientWidth),
      );
      expect(overflow).toEqual([0, 0]);
    });
  }
});
