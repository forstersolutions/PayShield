import assert from "node:assert/strict";
import { test } from "node:test";
import { auditAwsInfrastructure } from "../scripts/aws-infra-audit.mjs";

test("AWS production stack keeps required financial-service controls", () => {
  const audit = auditAwsInfrastructure();

  assert.equal(audit.ok, true);
  assert.deepEqual(audit.failures, []);
  assert.equal(audit.controlsChecked >= 20, true);
});

test("AWS audit rejects a root container and public database", () => {
  const audit = auditAwsInfrastructure({
    dockerfile: "FROM node:22-alpine\n",
    githubRole: "",
    template: "PubliclyAccessible: true\n",
  });

  assert.equal(audit.ok, false);
  assert.equal(audit.failures.some((failure) => failure.includes("private database")), true);
  assert.equal(audit.failures.some((failure) => failure.includes("non-root")), true);
});
