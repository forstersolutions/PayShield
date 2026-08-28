# Vercel Launch

PayShield uses one Vercel project for the download website, authenticated mobile
API, provider webhooks, and scheduled maintenance. Supabase supplies PostgreSQL.

## Project

1. Import `forstersolutions/PayShield` into Vercel.
2. Use the repository root and the Next.js preset.
3. Use Node.js 22.
4. Keep preview deployments blocked from live provider credentials.

## Required Server Variables

```text
PAYSHIELD_CORE_RUNTIME=vercel
PAYSHIELD_SUPABASE_PROJECT_REF=<project-ref>
PAYSHIELD_LEDGER_DATABASE_URL=<Supabase transaction-pooler URI>
PAYSHIELD_LEDGER_SCHEMA_VERIFIED=true
PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION=0022
PAYSHIELD_LEDGER_SCHEMA_FINGERPRINT=<verified fingerprint>
PAYSHIELD_SUPABASE_SECURITY_VERIFIED=true
PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE=true
PAYSHIELD_FRONTEND_AUTH_VERIFIED=true
CRON_SECRET=<long random value>
```

Use the pooler URI on port `6543`. Do not expose it with a `NEXT_PUBLIC_` prefix.

## Customer Access

Configure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Add the
production domain and native deep links in Clerk. Set operator subjects through
`PAYSHIELD_OPERATOR_USER_IDS`; do not authorize operators from editable profile
metadata.

## Native Membership

Configure RevenueCat only after the Apple and Google subscriptions exist:

```text
PAYSHIELD_MOBILE_STORE_BILLING_ENABLED=true
PAYSHIELD_REVENUECAT_STORES_CONFIGURED=true
PAYSHIELD_REVENUECAT_ENTITLEMENT_ID=payshield_pro
PAYSHIELD_REVENUECAT_WEBHOOK_SECRET=<secret>
PAYSHIELD_REVENUECAT_SECRET_API_KEY=<server secret>
PAYSHIELD_REQUIRE_PAID_ACCESS=true
```

The mobile public SDK keys belong in EAS, not Vercel server variables.

## Bank Connection

Configure Plaid and register:

```text
PLAID_WEBHOOK_URL=https://<production-domain>/api/plaid/webhooks
```

Also set `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, token-vault key id,
32-byte encryption key, and provider webhook secret. Access tokens are encrypted
before they enter Supabase.

## Banking Provider

Set the provider adapter variables only after the exact sandbox contract is
known. Enable `PAYSHIELD_LIVE_MONEY_ENABLED` last, after contract, sponsor,
counsel, and runbook gates are recorded.

## Deploy And Verify

```bash
vercel --prod
npm run smoke:deploy -- https://<production-domain>
npm run readiness:commercial -- https://<production-domain>
npm run production:routes -- https://<production-domain>
```

The deployment is releasable only when checkout is active, `/download` resolves
to direct store listings, authenticated APIs reach the Supabase ledger, and all
money routes fail closed when their provider gate is unavailable.
