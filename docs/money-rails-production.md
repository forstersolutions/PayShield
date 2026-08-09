# Core And Money-Rail Operations

## Deploy

The production core is defined in `infra/aws/payshield-core.yaml` and released by
`.github/workflows/deploy-core.yml`.

The workflow:

1. Assumes the production AWS role through GitHub OIDC.
2. Validates CloudFormation and the repository infrastructure audit.
3. Creates or updates infrastructure with zero running tasks.
4. Builds an immutable ECR image for the Git commit.
5. Runs schema migrations as a private one-off Fargate task.
6. Starts the requested service count only after migration succeeds.
7. Waits for ECS stability, checks public health, and checks authenticated
   readiness.

The first deployment requires an ACM certificate, core DNS name, and GitHub
production environment variables listed in the README. When DNS is outside
Route 53, leave `PAYSHIELD_HOSTED_ZONE_ID` blank and point the core hostname to
the stack's `LoadBalancerDnsName` output. When the zone is in Route 53, the stack
creates the alias record.

## Runtime Secrets

The stack generates and retains:

- RDS master credentials.
- `PAYSHIELD_CORE_SERVICE_TOKEN`.
- `PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY`.
- `PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET`.
- `PAYSHIELD_PROVIDER_WEBHOOK_SECRET`.

Plaid client ID, Plaid secret, and the banking-provider API key are supplied as
separate Secrets Manager ARNs. Rotate external provider secrets in Secrets
Manager, force a new ECS deployment, and confirm readiness before revoking the
old credential.

## Plaid

Register this production callback:

```text
https://CORE_DOMAIN/api/plaid/webhooks
```

Plaid requests are verified with `Plaid-Verification`, ES256, the provider key
endpoint, token age limits, and the SHA-256 hash of the exact raw body. Valid
transaction update events are persisted and queued. The background worker loads
the bank connection from PostgreSQL, decrypts its token inside the core, runs
`/transactions/sync`, updates the cursor, applies household paycheck rules, and
posts balanced splits.

Use `/api/app/bank-link/token` and `/api/app/bank-link/exchange` from the
authenticated frontend. The browser receives a Link token and public token only;
the access token is encrypted and stored by the core.

## Banking Provider Adapter

Set the provider name, HTTPS base URL, API key secret ARN, and endpoint path
overrides required by the signed provider contract. The adapter supports:

- customer creation and KYC start;
- financial account opening and direct-deposit instructions;
- card issue and card status changes;
- payee enrollment and verification;
- ACH transfers and bill payments;
- card authorization responses;
- settlement, failure, cancellation, expiration, and reversal webhooks.

All create and movement calls carry immutable idempotency keys. Provider
callbacks use the exact raw JSON body and
`x-payshield-provider-signature: t=<unix>,v1=<hmac-sha256>`. Configure the
generated provider webhook secret at the provider and register:

```text
https://CORE_DOMAIN/api/provider/webhooks
https://CORE_DOMAIN/api/card/authorize
```

Unknown references, amount conflicts, invalid transitions, and execution errors
create reconciliation exceptions instead of silently changing balances.

## Ledger Operations

Apply and verify migrations only through the release workflow or:

```bash
PAYSHIELD_LEDGER_DATABASE_URL=... npm run core:migrations:apply
PAYSHIELD_LEDGER_DATABASE_URL=... npm run core:migrations:verify
```

Never modify or delete posted journals. Corrections use linked reversal entries.
Review open reconciliation exceptions every operating day and after any provider
incident. Before resolving an exception, compare provider event ID, amount,
household, source account, destination, journal, settlement state, and provider
dashboard evidence.

## Incident Actions

- Provider uncertainty: set `PAYSHIELD_LIVE_MONEY_ENABLED=false` and
  `PAYSHIELD_TRANSFER_ENABLED=false`, then deploy the stack update.
- Card authorization instability: disable the provider gateway according to the
  approved provider runbook and preserve all inbound event logs.
- Plaid sync failure: leave webhooks enabled, inspect dead/retry jobs, restore
  credentials or connectivity, and replay by stable item/event ID.
- Database incident: keep application writes closed, restore to a separate RDS
  instance, verify schema and balanced journals, reconcile provider events, then
  cut over under the approved recovery plan.
- Bad application release: ECS deployment circuit breaker rolls back unhealthy
  tasks. Operators can redeploy the prior immutable image tag after confirming
  the migration remains forward compatible.

## Live-Money Gate

Keep `PAYSHIELD_LIVE_MONEY_ENABLED=false` until provider credentials and webhook
signing are active, schema `0019` is verified, frontend authentication is proven,
and provider, sponsor, counsel, and operations approvals are recorded. The core
readiness endpoint independently checks those conditions.
