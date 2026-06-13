import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildVercelCliInvocation,
  pinnedVercelCliVersion,
} from "../scripts/vercel-cli.mjs";

test("builds a pinned Vercel CLI invocation with isolated npm cache", () => {
  const cwd = "/tmp/payshield-test";
  const invocation = buildVercelCliInvocation({
    args: ["inspect", "https://payshield-lime.vercel.app"],
    cwd,
  });

  assert.equal(invocation.command, "npm");
  assert.deepEqual(invocation.args, [
    "exec",
    "--yes",
    "--package",
    `vercel@${pinnedVercelCliVersion}`,
    "--",
    "vercel",
    "inspect",
    "https://payshield-lime.vercel.app",
  ]);
  assert.equal(invocation.cacheDir, join(cwd, ".cache", "npm-vercel-cli"));
  assert.equal(invocation.env.NPM_CONFIG_CACHE, invocation.cacheDir);
  assert.equal(invocation.env.npm_config_cache, invocation.cacheDir);
  assert.equal(invocation.lockDir, join(cwd, ".cache", "vercel-cli.lock"));
});

test("rejects non-string Vercel CLI args", () => {
  assert.throws(
    () =>
      buildVercelCliInvocation({
        args: ["inspect", 123 as unknown as string],
      }),
    /array of strings/,
  );
});
