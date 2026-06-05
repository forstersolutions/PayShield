import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVercelUpstashCutoverPlan } from "../scripts/vercel-upstash-cutover.mjs";

test("builds a redacted Vercel Upstash cutover plan", () => {
  const restUrl = "https://careful-haddock-12345.upstash.io";
  const token = "upstash-secret-token-value";
  const result = buildVercelUpstashCutoverPlan({
    generatedAt: "2026-06-05T00:00:00.000Z",
    restUrlValue: restUrl,
    siteUrl: "https://payshield-lime.vercel.app/",
    tokenValue: token,
  });
  const serialized = JSON.stringify(result);
  const commands = result.commands.map(
    (step: { command: string }) => step.command,
  );

  assert.equal(result.ok, true);
  assert.equal(result.readyForVercelCutover, true);
  assert.deepEqual(result.remainingGates, []);
  assert.equal(serialized.includes(restUrl), false);
  assert.equal(serialized.includes(token), false);
  assert.equal(
    commands.some((command) =>
      command.includes("npx vercel env add PAYSHIELD_WAITLIST_STORAGE production"),
    ),
    true,
  );
  assert.equal(
    commands.some((command) =>
      command.includes(
        "npx vercel env add UPSTASH_REDIS_REST_URL production --sensitive",
      ),
    ),
    true,
  );
  assert.equal(
    commands.some((command) =>
      command.includes(
        "npx vercel env add UPSTASH_REDIS_REST_TOKEN production --sensitive",
      ),
    ),
    true,
  );
  assert.equal(
    commands.some((command) => command.includes('"$UPSTASH_REDIS_REST_URL"')),
    true,
  );
  assert.equal(
    commands.some((command) => command.includes('"$UPSTASH_REDIS_REST_TOKEN"')),
    true,
  );
  assert.equal(
    commands.some((command) =>
      command.includes("npm run receiver:upstash:check"),
    ),
    true,
  );
});

test("keeps Upstash cutover closed when local env values are missing", () => {
  const result = buildVercelUpstashCutoverPlan({
    generatedAt: "2026-06-05T00:00:00.000Z",
    restUrlValue: "",
    siteUrl: "https://payshield-lime.vercel.app",
    tokenValue: "",
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.remainingGates.includes("upstashRestUrlEnvPresent"),
    true,
  );
  assert.equal(
    result.remainingGates.includes("upstashRestTokenEnvPresent"),
    true,
  );
});

test("keeps Upstash cutover closed for unsafe REST URLs", () => {
  const result = buildVercelUpstashCutoverPlan({
    generatedAt: "2026-06-05T00:00:00.000Z",
    restUrlValue: "http://user:pass@example.upstash.io?token=secret",
    siteUrl: "https://payshield-lime.vercel.app",
    tokenValue: "upstash-secret-token-value",
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.remainingGates.includes("upstashRestUrlHttpsAndRedacted"),
    true,
  );
});

test("requires production environment for Upstash paid traffic cutover", () => {
  assert.throws(
    () =>
      buildVercelUpstashCutoverPlan({
        environment: "preview",
        restUrlValue: "https://careful-haddock-12345.upstash.io",
        tokenValue: "upstash-secret-token-value",
      }),
    /production/,
  );
});
