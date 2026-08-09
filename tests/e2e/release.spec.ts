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

test("public product experience is complete and responsive", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "PayShield" })).toBeVisible();
  await expect(page.getByLabel("PayShield product preview")).toBeVisible();
  await expect(page.getByRole("link", { name: "PayShield home" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Your balance lies. Safe to Spend doesn't.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Membership unavailable" })).toBeDisabled();

  const differenceTop = await page.locator("#difference").evaluate((element) =>
    element.getBoundingClientRect().top,
  );
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(differenceTop).toBeLessThanOrEqual(viewportHeight);

  await expectNoHorizontalOverflow(page);
  expect(runtimeErrors).toEqual([]);
});

test("household app navigation exposes every money-control workspace", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);

  await page.goto("/app");

  await expect(page.getByText("Safe to Spend", { exact: true }).first()).toBeVisible();

  const workspaces = [
    ["Paycheck", "Make every deposit arrive with a plan."],
    ["Buckets", "Give every dollar one clear job."],
    ["Bills", "Protected money goes only where you approved."],
    ["Card", "Spend what is free. Keep obligations protected."],
    ["Activity", "A clear record of what happened to your money."],
  ] as const;

  for (const [navigationLabel, heading] of workspaces) {
    await page.getByRole("button", { name: navigationLabel, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }

  await expectNoHorizontalOverflow(page);
  expect(runtimeErrors).toEqual([]);
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
