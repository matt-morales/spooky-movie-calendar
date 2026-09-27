import { expect, test } from "@playwright/test";

// End-to-end check of the main flows against the real API and database.
// They use the 2025 lineup: it's complete and won't change.

test("loads the lineup, rates a movie and opens its reviews", async ({ page }) => {
  const errors: string[] = [];
  // Cloudflare's analytics beacon rejects localhost; that error is expected in dev.
  page.on("pageerror", (e) => !/cloudflareinsights\.com/.test(e.message) && errors.push(e.message));

  await page.goto("/2025");
  await expect(page.getByRole("heading", { name: "Christine" })).toBeVisible();
  await expect(page.getByText("October 2025")).toBeVisible();
  await expect(page.getByRole("group", { name: "Choose a night" }).getByRole("button")).toHaveCount(31);

  const card = page.locator("article.movie-card").filter({ has: page.getByRole("heading", { name: "Christine" }) });
  await card.getByRole("button", { name: "Add your review" }).click();
  const modal = page.getByRole("dialog", { name: "Review Christine" });
  await modal.getByRole("button", { name: "Rate 4 drops" }).click();
  await expect(modal.getByLabel("Your review")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card.getByText(/\d+(\.\d)?\/10/)).toBeVisible();

  // Clicking the card turns it over to show its reviews.
  await card.getByText(/Nerdy high schooler/).click();
  const detail = page.getByRole("dialog", { name: "Christine" });
  await expect(detail.getByRole("heading", { name: "Reviews" })).toBeVisible();
  await detail.getByRole("button", { name: "Close reviews" }).click();
  await expect(detail).toBeHidden();

  expect(errors).toEqual([]);
});

test("the calendar jumps to a night", async ({ page }) => {
  await page.goto("/2025");
  await page.getByRole("group", { name: "Choose a night" }).getByRole("button", { name: "13", exact: true }).click();
  await expect(page).toHaveURL(/#movie-13$/);
  await expect(page.getByRole("heading", { name: "Friday the 13th: The Final Chapter" })).toBeInViewport();
});

test("card buttons are styled like the rest of the page", async ({ page }) => {
  await page.goto("/2025");
  const button = page.locator("article.movie-card").first().getByRole("button", { name: "Mark as watched" });
  const style = await button.evaluate((el) => {
    const s = getComputedStyle(el);
    return { font: s.fontFamily, background: s.backgroundColor };
  });
  expect(style.font).toMatch(/Inter/); // browser-default buttons use a system font
  expect(style.background).not.toBe("rgb(239, 239, 239)"); // not the default grey fill
});

test("the year is in the path, and / opens the current lineup", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/2026$/);
  await expect(page.getByText("October 2026")).toBeVisible();

  await page.goto("/?year=2025#movie-3");
  await expect(page).toHaveURL(/\/2025#movie-3$/);
  await expect(page.getByText("October 2025")).toBeVisible();
  await expect(page.getByRole("link", { name: "Letterboxd", exact: true })).toHaveAttribute("href", /snowkempm/);
});
