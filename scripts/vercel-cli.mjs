import { execFile } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const pinnedVercelCliVersion = "54.12.2";
const defaultLockTimeoutMs = 60_000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {{ args?: string[]; cwd?: string; version?: string }} input
 */
export function buildVercelCliInvocation({
  args = [],
  cwd = process.cwd(),
  version = pinnedVercelCliVersion,
} = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    throw new Error("Vercel CLI args must be an array of strings.");
  }

  const cacheDir = join(cwd, ".cache", "npm-vercel-cli");

  return {
    args: [
      "exec",
      "--yes",
      "--package",
      `vercel@${version}`,
      "--",
      "vercel",
      ...args,
    ],
    cacheDir,
    command: "npm",
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: cacheDir,
      npm_config_cache: cacheDir,
    },
    lockDir: join(cwd, ".cache", "vercel-cli.lock"),
  };
}

async function acquireLock(lockDir, { timeoutMs = defaultLockTimeoutMs } = {}) {
  const parent = join(lockDir, "..");
  const startedAt = Date.now();

  await mkdir(parent, { recursive: true });

  while (true) {
    try {
      await mkdir(lockDir);
      return async () => {
        await rm(lockDir, { force: true, recursive: true });
      };
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }

      const elapsedMs = Date.now() - startedAt;

      if (elapsedMs > timeoutMs) {
        let ageMs = 0;

        try {
          const info = await stat(lockDir);
          ageMs = Date.now() - info.mtimeMs;
        } catch {
          ageMs = 0;
        }

        throw new Error(
          `Timed out waiting for Vercel CLI lock after ${elapsedMs}ms. Lock age: ${Math.round(ageMs)}ms.`,
        );
      }

      await sleep(150);
    }
  }
}

export async function runVercelCli(args, options = {}) {
  const invocation = buildVercelCliInvocation({
    args,
    cwd: options.cwd ?? process.cwd(),
    version: options.version ?? pinnedVercelCliVersion,
  });
  const releaseLock = await acquireLock(invocation.lockDir, {
    timeoutMs: options.lockTimeoutMs ?? defaultLockTimeoutMs,
  });

  try {
    return await execFileAsync(invocation.command, invocation.args, {
      encoding: "utf8",
      env: invocation.env,
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
      timeout: options.timeout,
    });
  } finally {
    await releaseLock();
  }
}
