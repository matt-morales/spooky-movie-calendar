import { expect, test } from "@playwright/test";

// End-to-end check of the main flows against the real API and database.

test("loads the lineup, rates a movie and opens comments", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Christine" })).toBeVisible();
  await expect(page.getByText("October 2025")).toBeVisible();
  await expect(page.getByRole("group", { name: "Choose a night" }).getByRole("button")).toHaveCount(31);

  const card = page.locator("article.movie-card").filter({ has: page.getByRole("heading", { name: "Christine" }) });
  await card.getByRole("button", { name: "Rate 4 drops" }).click();
  await expect(card.getByText(/Average rating: \d\.\d \(\d+\)/)).toBeVisible();

  await card.getByRole("button", { name: "Comments" }).click();
  await expect(card.getByLabel("Add a comment")).toBeVisible();

  expect(errors).toEqual([]);
});

test("the calendar jumps to a night", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("group", { name: "Choose a night" }).getByRole("button", { name: "13", exact: true }).click();
  await expect(page).toHaveURL(/#movie-13$/);
  await expect(page.getByRole("heading", { name: "Friday the 13th: The Final Chapter" })).toBeInViewport();
});

test("the comments toggle is styled like the rest of the page", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator("article.movie-card").first().getByRole("button", { name: "Comments" });
  const style = await toggle.evaluate((el) => {
    const s = getComputedStyle(el);
    return { font: s.fontFamily, background: s.backgroundColor };
  });
  expect(style.font).toMatch(/Inter/); // browser-default buttons use a system font
  expect(style.background).toBe("rgba(0, 0, 0, 0)"); // not the default grey/white fill
});
