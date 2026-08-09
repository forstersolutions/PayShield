# PayShield Release Checklist

## Repository Gate

```bash
npm ci
npm run verify
npm run core:docker:smoke
```

`npm run verify` must pass without skipped release checks. CI also creates a
clean PostgreSQL 16 database, applies all migrations through `0019`, verifies
the schema fingerprint, and runs the real database lifecycle suite.

## Core Infrastructure

- CloudFormation validates in the target AWS region.
- ECS tasks run in two private application subnets without public IPs.
- RDS runs in two private database subnets with Multi-AZ, KMS encryption,
  deletion protection, SSL enforcement, managed credentials, 35-day backups,
  and snapshot retention.
- The public ALB accepts HTTPS, redirects HTTP, logs requests, drops malformed
  headers, and is associated with WAF managed rules and rate control.
- ECS uses immutable scanned ECR images, a non-root read-only container,
  deployment rollback, health checks, two running tasks, and autoscaling.
- Secrets Manager owns runtime credentials. No provider or database secret is
  stored in GitHub, Vercel, the image, or source control unless that service
  directly requires it.
- CloudWatch logs, alarms, and the support SNS subscription are active.

## Data And Money Controls

- Schema `0019` is applied and the deployed fingerprint matches the repository.
- Posted journals and lines cannot be updated or deleted.
- Every journal balances to zero and stays within one household.
- Provider events, checkout intents, transfers, bill payments, unlocks, and card
  decisions use immutable idempotency keys.
- Holds, settlement, release, failure, cancellation, and reversal paths are
  covered by tests and reconciliation exceptions.
- Plaid webhooks verify ES256 signatures and exact raw-body hashes before queueing.
- Plaid sync jobs deduplicate, use `FOR UPDATE SKIP LOCKED`, back off on failure,
  and stop after the configured terminal attempt.
- Provider card and lifecycle callbacks verify HMAC timestamp signatures and
  reject stale or replay-conflicting payloads.
- Safe to Spend never includes protected bucket balances.

## Frontend

- Vercel Production has Clerk, Stripe, site URL, core URL, and core service token.
- Review access flags are false in production.
- Authenticated users cannot fall back to local/demo money state.
- Public health returns only service identity and healthy status.
- `/api/waitlist` is absent.
- Privacy, terms, security policy, `security.txt`, sitemap, manifest, icons,
  social image, canonical URL, and support contact are correct.
- Desktop and mobile browser checks cover root, sign-in gate, app navigation,
  bucket editing, bank connection, paycheck rules, bills, card controls,
  transfers, unlocks, activity, and account failure states.

## Commercial Services

- Stripe live checkout creates the correct recurring membership.
- Signed Stripe webhooks activate, renew, past-due, cancel, and restore the
  correct household idempotently.
- Billing portal opens only from the household's durable provider customer ID.
- Clerk production sign-in maps the stable Clerk subject to one PayShield user
  and household.
- Plaid production Link and transaction sync complete with a real test account.
- The banking provider sandbox completes customer, KYC, account, deposit
  instructions, card, payee, ACH, bill-payment, card authorization, settlement,
  reversal, and webhook flows.

## Approval Gate

The following must be approved outside the repository before enabling
`PAYSHIELD_LIVE_MONEY_ENABLED=true`:

- Banking/card provider contract and sponsor configuration.
- Exact account, card, deposit, fee, insurance, and funds-availability language.
- Counsel review of the product, privacy notice, terms, membership, unlocks,
  disputes, and customer communications.
- KYC/AML, sanctions, fraud, complaints, disputes, error resolution,
  reconciliation, incident response, business continuity, and support runbooks.
- Named owners, escalation contacts, daily reconciliation review, on-call
  coverage, and rollback authority.

## Release Proof

After both deployments:

```bash
npm run smoke:deploy -- https://your-payshield-domain.example
npm run readiness:commercial -- https://your-payshield-domain.example
```

Record the frontend commit, Vercel deployment URL, core image digest, ECS task
definition, running task count, database migration fingerprint, smoke output,
provider sandbox evidence, approval references, and rollback owner.
