import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("receiver compose manifest requires persistent storage, health checks, and runtime secret", async () => {
  const compose = await readFile("compose.receiver.yml", "utf8");
  const envExample = await readFile(".env.receiver.example", "utf8");

  assert.match(compose, /dockerfile: Dockerfile\.receiver/);
  assert.match(compose, /image: payshield-waitlist-receiver:production/);
  assert.match(compose, /restart: unless-stopped/);
  assert.match(compose, /PAYSHIELD_RECEIVER_DATA_DIR: \/data\/waitlist/);
  assert.match(compose, /PAYSHIELD_RECEIVER_HEALTH_PATH: \/health/);
  assert.match(compose, /PAYSHIELD_RECEIVER_PATH: \/payshield-waitlist/);
  assert.match(
    compose,
    /\$\{PAYSHIELD_WAITLIST_WEBHOOK_SECRET:\?Set PAYSHIELD_WAITLIST_WEBHOOK_SECRET in \.env\.receiver\}/,
  );
  assert.match(
    compose,
    /\$\{PAYSHIELD_RECEIVER_HOST_DATA_DIR:\?Set PAYSHIELD_RECEIVER_HOST_DATA_DIR to a persistent host directory outside git\}/,
  );
  assert.match(compose, /target: \/data\/waitlist/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /http:\/\/127\.0\.0\.1:8787\/health/);
  assert.match(compose, /no-new-privileges:true/);
  assert.doesNotMatch(compose, /shared-secret|receiver-secret|docker-smoke|dry-run/);

  assert.match(envExample, /PAYSHIELD_WAITLIST_WEBHOOK_SECRET=/);
  assert.match(envExample, /PAYSHIELD_RECEIVER_HOST_DATA_DIR=\/srv\/payshield\/waitlist/);
  assert.match(envExample, /PAYSHIELD_RECEIVER_BACKUP_DIR=\/srv\/payshield\/waitlist-backups/);
  assert.doesNotMatch(envExample, /shared-secret|receiver-secret|docker-smoke|dry-run/);
});
