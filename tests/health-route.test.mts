import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../src/app/api/health/route.ts";

test("web health is a minimal liveness response", async () => {
  process.env.PAYSHIELD_BAAS_API_KEY = "must-not-leak";
  process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "must-not-leak";
  process.env.PAYSHIELD_LEDGER_DATABASE_URL =
    "postgres://private:secret@database.invalid:5432/payshield";

  const response = GET();
  const body = (await response.json()) as Record<string, unknown>;
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(body, {
    ok: true,
    service: "payshield-web-app",
    status: "healthy",
  });
  assert.doesNotMatch(serialized, /must-not-leak|postgres|readiness|waitlist/i);

  delete process.env.PAYSHIELD_BAAS_API_KEY;
  delete process.env.PAYSHIELD_CORE_SERVICE_TOKEN;
  delete process.env.PAYSHIELD_LEDGER_DATABASE_URL;
});
