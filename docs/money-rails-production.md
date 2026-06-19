# PayShield Money Rails Production Runbook

Status: operator setup guide for commercial readiness.
Last updated: June 13, 2026.

PayShield becomes usable and revenue-ready through five connected systems:

1. Paid access through Stripe Checkout or a configured Stripe Payment Link.
2. User authentication through Clerk, mapped to a PayShield household.
3. Bank linking through Plaid Link, with access tokens handed to a signed token
   vault receiver owned by the dedicated core backend.
4. Protected ledger actions in the core service: paycheck detection, bucket
   splits, transfer intents, bill-pay controls, unlock records, card decisions,
   and audit export.
5. A configured BaaS/card provider adapter that can receive live JSON API calls
   for customer, account, direct-deposit, card, transfer, bill-pay, and card
   authorization operations.

## Required Production Variables

Commercial access:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
PAYSHIELD_COMMERCIAL_PRICE_ID=
PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL=
PAYSHIELD_COMMERCIAL_PRICE_LABEL=$19/month
PAYSHIELD_REQUIRE_PAID_ACCESS=true
```

When commercial billing is configured, PayShield treats paid access as an
enforcement gate, not a banner. Provider onboarding, bank linking, paycheck
detection, protected transfers, bill-payment controls, card authorization, and
protected unlocks require an active paid-access record in the core service.
Without the dedicated core service, Vercel fallback routes fail closed once
commercial billing is enabled because they cannot prove household subscription
state.

`POST /api/app/billing/checkout` records an idempotent checkout intent before
the household is redirected to Stripe Checkout or a configured payment link. The
record stores provider checkout id, checkout mode, price label, status, and
whether a checkout URL was created. It does not store card data or raw payment
method details. Stripe webhooks remain the source of truth for activating paid
access after payment succeeds.

Checkout is not operational until `PAYSHIELD_CORE_API_URL` and
`PAYSHIELD_CORE_SERVICE_TOKEN` are both configured. The URL points Vercel at the
always-on core service; the token authenticates checkout-intent and webhook
activation writes so a paid household can be unlocked from durable records.
In production, live-money mode, or when `PAYSHIELD_CORE_REQUIRE_SERVICE_TOKEN`
is true, protected core routes reject requests with
`core_service_token_required` until the token is configured.
In those same deployed/live paths, `PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE=true`
keeps money-control writes locked unless `PAYSHIELD_LEDGER_DATABASE_URL` is
configured, preventing bank-link, payroll, bucket, transfer, card, and billing
events from being accepted into volatile memory.

`POST /api/app/billing/portal` opens Stripe Billing Portal only after the
dedicated core returns a durable `providerCustomerId` for the household. This
keeps subscription management tied to the same paid-access records that unlock
money workflows. Vercel fallback mode cannot open the portal because it cannot
prove the customer id without core billing state.

Authentication and core service:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
PAYSHIELD_CORE_API_URL=
PAYSHIELD_CORE_SERVICE_TOKEN=
PAYSHIELD_CORE_REQUIRE_SERVICE_TOKEN=true
PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE=true
PAYSHIELD_LEDGER_DATABASE_URL=
PAYSHIELD_LEDGER_SCHEMA_VERIFIED=true
PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION=0010
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
PAYSHIELD_BAAS_ADAPTER=http_json
PAYSHIELD_BAAS_API_BASE_URL=https://your-provider-adapter.example
PAYSHIELD_BAAS_API_KEY=
PAYSHIELD_BAAS_TIMEOUT_MS=8000
PAYSHIELD_BAAS_CONTRACT_APPROVED=true
PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED=true
PAYSHIELD_REGULATED_COUNSEL_SIGNOFF=true
PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED=true
```

The `http_json` adapter sends signed server-side JSON `POST` requests to the
configured provider base URL. Defaults are `/customers`, `/kyc/applications`,
`/financial-accounts`, `/direct-deposit-instructions`, `/cards`,
`/ach-transfers`, `/bill-payments`, and `/card-authorizations`; override the
`PAYSHIELD_BAAS_*_PATH` variables only after the provider contract specifies a
different gateway shape.

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

Provider transaction webhooks use a separate PayShield HMAC gate:
`PAYSHIELD_PROVIDER_WEBHOOK_SECRET` signs the raw body with
`x-payshield-provider-signature: t=<unix>,v1=<sha256>`. Linked-bank paycheck
detection is not ready until Plaid credentials, the token vault handoff, and
provider webhook signing are configured.

## Paycheck Detection And Movement

Linked-bank transaction detection uses the token vault reference plus Plaid
transaction events. Provider webhooks can also post income events into
`POST /api/provider/webhooks` or `POST /api/app/paychecks/detect`. The split
engine funds protected buckets first and exposes only the remainder as
`safe_to_spend`.

`POST /api/provider/webhooks` now records the provider event, extracts
payroll-like income transactions, resolves the active bank connection when
provider item/account identifiers are present, loads active payroll rules for
that household, and posts only matching paycheck events through the same
protected split journal used by manual detection. Pending, debit, non-income,
and rule-mismatched transactions are ignored or blocked before protected funds
move. In durable mode, provider paycheck events must include provider item and
account identifiers so PayShield can match the transaction to an active
connected account; ambiguous income events stay blocked instead of falling back
to a default household.

`POST /api/app/paychecks/rules` stores the household's recurring income match
rules before automation runs. Each rule records the payroll label or transaction
text, expected amount range, frequency, provider, optional provider item/account
references, status, priority, and idempotency key. With the core service and
Postgres enabled, active rules are consulted before a paycheck split posts, and
posted detections retain the matched rule id for audit and support review.
Without the core, the Vercel route validates the shape but marks the rule as
non-durable.

`POST /api/app/direct-deposit` records the household's paycheck-routing setup.
The route stores only masked account/routing metadata and an idempotent setup
record. When provider gates are active, the configured provider supplies the
instructions; until then, the setup is recorded as provider-gated so support can
see that the household completed the routing step without exposing live account
details.

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
- Core backend, core service auth, Clerk auth, and Postgres ledger schema `0010`.
