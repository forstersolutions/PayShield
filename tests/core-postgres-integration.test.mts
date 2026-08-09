import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import * as databaseModule from "../services/core/database.mjs";
import * as productModule from "../services/core/product.mjs";

// The persistence module is JavaScript; this boundary keeps its broad inferred unions out of the integration fixture.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DatabaseFunction = (...args: any[]) => Promise<any>;
type QueryResult = {
  rowCount: number | null;
  rows: Array<Record<string, unknown>>;
};

const database = databaseModule as unknown as Record<string, DatabaseFunction>;
const product = productModule as unknown as Record<string, DatabaseFunction>;
const {
  applyBillPaymentLifecycle,
  applyCardAuthorizationLifecycle,
  applyTransferLifecycle,
  claimPlaidSyncJobs,
  completePlaidSyncJob,
  enqueuePlaidSyncJob,
  failPlaidSyncJob,
  loadHouseholdJournalEntries,
  loadProviderOnboardingState,
  persistBillPaymentSchedule,
  persistBucketProfile,
  persistCardAuthorizationDecision,
  persistHouseholdIdentity,
  persistPaycheckDetection,
  persistPayee,
  persistProviderOnboardingState,
  persistTransferIntent,
  persistUnlockRequest,
  updatePayeeControl,
  updateProviderKycApplicationStatus,
} = database;
const { handleProviderWebhook } = product;

const databaseUrl = process.env.PAYSHIELD_TEST_DATABASE_URL?.trim() || "";
const postgresTest = databaseUrl ? test : test.skip;
const require = createRequire(import.meta.url);
const { Pool } = require("pg") as {
  Pool: new (options: { connectionString: string }) => {
    end(): Promise<void>;
    query(sql: string, values?: unknown[]): Promise<QueryResult>;
  };
};

function journalEntry(
  idempotencyKey: string,
  type: string,
  lines: Array<{ accountId: string; amountCents: number }>,
  metadata: Record<string, unknown>,
  memo: string,
) {
  return {
    createdAt: new Date().toISOString(),
    idempotencyKey,
    lines,
    memo,
    metadata,
    type,
  };
}

function signedProviderWebhook(
  payload: Record<string, unknown>,
  secret: string,
) {
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return {
    ...payload,
    __payshieldProviderRawBody: rawBody,
    __payshieldProviderSignature: `t=${timestamp},v1=${digest}`,
  };
}

postgresTest(
  "postgres money lifecycle keeps holds, settlements, reversals, and recovery balanced",
  async () => {
    const nonce = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      PAYSHIELD_BAAS_PROVIDER: "test_baas",
      PAYSHIELD_CORE_DB_IDLE_TIMEOUT_MS: "1000",
      PAYSHIELD_LEDGER_DATABASE_URL: databaseUrl,
      PAYSHIELD_PROVIDER_WEBHOOK_SECRET: `provider_webhook_${nonce}`,
    };
    const householdId = `household_pg_${nonce}`;
    const userId = `user_pg_${nonce}`;
    const identityInput = {
      actorUserId: userId,
      betaAccessStatus: "approved",
      clerkSubject: `clerk_pg_${nonce}`,
      householdId,
      kycStatus: "approved",
      userEmail: `pg-${nonce}@example.com`,
      userName: "Postgres Test Household",
    };
    const buckets = [
      {
        due: "1st",
        id: "rent",
        name: "Rent",
        priority: 10,
        protection: "bill_only",
        targetCents: 60_000,
      },
      {
        due: "Every check",
        id: "emergency",
        name: "Emergency",
        priority: 20,
        protection: "emergency",
        targetCents: 0,
      },
      {
        due: "Remainder",
        id: "safe_spending",
        name: "Safe to Spend",
        priority: 100,
        protection: "spendable",
        targetCents: 0,
      },
    ];
    const protectedBuckets = buckets.filter(
      (bucket) => bucket.id !== "safe_spending",
    );

    const identity = await persistHouseholdIdentity(identityInput, env);
    assert.equal(identity.persistence, "postgres");
    const profile = await persistBucketProfile(
      {
        ...identityInput,
        buckets: protectedBuckets,
        idempotencyKey: `profile:${nonce}`,
      },
      env,
    );
    assert.equal(profile.persistence, "postgres");
    const payeePersistence = await persistPayee(
      {
        ...identityInput,
        allowedBucketId: "rent",
        idempotencyKey: `payee:${nonce}`,
        maxCents: 100_000,
        name: "Test Property Manager",
        providerName: "test_baas",
        providerPayeeId: `provider_payee_${nonce}`,
        status: "approved",
      },
      env,
    );
    assert.equal(payeePersistence.persistence, "postgres");
    const payeeId = payeePersistence.payee.id;

    const postPaycheck = async (suffix: string) =>
      persistPaycheckDetection(
        {
          amountCents: 100_000,
          bankConnectionId: null,
          buckets,
          detectionRuleId: null,
          employerName: "Test Payroll",
          householdId,
          idempotencyKey: `paycheck:${nonce}:${suffix}`,
          journalEntry: journalEntry(
            `paycheck:${nonce}:${suffix}`,
            "paycheck_deposit",
            [
              { accountId: "asset:program_cash", amountCents: 100_000 },
              {
                accountId: "liability:bucket:rent",
                amountCents: -60_000,
              },
              {
                accountId: "liability:bucket:safe_spending",
                amountCents: -40_000,
              },
            ],
            {
              amountCents: 100_000,
              employerName: "Test Payroll",
              receivedAt: new Date().toISOString(),
            },
            "Paycheck deposit from Test Payroll",
          ),
          providerEventId: `event:${nonce}:${suffix}`,
          providerTransactionId: `transaction:${nonce}:${suffix}`,
          receivedAt: new Date().toISOString(),
          status: "split_posted",
        },
        env,
      );

    const firstPaycheck = await postPaycheck("one");
    assert.equal(firstPaycheck.persistence, "postgres");
    assert.deepEqual(firstPaycheck.recoveryAllocations, []);

    const blockedProfileRemoval = await persistBucketProfile(
      {
        ...identityInput,
        buckets: protectedBuckets.filter((bucket) => bucket.id !== "rent"),
        idempotencyKey: `profile-remove-funded:${nonce}`,
      },
      env,
    );
    assert.equal(
      blockedProfileRemoval.code,
      "bucket_in_use",
      JSON.stringify(blockedProfileRemoval),
    );
    assert.equal(blockedProfileRemoval.persistence, "control_conflict");
    assert.equal(blockedProfileRemoval.blockedBuckets[0].id, "rent");
    assert.equal(blockedProfileRemoval.blockedBuckets[0].balanceCents, 60_000);
    assert.equal(blockedProfileRemoval.blockedBuckets[0].payeeCount, 1);

    const unlockKey = `unlock:${nonce}`;
    const unlock = await persistUnlockRequest(
      {
        amountCents: 20_000,
        bucketId: "rent",
        householdId,
        idempotencyKey: unlockKey,
        journalEntry: journalEntry(
          unlockKey,
          "bucket_unlock",
          [
            { accountId: "liability:bucket:rent", amountCents: 20_000 },
            {
              accountId: "liability:bucket:safe_spending",
              amountCents: -20_000,
            },
          ],
          {
            amountCents: 20_000,
            bucketId: "rent",
            mode: "slow_free",
            reason: "Emergency repair",
            recoveryChecks: 2,
            recoveryPerCheckCents: 10_000,
          },
          "Emergency unlock from rent",
        ),
        reason: "Emergency repair",
        recoveryChecks: 2,
        recoveryPerCheckCents: 10_000,
        status: "posted",
        unlockMode: "slow_free",
        unlockedCents: 20_000,
      },
      env,
    );
    assert.equal(unlock.persistence, "postgres");
    assert.equal(unlock.recovery.remainingCents, 20_000);

    const secondPaycheck = await postPaycheck("two");
    assert.equal(
      secondPaycheck.persistence,
      "postgres",
      JSON.stringify(secondPaycheck),
    );
    assert.equal(secondPaycheck.recoveryAllocations.length, 1);
    assert.equal(secondPaycheck.recoveryAllocations[0].amountCents, 10_000);
    const thirdPaycheck = await postPaycheck("three");
    assert.equal(thirdPaycheck.recoveryAllocations[0].amountCents, 10_000);

    const billKey = `bill:${nonce}`;
    const billReference = `provider_bill_${nonce}`;
    const bill = await persistBillPaymentSchedule(
      {
        amountCents: 20_000,
        bucketId: "rent",
        decisionCode: "scheduled",
        householdId,
        idempotencyKey: billKey,
        journalEntry: journalEntry(
          billKey,
          "bill_payment",
          [
            { accountId: "liability:bucket:rent", amountCents: 20_000 },
            {
              accountId: "liability:bill_pay_pending",
              amountCents: -20_000,
            },
          ],
          {
            amountCents: 20_000,
            bucketId: "rent",
            payeeId,
            scheduledFor: "2026-09-01",
          },
          "September rent",
        ),
        memo: "September rent",
        payeeId,
        providerBillPaymentId: billReference,
        providerName: "test_baas",
        providerStatus: "submitted",
        reason: "Approved payee and balance",
        scheduledFor: "2026-09-01",
        status: "submitted",
      },
      env,
    );
    assert.equal(bill.persistence, "postgres");
    const blockedPayeeRemoval = await updatePayeeControl(
      {
        ...identityInput,
        action: "archive",
        idempotencyKey: `payee-archive-blocked:${nonce}`,
        payeeId,
      },
      env,
    );
    assert.equal(blockedPayeeRemoval.code, "payee_in_use");
    assert.equal(blockedPayeeRemoval.persistence, "control_conflict");
    assert.equal(blockedPayeeRemoval.blockers.billCount, 1);
    const billSettlement = await applyBillPaymentLifecycle(
      {
        amountCents: 20_000,
        occurredAt: new Date().toISOString(),
        providerEventId: `bill-settled:${nonce}`,
        providerName: "test_baas",
        providerReferenceId: billReference,
        status: "settled",
      },
      env,
    );
    assert.equal(billSettlement.status, "settled");
    const billReplay = await applyBillPaymentLifecycle(
      {
        amountCents: 20_000,
        occurredAt: new Date().toISOString(),
        providerEventId: `bill-settled-retry:${nonce}`,
        providerName: "test_baas",
        providerReferenceId: billReference,
        status: "settled",
      },
      env,
    );
    assert.equal(billReplay.replayed, true);
    const billReversal = await applyBillPaymentLifecycle(
      {
        amountCents: 20_000,
        occurredAt: new Date().toISOString(),
        providerEventId: `bill-reversed:${nonce}`,
        providerName: "test_baas",
        providerReferenceId: billReference,
        status: "reversed",
      },
      env,
    );
    assert.equal(billReversal.status, "reversed");

    const transferKey = `transfer:${nonce}`;
    const transferReference = `provider_transfer_${nonce}`;
    const transfer = await persistTransferIntent(
      {
        amountCents: 15_000,
        destinationPayeeId: payeeId,
        householdId,
        idempotencyKey: transferKey,
        journalEntry: journalEntry(
          transferKey,
          "transfer_reservation",
          [
            { accountId: "liability:bucket:rent", amountCents: 15_000 },
            {
              accountId: "liability:transfer_pending",
              amountCents: -15_000,
            },
          ],
          {
            amountCents: 15_000,
            destinationPayeeId: payeeId,
            sourceBucketId: "rent",
          },
          "Protected transfer",
        ),
        providerName: "test_baas",
        providerStatus: "created",
        providerTransferId: transferReference,
        sourceBucketId: "rent",
        status: "submitted",
      },
      env,
    );
    assert.equal(transfer.persistence, "postgres");
    const transferFailure = await applyTransferLifecycle(
      {
        amountCents: null,
        failureCode: "provider_failed",
        occurredAt: new Date().toISOString(),
        providerEventId: `transfer-failed:${nonce}`,
        providerName: "test_baas",
        providerReferenceId: transferReference,
        status: "failed",
      },
      env,
    );
    assert.equal(transferFailure.status, "failed");

    const webhookTransferKey = `transfer-webhook:${nonce}`;
    const webhookTransferReference = `provider_transfer_webhook_${nonce}`;
    const webhookTransfer = await persistTransferIntent(
      {
        amountCents: 5_000,
        destinationPayeeId: payeeId,
        householdId,
        idempotencyKey: webhookTransferKey,
        journalEntry: journalEntry(
          webhookTransferKey,
          "transfer_reservation",
          [
            { accountId: "liability:bucket:rent", amountCents: 5_000 },
            {
              accountId: "liability:transfer_pending",
              amountCents: -5_000,
            },
          ],
          {
            amountCents: 5_000,
            destinationPayeeId: payeeId,
            sourceBucketId: "rent",
          },
          "Signed webhook transfer",
        ),
        providerName: "test_baas",
        providerStatus: "created",
        providerTransferId: webhookTransferReference,
        sourceBucketId: "rent",
        status: "submitted",
      },
      env,
    );
    assert.equal(webhookTransfer.persistence, "postgres");
    const transferWebhookPayload = {
      amountCents: 5_000,
      eventType: "transfer.settled",
      occurredAt: new Date().toISOString(),
      providerEventId: `provider-event-transfer-settled:${nonce}`,
      providerName: "test_baas",
      providerTransferId: webhookTransferReference,
    };
    const transferWebhook = await handleProviderWebhook(
      signedProviderWebhook(
        transferWebhookPayload,
        env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET || "",
      ),
      env,
    );
    assert.equal(transferWebhook.status, 202);
    assert.equal(transferWebhook.body.mode, "money_lifecycle_updated");
    const transferWebhookReplay = await handleProviderWebhook(
      signedProviderWebhook(
        transferWebhookPayload,
        env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET || "",
      ),
      env,
    );
    assert.equal(transferWebhookReplay.status, 202);
    assert.equal(transferWebhookReplay.body.mode, "money_lifecycle_replayed");
    assert.equal(transferWebhookReplay.body.duplicate, true);

    const pendingPayee = await persistPayee(
      {
        ...identityInput,
        allowedBucketId: "rent",
        idempotencyKey: `payee-pending:${nonce}`,
        maxCents: 75_000,
        name: "Verified Utility",
        providerName: "test_baas",
        providerPayeeId: `provider_payee_pending_${nonce}`,
        status: "provider_pending",
      },
      env,
    );
    assert.equal(pendingPayee.payee.status, "provider_pending");
    const payeeWebhook = await handleProviderWebhook(
      signedProviderWebhook(
        {
          eventType: "payee.approved",
          providerEventId: `provider-event-payee-approved:${nonce}`,
          providerName: "test_baas",
          providerPayeeId: pendingPayee.payee.providerPayeeId,
        },
        env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET || "",
      ),
      env,
    );
    assert.equal(payeeWebhook.status, 202);
    assert.equal(payeeWebhook.body.mode, "payee_updated");
    assert.equal(payeeWebhook.body.payee.status, "approved");

    const cardKey = `card:${nonce}`;
    const authorizationReference = `provider_auth_${nonce}`;
    const card = await persistCardAuthorizationDecision(
      {
        amountCents: 10_000,
        approved: true,
        approvedAmountCents: 10_000,
        bucketId: "safe_spending",
        decisionCode: "approved",
        householdId,
        idempotencyKey: cardKey,
        journalEntry: journalEntry(
          cardKey,
          "card_authorization",
          [
            {
              accountId: "liability:bucket:safe_spending",
              amountCents: 10_000,
            },
            {
              accountId: "liability:card_settlement",
              amountCents: -10_000,
            },
          ],
          {
            amountCents: 10_000,
            bucketId: "safe_spending",
            merchantName: "Test Market",
            payeeId: null,
          },
          "Card authorization: Test Market",
        ),
        merchantCategoryCode: "5411",
        merchantName: "Test Market",
        payeeId: null,
        providerAuthorizationId: authorizationReference,
        providerCardId: `provider_card_${nonce}`,
        providerName: "test_baas",
        providerStatus: "provider_gateway",
        reason: "Purchase fits Safe to Spend",
      },
      env,
    );
    assert.equal(card.decision.approved, true);
    const cardSettlement = await applyCardAuthorizationLifecycle(
      {
        amountCents: 7_000,
        occurredAt: new Date().toISOString(),
        providerAuthorizationId: authorizationReference,
        providerEventId: `card-settled:${nonce}`,
        providerName: "test_baas",
        providerTransactionId: `provider_transaction_${nonce}`,
        status: "settled",
      },
      env,
    );
    assert.equal(cardSettlement.status, "settled");
    assert.equal(cardSettlement.releaseJournalPersistence.persisted, true);
    const cardReversal = await applyCardAuthorizationLifecycle(
      {
        amountCents: 7_000,
        occurredAt: new Date().toISOString(),
        providerAuthorizationId: authorizationReference,
        providerEventId: `card-reversed:${nonce}`,
        providerName: "test_baas",
        providerTransactionId: `provider_transaction_${nonce}`,
        status: "reversed",
      },
      env,
    );
    assert.equal(cardReversal.status, "reversed");

    const createLargeHold = (suffix: string) => {
      const holdKey = `card-hold-${suffix}:${nonce}`;
      const merchantName = `Large Purchase ${suffix}`;

      return persistCardAuthorizationDecision(
        {
        amountCents: 80_000,
        approved: true,
        approvedAmountCents: 80_000,
        bucketId: "safe_spending",
        decisionCode: "approved",
        householdId,
          idempotencyKey: holdKey,
        journalEntry: journalEntry(
            holdKey,
          "card_authorization",
          [
            {
              accountId: "liability:bucket:safe_spending",
              amountCents: 80_000,
            },
            {
              accountId: "liability:card_settlement",
              amountCents: -80_000,
            },
          ],
          {
            amountCents: 80_000,
            bucketId: "safe_spending",
              merchantName,
            payeeId: null,
          },
            `Card authorization: ${merchantName}`,
        ),
        merchantCategoryCode: "5999",
          merchantName,
        payeeId: null,
          providerAuthorizationId: `provider_hold_${suffix}_${nonce}`,
        providerCardId: `provider_card_${nonce}`,
        providerName: "test_baas",
        providerStatus: "provider_gateway",
        reason: "Purchase fits Safe to Spend",
        },
        env,
      );
    };
    const holds = await Promise.all([
      createLargeHold("one"),
      createLargeHold("two"),
    ]);
    const approvedHolds = holds.filter((hold) => hold.decision.approved);
    const declinedHolds = holds.filter((hold) => !hold.decision.approved);

    assert.equal(approvedHolds.length, 1);
    assert.equal(declinedHolds.length, 1);
    assert.equal(
      declinedHolds[0].controlConflict.code,
      "insufficient_concurrent_funds",
    );
    const approvedAuthorizationId =
      approvedHolds[0].decision.providerAuthorizationId;
    const mismatchedCardReferences = await applyCardAuthorizationLifecycle(
      {
        amountCents: null,
        occurredAt: new Date().toISOString(),
        providerAuthorizationId: approvedAuthorizationId,
        providerEventId: `card-reference-conflict:${nonce}`,
        providerName: "test_baas",
        providerTransactionId: `provider_transaction_${nonce}`,
        status: "expired",
      },
      env,
    );
    assert.equal(mismatchedCardReferences.conflict, true);
    assert.equal(mismatchedCardReferences.status, "ambiguous_reference");

    const journal = await loadHouseholdJournalEntries(householdId, env);
    assert.equal(journal.persistence, "postgres");
    assert.ok(
      journal.entries.some((entry: { lines: Array<{ accountId: string }> }) =>
        entry.lines.some(
          (line: { accountId: string }) =>
            line.accountId === "liability:bill_pay_pending",
        ),
      ),
    );
    assert.ok(
      journal.entries.some((entry: { lines: Array<{ accountId: string }> }) =>
        entry.lines.some(
          (line: { accountId: string }) =>
            line.accountId === "liability:transfer_pending",
        ),
      ),
    );

    const pool = new Pool({ connectionString: databaseUrl });

    try {
      const unbalanced = await pool.query(
        `
          SELECT journal_entries.id
          FROM journal_entries
          JOIN journal_lines ON journal_lines.journal_entry_id = journal_entries.id
          WHERE journal_entries.household_id = $1
          GROUP BY journal_entries.id
          HAVING SUM(journal_lines.amount_cents) <> 0
        `,
        [householdId],
      );
      assert.equal(unbalanced.rowCount, 0);
      const recovery = await pool.query(
        `
          SELECT remaining_recovery_cents, recovery_checks_remaining,
            recovery_status
          FROM unlock_requests
          WHERE household_id = $1
            AND idempotency_key = $2
        `,
        [householdId, unlockKey],
      );
      assert.equal(Number(recovery.rows[0].remaining_recovery_cents), 0);
      assert.equal(Number(recovery.rows[0].recovery_checks_remaining), 0);
      assert.equal(recovery.rows[0].recovery_status, "complete");
      const pending = await pool.query(
        `
          SELECT ledger_accounts.account_code,
            COALESCE(SUM(journal_lines.amount_cents), 0) AS balance_cents
          FROM ledger_accounts
          LEFT JOIN journal_lines
            ON journal_lines.ledger_account_id = ledger_accounts.id
          WHERE ledger_accounts.household_id = $1
            AND ledger_accounts.account_code IN (
              'liability:bill_pay_pending',
              'liability:transfer_pending'
            )
          GROUP BY ledger_accounts.account_code
        `,
        [householdId],
      );

      for (const row of pending.rows) {
        assert.equal(Number(row.balance_cents), 0);
      }
    } finally {
      await pool.end();
    }
  },
);

postgresTest(
  "postgres KYC onboarding resumes a hosted verification and clears terminal links",
  async () => {
    const nonce = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const providerName = "test_baas";
    const providerCustomerId = `provider_customer_${nonce}`;
    const providerApplicationId = `provider_kyc_${nonce}`;
    const householdId = `household_kyc_${nonce}`;
    const userId = `user_kyc_${nonce}`;
    const verificationUrl = `https://identity.example.test/session/${nonce}?token=temporary`;
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      PAYSHIELD_CORE_DB_IDLE_TIMEOUT_MS: "1000",
      PAYSHIELD_LEDGER_DATABASE_URL: databaseUrl,
    };
    const identity = {
      actorUserId: userId,
      betaAccessStatus: "approved",
      clerkSubject: `clerk_kyc_${nonce}`,
      householdId,
      kycStatus: "provider_pending",
      providerName,
      userEmail: `kyc-${nonce}@example.com`,
      userName: "KYC Test Household",
    };

    const persisted = await persistProviderOnboardingState(
      {
        ...identity,
        customer: {
          providerCustomerId,
          status: "created",
        },
        kyc: {
          expiresAt,
          providerApplicationId,
          providerCustomerId,
          providerRequestId: `request_${nonce}`,
          status: "started",
          verificationUrl,
        },
      },
      env,
    );

    assert.equal(persisted.persistence, "postgres");
    assert.equal(persisted.state.kyc.verificationUrl, verificationUrl);
    assert.equal(persisted.state.kyc.expiresAt, expiresAt);

    const loaded = await loadProviderOnboardingState(
      householdId,
      providerName,
      env,
    );
    assert.equal(loaded.state.kyc.verificationUrl, verificationUrl);

    const approved = await updateProviderKycApplicationStatus(
      {
        failureReason: null,
        metadata: { event: "kyc.approved" },
        providerApplicationId,
        providerCustomerId,
        providerName,
        status: "approved",
      },
      env,
    );
    assert.equal(approved.updated, true);
    assert.equal(approved.kyc.status, "approved");
    assert.equal(approved.kyc.verificationUrl, null);
    assert.equal(approved.kyc.expiresAt, null);
  },
);

postgresTest(
  "postgres Plaid sync queue deduplicates, locks, retries, and completes jobs",
  async () => {
    const nonce = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      PAYSHIELD_CORE_DB_IDLE_TIMEOUT_MS: "1000",
      PAYSHIELD_LEDGER_DATABASE_URL: databaseUrl,
    };
    const providerEventId = `plaid_event_${nonce}`;
    const providerItemId = `plaid_item_${nonce}`;
    const workerOne = `worker_one_${nonce}`;
    const workerTwo = `worker_two_${nonce}`;
    const first = await enqueuePlaidSyncJob(
      { providerEventId, providerItemId },
      env,
    );
    const replay = await enqueuePlaidSyncJob(
      { providerEventId, providerItemId },
      env,
    );

    assert.equal(first.persistence, "postgres");
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(replay.job.id, first.job.id);

    const claimed = await claimPlaidSyncJobs(
      { limit: 1, workerId: workerOne },
      env,
    );
    const competing = await claimPlaidSyncJobs(
      { limit: 1, workerId: workerTwo },
      env,
    );

    assert.equal(claimed.jobs.length, 1);
    assert.equal(claimed.jobs[0].status, "running");
    assert.equal(claimed.jobs[0].lockedBy, workerOne);
    assert.equal(competing.jobs.length, 0);

    const failed = await failPlaidSyncJob(
      {
        errorCode: "sync_temporarily_unavailable",
        id: first.job.id,
        retryable: true,
        workerId: workerOne,
      },
      env,
    );
    assert.equal(failed.updated, true);
    assert.equal(failed.job.status, "retry");

    const pool = new Pool({ connectionString: databaseUrl });

    try {
      await pool.query(
        "UPDATE plaid_sync_jobs SET available_at = now() WHERE id = $1",
        [first.job.id],
      );
    } finally {
      await pool.end();
    }

    const retried = await claimPlaidSyncJobs(
      { limit: 1, workerId: workerTwo },
      env,
    );
    assert.equal(retried.jobs.length, 1);
    assert.equal(retried.jobs[0].attempts, 2);

    const completed = await completePlaidSyncJob(
      { id: first.job.id, workerId: workerTwo },
      env,
    );
    assert.equal(completed.updated, true);
    assert.equal(completed.job.status, "completed");
    assert.equal(completed.job.lockedBy, null);
  },
);
