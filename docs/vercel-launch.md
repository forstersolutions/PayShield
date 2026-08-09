# Vercel Frontend Deployment

## Production Variables

```text
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
PAYSHIELD_CORE_API_URL
PAYSHIELD_CORE_SERVICE_TOKEN
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
PAYSHIELD_COMMERCIAL_PRICE_ID
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

## Stripe

Create a recurring Stripe Price matching the displayed membership amount. Set
the production webhook endpoint to:

```text
https://your-payshield-domain.example/api/app/billing/webhook
```

Subscribe to the checkout completion and subscription lifecycle events used by
the route. Configure the Stripe Billing Portal before exposing membership
management.

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

Verify the canonical domain, Clerk sign-in and sign-out, checkout redirect,
signed Stripe activation, billing portal, authenticated core proxy headers,
mobile layout, legal pages, favicon, social image, and support email.

Rollback by promoting the previous known-good Vercel deployment. Do not change
the core schema backward during a frontend rollback.
