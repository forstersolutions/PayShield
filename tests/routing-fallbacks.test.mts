import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const fallbackFiles = [
  "src/app/not-found.tsx",
  "src/app/error.tsx",
  "src/app/global-error.tsx",
];

test("route fallbacks provide branded recovery paths", async () => {
  for (const file of fallbackFiles) {
    const text = await readFile(file, "utf8");

    assert.match(text, /PayShield/);
    assert.doesNotMatch(text, /prototype|paid beta|early access/i);
  }

  const notFound = await readFile("src/app/not-found.tsx", "utf8");
  assert.match(notFound, /This screen is not in the PayShield control surface/);
  assert.equal(notFound.includes('href="/app"'), true);
  assert.match(notFound, /Product profile/);
  assert.match(notFound, /GRAYSTON_SUPPORT_EMAIL/);

  const routeError = await readFile("src/app/error.tsx", "utf8");
  assert.match(routeError, /unstable_retry/);
  assert.match(routeError, /Contact Grayston support/);

  const globalError = await readFile("src/app/global-error.tsx", "utf8");
  assert.match(globalError, /<html lang="en">/);
  assert.match(globalError, /unstable_retry/);
});

test("app route serves the operating screen instead of the root loading shell", async () => {
  const appPage = await readFile("src/app/app/page.tsx", "utf8");

  assert.match(appPage, /dynamic = "force-dynamic"/);
  await assert.rejects(access("src/app/loading.tsx"));
});
