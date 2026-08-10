# Vercel Frontend Deployment

## Production Variables

```text
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_APP_STORE_URL
NEXT_PUBLIC_PLAY_STORE_URL
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
PAYSHIELD_CORE_API_URL
PAYSHIELD_CORE_SERVICE_TOKEN
PAYSHIELD_APPLE_TEAM_ID
PAYSHIELD_ANDROID_PACKAGE_NAME
PAYSHIELD_ANDROID_SHA256_CERT_FINGERPRINTS
PAYSHIELD_MOBILE_STORE_BILLING_ENABLED=true
PAYSHIELD_REVENUECAT_STORES_CONFIGURED=true
PAYSHIELD_REVENUECAT_ENTITLEMENT_ID=payshield_pro
PAYSHIELD_REVENUECAT_WEBHOOK_SECRET
PAYSHIELD_COMMERCIAL_PRICE_LABEL
PAYSHIELD_REQUIRE_PAID_ACCESS=true
PAYSHIELD_OPERATOR_USER_IDS
PAYSHIELD_OPERATOR_EMAILS
PAYSHIELD_SUPPORT_EMAIL=support@graystontechnologies.com
```

Production must set:

```text
PAYSHIELD_ALLOW_REVIEW_APP_ACCESS=false
PAYSHIELD_ALLOW_OPERATOR_REVIEW_ACCESS=false
```

Do not add PostgreSQL, Plaid, banking-provider, token-vault, or provider webhook
secrets to Vercel. Those belong to the AWS core task.

## Store distribution

`NEXT_PUBLIC_APP_STORE_URL` and `NEXT_PUBLIC_PLAY_STORE_URL` must be the direct
published listing URLs. Until each listing exists, leave its variable empty;
the website intentionally uses that store's PayShield search instead of
claiming an unavailable download.

Set the App Store associated-domain team ID and the Android release-certificate
SHA-256 fingerprints before enabling production universal links. The Android
asset-links route intentionally returns an empty statement list while no
fingerprints are configured.

## RevenueCat

Attach the App Store and Google Play monthly products to the `payshield_pro`
entitlement and the `$rc_monthly` package in the `default` offering. Configure
the RevenueCat production webhook endpoint as:

```text
https://your-payshield-domain.example/api/app/billing/revenuecat/webhook
```

Set its authorization header to `Bearer <PAYSHIELD_REVENUECAT_WEBHOOK_SECRET>`.
The Vercel route verifies the credential and forwards the normalized event to
the durable core. The core must return success before RevenueCat delivery is
acknowledged; failures return `503` so RevenueCat retries.

## Clerk

Create the production Clerk application, add the production domains and redirect
URLs, and configure the publishable and secret keys in Vercel Production. Add
operator Clerk subject IDs to `PAYSHIELD_OPERATOR_USER_IDS`; email allowlisting
is available for controlled support access but subject IDs are preferred.

## Core Connection

Deploy the AWS core first. Set `PAYSHIELD_CORE_API_URL` to its HTTPS domain and
retrieve the generated service token from the stack's
`CoreServiceTokenSecretArn` output. Store that value only as an encrypted Vercel
Production variable.

The frontend will fail closed for authenticated users if the core URL, token,
or response is unavailable. `/api/health` remains a minimal public liveness
endpoint and does not reveal provider or ledger readiness.

## Deploy And Verify

```bash
npm ci
npm run verify
npx vercel deploy --prod
npm run smoke:deploy -- https://your-payshield-domain.example
npm run readiness:commercial -- https://your-payshield-domain.example
```

Verify the canonical domain, App Store and Google Play links, universal-link
manifests, signed RevenueCat entitlement events, authenticated core proxy
headers, compact phone layout, legal and support pages, favicon, social image,
and Grayston support email.

Rollback by promoting the previous known-good Vercel deployment. Do not change
the core schema backward during a frontend rollback.
