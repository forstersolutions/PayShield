import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/\/_vercel\/(insights|speed-insights)\/script\.js$/, async (route) => {
    await route.fulfill({
      body: "",
      contentType: "application/javascript",
      status: 200,
    });
  });
});

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test("download experience is complete and responsive", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);

  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Spend what's free. Protect what's spoken for.",
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("PayShield mobile app showing Safe to Spend and protected buckets"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "PayShield home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PayShield on the App Store" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get PayShield on Google Play" })).toBeVisible();
  await expect(page.getByText("One household membership")).toBeVisible();

  const proofTop = await page.getByLabel("PayShield benefits").evaluate((element) =>
    element.getBoundingClientRect().top,
  );
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(proofTop).toBeLessThanOrEqual(viewportHeight + 1);

  await expectNoHorizontalOverflow(page);
  expect(runtimeErrors).toEqual([]);
});

test("download router sends each platform to its store", async ({ request }) => {
  const ios = await request.get("/download?store=ios", { maxRedirects: 0 });
  const android = await request.get("/download?store=android", { maxRedirects: 0 });

  expect(ios.status()).toBe(307);
  expect(ios.headers().location).toMatch(/^https:\/\/apps\.apple\.com\//);
  expect(android.status()).toBe(307);
  expect(android.headers().location).toMatch(/^https:\/\/play\.google\.com\//);
});

test("privacy and terms are reachable and branded", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Notice" })).toBeVisible();
  await expect(page.getByText("support@graystontechnologies.com", { exact: true }).first()).toBeVisible();

  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Terms of Use" })).toBeVisible();
  await expect(page.getByText(/Grayston Technologies/).first()).toBeVisible();

  await expectNoHorizontalOverflow(page);
  expect(runtimeErrors).toEqual([]);
});

test("support publishes contact and account deletion paths", async ({ page }) => {
  await page.goto("/support");

  await expect(page.getByRole("heading", { name: "PayShield Support" })).toBeVisible();
  await expect(page.getByText("support@graystontechnologies.com").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delete your account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request deletion" })).toHaveAttribute(
    "href",
    /mailto:support@graystontechnologies\.com/,
  );
});
