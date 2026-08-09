# PayShield

PayShield is a household paycheck-control application from Grayston Technologies.
It turns incoming income into protected, customizable buckets and exposes only
the remaining balance as Safe to Spend.

## Product

The customer application includes:

- Clerk-authenticated household accounts.
- Stripe membership checkout, activation webhooks, and billing portal access.
- Hosted identity verification and provider onboarding.
- Plaid Link, encrypted server-side token custody, transaction sync, and signed
  webhook verification.
- Custom protected buckets with priorities, targets, cadence, due dates,
  protection levels, and payee assignments.
- Automatic paycheck detection and double-entry bucket splits.
- Direct-deposit instructions from the configured banking provider.
- Approved payees, scheduled bill payments, ACH transfers, card freeze controls,
  Safe to Spend card authorization, protected-fund unlocks, and recovery plans.
- Immutable journal entries, idempotent provider events, reconciliation queues,
  household audit export, and operator gate evidence.

## Architecture

- `src/app`: Next.js frontend and authenticated API facade on Vercel.
- `services/core`: always-on Node.js money-control service.
- `services/core/migrations`: PostgreSQL schema `0001` through `0019`.
- `infra/aws/payshield-core.yaml`: two-AZ ECS/Fargate, RDS PostgreSQL, ALB,
  WAF, KMS, Secrets Manager, autoscaling, alarms, backups, and private networking.
- `.github/workflows/deploy-core.yml`: OIDC release, immutable ECR image,
  forward-only migration task, ECS rollout, and health verification.

Vercel never owns provider credentials, ledger credentials, or token-custody
keys. Authenticated browser requests terminate at the Vercel facade and are
forwarded to the core with a service token and the verified Clerk identity.
Provider card and webhook ingress terminates at the core and is independently
signature verified.

## Local Development

Requirements: Node.js 22, npm 10, and PostgreSQL 16.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The local app opens at `http://localhost:3000`. Set
`PAYSHIELD_ALLOW_REVIEW_APP_ACCESS=true` only for local product review. Real
accounts require Clerk plus the dedicated core.

Run the core against local PostgreSQL:

```bash
createdb payshield
export PAYSHIELD_LEDGER_DATABASE_URL=postgresql:///payshield
npm run core:migrations:apply
npm run core:migrations:verify
npm run core:server
```

## Verification

```bash
npm run verify
```

The release gate runs lint, TypeScript, all unit/API tests, product preflight,
route parity, AWS infrastructure controls, migration checks, a production build,
and the production dependency audit.

Real PostgreSQL integration:

```bash
PAYSHIELD_TEST_DATABASE_URL=postgresql:///payshield_test \
  node --experimental-strip-types --test tests/core-postgres-integration.test.mts
```

Container and deployed smoke checks:

```bash
npm run core:docker:smoke
npm run smoke:deploy -- https://your-payshield-domain.example
npm run readiness:commercial -- https://your-payshield-domain.example
```

## Deployment

Frontend setup is in [docs/vercel-launch.md](docs/vercel-launch.md). Core setup
and money-rail operations are in
[docs/money-rails-production.md](docs/money-rails-production.md). The complete
release checklist is in [docs/market-readiness.md](docs/market-readiness.md).

Core deployment requires these GitHub production variables:

- `AWS_REGION`
- `AWS_DEPLOY_ROLE_ARN`
- `PAYSHIELD_CFN_EXECUTION_ROLE_ARN`
- `PAYSHIELD_CORE_STACK_NAME`
- `PAYSHIELD_CORE_DOMAIN_NAME`
- `PAYSHIELD_CORE_CERTIFICATE_ARN`
- `PAYSHIELD_HOSTED_ZONE_ID` when Route 53 manages the core hostname

`infra/aws/github-deploy-role.yaml` creates the environment-bound GitHub OIDC
deploy role and the dedicated CloudFormation execution role. No static AWS
access key is required by GitHub Actions.

Plaid and banking-provider credentials are stored as separate AWS Secrets
Manager values and passed by ARN. The stack generates the database password,
Vercel-to-core token, provider webhook secret, token-vault HMAC secret, and
token-vault encryption key.

Run the `Deploy PayShield core` workflow first with live money disabled. After
the core URL and service token are added to Vercel, deploy the frontend and run
the deployed smoke checks. Live money can be enabled only after every required
provider, sponsor, counsel, and operations approval is recorded.

## External Release Inputs

Code cannot supply these items:

- Clerk production application and approved sign-in configuration.
- Stripe live account, product, price, webhook endpoint, and billing portal.
- Plaid production access and webhook registration.
- Contracted BaaS/card provider, sponsor setup, API credentials, webhook
  registration, and supported authorization contract.
- Production domain, DNS, and ACM certificate for the core service.
- Counsel-approved product terms, disclosures, fee treatment, privacy notice,
  and support procedures.
- Approved KYC/AML, sanctions, disputes, error resolution, reconciliation,
  incident response, card, ACH, and customer-support runbooks.

Support: `support@graystontechnologies.com`
