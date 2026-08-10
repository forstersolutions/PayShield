import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const previewUrl = process.env.STORE_PREVIEW_URL || "http://127.0.0.1:8091";
const projectRoot = path.resolve(import.meta.dirname, "..");
const targets = [
  {
    directory: path.join(projectRoot, "store/app-store/screenshots/en-US"),
    deviceScaleFactor: 3,
    height: 956,
    width: 440,
  },
  {
    directory: path.join(projectRoot, "store/google-play/metadata/en-US/images/phoneScreenshots"),
    deviceScaleFactor: 3,
    height: 720,
    width: 360,
  },
];
const screens = [
  { file: "01-safe-to-spend.png", label: "Home" },
  { file: "02-paycheck-plan.png", label: "Plan" },
  { file: "03-protected-bills.png", label: "Bills" },
  { file: "04-money-activity.png", label: "Activity" },
  { file: "05-account-controls.png", label: "Account" },
];

const browser = await chromium.launch({ headless: true });

try {
  for (const target of targets) {
    await mkdir(target.directory, { recursive: true });
    const context = await browser.newContext({
      deviceScaleFactor: target.deviceScaleFactor,
      isMobile: true,
      viewport: { height: target.height, width: target.width },
    });
    const page = await context.newPage();

    for (const screen of screens) {
      const errors = [];
      const onPageError = (error) => errors.push(error.message);
      page.on("pageerror", onPageError);
      await page.goto(previewUrl, {
        waitUntil: "networkidle",
      });
      const navigationItem = page.getByText(screen.label, { exact: true }).last();
      await navigationItem.waitFor();
      if (screen.label !== "Home") {
        await navigationItem.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(750);
      }
      if (errors.length) throw new Error(`${screen.label}: ${errors.join("; ")}`);
      await page.screenshot({
        animations: "disabled",
        path: path.join(target.directory, screen.file),
      });
      page.off("pageerror", onPageError);
    }

    await context.close();
  }
} finally {
  await browser.close();
}
