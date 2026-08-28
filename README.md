# PayShield

PayShield is a mobile household paycheck-control product from Grayston
Technologies. It recognizes income, funds protected priorities in order, and
shows the remainder as one honest Safe to Spend balance.

## What Customers Can Do

- Sign in to one private household account.
- Purchase or restore a monthly mobile membership.
- Connect the checking account where income arrives.
- Create, rename, reorder, and remove protected buckets.
- Set paycheck amount, employer, cadence, and next payday.
- Detect deposits and split them through a double-entry ledger.
- Approve bill destinations and assign each one to a specific bucket.
- Schedule or cancel bills, request transfers, and unlock protected money with
  a visible recovery plan.
- Manage card and direct-deposit controls when the contracted banking provider
  is enabled.
- Review and export a complete household activity record.
- Disconnect banks or request durable account closure.

## Architecture

- `apps/mobile`: Expo iOS and Android customer application.
- `src/app`: download website and authenticated Vercel API facade.
- `services/core`: ledger, paycheck, provider, billing, and closure domains.
- `services/core/dispatcher.mjs`: runs the core directly inside Vercel Functions.
- `services/core/migrations`: forward-only ledger schema through `0022`.
- `supabase/migrations`: Supabase RLS and Data API isolation.
- Supabase Free supplies PostgreSQL through its transaction pooler.
- Clerk supplies customer authentication and RevenueCat supplies native store
  membership. Both can begin on their free plans.

The mobile application never receives database credentials, provider secrets,
Plaid access tokens, or RevenueCat server credentials. All money operations run
through authenticated Vercel route handlers. Public Supabase roles have no
access to ledger tables.

## Local Setup

Requirements: Node.js 22, npm 10, PostgreSQL 17, Xcode for iOS, and Android
Studio for Android.

```bash
npm ci
npm ci --prefix apps/mobile
cp .env.example .env.local
npm run dev
```

The website opens at `http://localhost:3000`. The mobile app can run in its
local demonstration state with `EXPO_PUBLIC_DEMO_MODE=true`.

## Supabase Setup

Create one dedicated PayShield project. In Supabase, copy the transaction-mode
pooler URI from **Connect > Transaction pooler** and store it only as
`PAYSHIELD_LEDGER_DATABASE_URL` in local/Vercel server environments.

Apply and verify the schema:

```bash
PAYSHIELD_LEDGER_DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres" \
  npm run supabase:schema:apply

PAYSHIELD_LEDGER_DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres" \
  npm run supabase:schema:verify
```

After verification, configure:

```text
PAYSHIELD_CORE_RUNTIME=vercel
PAYSHIELD_LEDGER_SCHEMA_VERIFIED=true
PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION=0022
PAYSHIELD_LEDGER_SCHEMA_FINGERPRINT=<output from schema apply>
PAYSHIELD_SUPABASE_SECURITY_VERIFIED=true
```

Generate long random values for `CRON_SECRET`, the token-vault encryption key,
and webhook secrets. Keep every non-public value in Vercel encrypted environment
variables.

## Verification

```bash
npm run verify
```

With PostgreSQL available:

```bash
PAYSHIELD_LEDGER_DATABASE_URL=postgresql:///payshield_test \
PAYSHIELD_TEST_DATABASE_URL=postgresql:///payshield_test \
  npm run supabase:schema:apply

PAYSHIELD_TEST_DATABASE_URL=postgresql:///payshield_test \
  node --experimental-strip-types --test tests/core-postgres-integration.test.mts
```

Deployed checks:

```bash
npm run smoke:deploy -- https://your-domain.example
npm run readiness:commercial -- https://your-domain.example
npm run production:routes -- https://your-domain.example
```

## Deployment

1. Apply and verify the Supabase schema.
2. Add the production variables from `.env.example` to Vercel.
3. Set `PLAID_WEBHOOK_URL=https://your-domain/api/plaid/webhooks`.
4. Deploy the Next.js project to Vercel.
5. Run all deployed checks.
6. Build and submit the Expo app after store, RevenueCat, Clerk, and Plaid
   production configuration is complete.

Detailed procedures are in [docs/vercel-launch.md](docs/vercel-launch.md),
[docs/money-rails-production.md](docs/money-rails-production.md), and
[docs/market-readiness.md](docs/market-readiness.md).

## External Inputs

Source code cannot provide banking contracts, production provider credentials,
Apple/Google store approval, legal approvals, or physical-device evidence. Live
custodial money movement and card issuance stay disabled until the contracted
BaaS/card provider and sponsor requirements are complete.

Support: `support@graystontechnologies.com`
