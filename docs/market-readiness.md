# Market Readiness

## Source Gate

Run:

```bash
npm run verify
```

The gate covers website and mobile linting, TypeScript, Expo Doctor, native web
export, unit/API tests, route parity, Supabase infrastructure controls, schema
safety, Next.js production build, responsive browser checks, and production
dependency audit.

Against PostgreSQL 17, also run:

```bash
PAYSHIELD_LEDGER_DATABASE_URL="<test-database>" \
PAYSHIELD_TEST_DATABASE_URL="<test-database>" \
  npm run supabase:schema:apply

PAYSHIELD_LEDGER_DATABASE_URL="<test-database>" \
  npm run supabase:schema:verify

PAYSHIELD_TEST_DATABASE_URL="<test-database>" \
  node --experimental-strip-types --test tests/core-postgres-integration.test.mts
```

## Product Gate

- A new household can sign in and see a four-step setup path.
- Membership purchase and restore update paid access.
- Bank connection, token exchange, sync, disconnect, and replay handling work.
- Paycheck plan saves profile and buckets atomically.
- Short checks fund priorities without exposing protected money.
- Bills require verified destinations and respect limits.
- Transfer, unlock, card, and closure operations are idempotent.
- Activity export contains the full household audit record without secrets.
- Empty, loading, error, disconnected, expired-session, and offline states are
  understandable on small and large phones.

## Hosted Gate

```bash
npm run smoke:deploy -- https://<production-domain>
npm run readiness:commercial -- https://<production-domain>
npm run production:routes -- https://<production-domain>
```

Confirm the exact deployed commit, direct Apple/Google listing URLs, production
Clerk access, Supabase connectivity, RevenueCat entitlement, Plaid webhook, and
support mailbox.

## Store Gate

- EAS production project and signing credentials exist.
- Apple and Google app records match bundle id
  `com.graystontechnologies.payshield`.
- Monthly products map to RevenueCat entitlement `payshield_pro`.
- Privacy labels and Data Safety answers match the repository data map.
- Screenshots and metadata match the submitted build.
- Purchase, restore, subscription management, deep links, biometric lock, bank
  Link, and account closure pass on physical iOS and Android devices.

## External Gate

Before custodial accounts, card issuance, direct deposit, ACH, or bill execution
can be enabled, retain evidence for the contracted provider, sponsor-approved
disclosures, counsel approval, KYC/AML procedures, disputes, reconciliation,
incident response, and customer support. These inputs cannot be manufactured by
source code.

## Release Record

Record the Git commit, Vercel deployment id, Supabase project ref and migration
versions, EAS build ids, store versions, provider environment, smoke-test time,
and approver. A polished web deployment alone is not a mobile-market release.
