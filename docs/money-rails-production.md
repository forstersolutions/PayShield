# PayShield Money Rails Production Runbook

Status: operator setup guide for commercial beta readiness.
Last updated: June 13, 2026.

PayShield becomes usable and revenue-ready through four connected systems:

1. Paid access through Stripe Checkout or a configured Stripe Payment Link.
2. User authentication through Clerk, mapped to a PayShield household.
3. Bank linking through Plaid Link, with access tokens handed to a signed token
   vault receiver owned by the dedicated core backend.
4. Protected ledger actions in the core service: paycheck detection, bucket
   splits, transfer intents, bill-pay controls, unlock records, card decisions,
   and audit export.

## Required Production Variables

Commercial access:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
PAYSHIELD_COMMERCIAL_PRICE_ID=
PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL=
PAYSHIELD_COMMERCIAL_PRICE_LABEL=$19/month
```

Authentication and core service:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
PAYSHIELD_CORE_API_URL=
PAYSHIELD_CORE_SERVICE_TOKEN=
PAYSHIELD_LEDGER_DATABASE_URL=
PAYSHIELD_LEDGER_SCHEMA_VERIFIED=true
PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION=0006
```

Bank connection and transaction detection:

```bash
PLAID_ENV=sandbox
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_PRODUCTS=auth,transactions
PLAID_COUNTRY_CODES=US
PLAID_WEBHOOK_URL=
PAYSHIELD_TOKEN_VAULT_KEY_ID=
PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL=https://your-core-service.example/api/token-vault/plaid
PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET=
PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY=base64:32-byte-token-vault-key-material
PAYSHIELD_TOKEN_VAULT_REPLAY_TOLERANCE_SECONDS=300
```

Transfer/provider activation:

```bash
PAYSHIELD_TRANSFER_ENABLED=true
PAYSHIELD_BAAS_PROVIDER=
PAYSHIELD_BAAS_API_KEY=
PAYSHIELD_BAAS_CONTRACT_APPROVED=true
PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED=true
PAYSHIELD_REGULATED_COUNSEL_SIGNOFF=true
PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED=true
```

## Bank Link Flow

`POST /api/app/bank-link/token` creates a Plaid Link token only when Plaid
credentials and the signed token-vault handoff are configured. If the dedicated
core backend is configured, Vercel forwards the request to the core service so
regulated token custody stays off the frontend host.

`POST /api/app/bank-link/exchange` exchanges the Plaid public token, sends the
returned access token to `PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL` with
`x-payshield-signature`, and stores only the returned `tokenSecretRef` in
PayShield operations. The app never treats `PAYSHIELD_TOKEN_VAULT_KEY_ID` alone
as enough for bank readiness.

The first-party core receiver is `POST /api/token-vault/plaid`. It verifies the
signed raw body, rejects stale signatures, encrypts Plaid access tokens with
AES-256-GCM, and writes only encrypted token material to
`provider_token_secrets`. Without Postgres and
`PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY`, the receiver fails closed.

## Paycheck Detection And Movement

Linked-bank transaction detection uses the token vault reference plus Plaid
transaction events. Provider webhooks can also post income events into
`POST /api/provider/webhooks` or `POST /api/app/paychecks/detect`. The split
engine funds protected buckets first and exposes only the remainder as
`safe_to_spend`.

Transfers, bill payments, and card decisions remain gate controlled:

- `POST /api/app/transfers` creates provider transfer intents only when the
  bucket has funds and transfer/provider gates are ready.
- `POST /api/app/bill-payments` routes approved billers from the selected
  protected bucket.
- `POST /api/card/authorize` approves or declines against Safe to Spend and
  approved biller rules.
- `POST /api/app/unlocks` creates recovery-plan journal records instead of
  silently draining protected funds.

## Verification

Run the local production gate:

```bash
npm run verify
```

After deploy, run:

```bash
npm run smoke:deploy -- --base-url https://payshield-lime.vercel.app
npm run market:status -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app
```

`market:status` must show these money gates as ready before paid public launch:

- Stripe checkout and signed billing webhook.
- Signed token-vault handoff.
- Bank linking.
- Paycheck detection.
- Transfer/provider readiness.
- Core backend, Clerk auth, and Postgres ledger schema `0006`.
