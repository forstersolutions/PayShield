import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppSession } from "../src/app/lib/neobank/auth.ts";
import { createHouseholdMoneyControlPlan } from "../src/app/lib/neobank/control-plan.ts";
import { createNeobankSnapshot } from "../src/app/lib/neobank/demo-state.ts";
import { createHouseholdOperationsPacket } from "../src/app/lib/neobank/operations.ts";

type HouseholdResponse = {
  household: {
    authMode: string;
    clerkSubject: string | null;
    email: string;
    householdId: string;
    name: string;
    userId: string;
  };
};

test("household money state is scoped to the active app session", () => {
  const session = {
    authMode: "clerk",
    clerkSubject: "user_clerk_123",
    email: "household@example.com",
    name: "Household Owner",
    userId: "user_clerk_123",
  } satisfies AppSession;

  const operations = createHouseholdOperationsPacket(session) as HouseholdResponse;
  const plan = createHouseholdMoneyControlPlan({}, session) as HouseholdResponse & {
    source: {
      ledger: string;
    };
  };

  assert.equal(operations.household.authMode, "clerk");
  assert.equal(operations.household.clerkSubject, "user_clerk_123");
  assert.equal(operations.household.email, "household@example.com");
  assert.equal(operations.household.householdId, "household_user_clerk_123");
  assert.equal(operations.household.name, "Household Owner");
  assert.equal(operations.household.userId, "user_clerk_123");
  assert.equal(plan.household.householdId, operations.household.householdId);
  assert.equal(plan.household.userId, operations.household.userId);
  assert.equal(plan.source.ledger, "control_model");
});

test("household control plan uses the active workspace bucket profile", () => {
  const snapshot = createNeobankSnapshot();
  const buckets = snapshot.buckets.map((bucket) =>
    bucket.id === "rent"
      ? {
          ...bucket,
          availableCents: 90_000,
          fundedCents: 90_000,
          shortCents: 0,
          targetCents: 90_000,
        }
      : bucket,
  );
  const plan = createHouseholdMoneyControlPlan({
    buckets,
    expectedFrequency: "biweekly",
    employerName: "Acme Payroll",
    paycheckAmountCents: 300_000,
    payees: snapshot.payees,
    preferredTransferBucketId: "rent",
    requestedTransferCents: 25_000,
    ruleName: "Acme payroll",
  }) as {
    source: {
      bucketPersistence: string;
      payeePersistence: string;
    };
    summary: {
      projectedProtectedCents: number;
      projectedSafeToSpendCents: number;
      protectedTargetCents: number;
    };
    transferPlan: {
      maxTransferCents: number;
      sourceBucketName: string;
    };
  };

  assert.equal(plan.summary.projectedProtectedCents, 195_000);
  assert.equal(plan.summary.projectedSafeToSpendCents, 105_000);
  assert.equal(plan.summary.protectedTargetCents, 195_000);
  assert.equal(plan.transferPlan.maxTransferCents, 90_000);
  assert.equal(plan.transferPlan.sourceBucketName, "Rent");
  assert.equal(plan.source.bucketPersistence, "workspace_profile");
  assert.equal(plan.source.payeePersistence, "workspace_profile");
});

test("household control plan explains short paycheck funding order", () => {
  const plan = createHouseholdMoneyControlPlan({
    expectedFrequency: "biweekly",
    employerName: "Short Payroll",
    paycheckAmountCents: 70_000,
    requestedTransferCents: 0,
    ruleName: "Short payroll",
  }) as {
    fundingSchedule: Array<{
      amountCents: number;
      key: string;
      shortCents: number;
      status: string;
    }>;
    summary: {
      projectedSafeToSpendCents: number;
      shortfallCents: number;
    };
  };

  assert.equal(plan.fundingSchedule[0]?.key, "bucket:rent");
  assert.equal(plan.fundingSchedule[0]?.status, "funded");
  assert.equal(plan.fundingSchedule[1]?.key, "bucket:vehicle");
  assert.equal(plan.fundingSchedule[1]?.status, "partial");
  assert.equal(plan.fundingSchedule[1]?.amountCents, 20_000);
  assert.equal(plan.fundingSchedule[1]?.shortCents, 10_000);
  assert.equal(plan.fundingSchedule.at(-1)?.key, "safe_to_spend");
  assert.equal(plan.fundingSchedule.at(-1)?.amountCents, 0);
  assert.equal(plan.summary.projectedSafeToSpendCents, 0);
  assert.equal(plan.summary.shortfallCents, 85_000);
});
