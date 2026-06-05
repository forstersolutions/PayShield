# Market Readiness

This repository is ready to support a public prototype launch, Vercel preview
deployments, partner demos, and pilot demand capture.

## Ready Now

- Interactive protected-paycheck product demo.
- Safe-to-spend balance, protected bucket funding, shortfall handling, card
  authorization preview, and emergency unlock preview.
- Pricing and positioning copy for Free, Plus, Pro, and Premium plans.
- Pilot request form with server-side validation, bounded in-memory rate
  limiting, request-size guardrails, honeypot filtering, required privacy/terms
  consent, optional webhook forwarding, and an opt-in fail-closed mode for paid
  traffic when webhook persistence is required.
- Vercel-compatible Next.js app with production build, metadata, sitemap,
  robots, and baseline browser security headers.
- JPEG social preview card for broad Open Graph and Twitter crawler support,
  while the in-page product mockup uses AVIF for faster delivery.
- Branded PayShield icon and web app manifest for deploy previews, saved links,
  and install surfaces.
- `npm run verify` and GitHub Actions CI for linting, TypeScript checks,
  waitlist API tests, market copy/asset preflight checks, production builds, and
  production dependency audits before Vercel deployment.
- Dependabot is configured for weekly npm and GitHub Actions update PRs, with
  grouped runtime, observability, lint/type, and workflow maintenance. npm
  semver-major updates are deferred during launch so major framework and tooling
  migrations stay intentional.
- Automated market preflight checks for required prototype disclaimers, consent
  links, launch assets, env examples, and blocked regulated-finance claims.
- Post-deploy smoke checker for Vercel preview and production URLs, including
  homepage metadata, legal pages, SEO routes, assets, browser security headers,
  production site URL alignment, and safe waitlist API validation.
- Route-level waitlist API tests covering demo mode, validation, honeypot
  filtering, rate limiting, oversized requests, webhook forwarding, and webhook
  failure handling.
- Vercel Web Analytics and Speed Insights are installed and mounted.
- Pilot conversion events track non-PII segment, result, and status metadata.
- `/api/waitlist` emits structured logs for request start, validation outcomes,
  webhook mode, completion, and failures.
- Conservative fintech language that does not claim PayShield is a bank or that
  funds are FDIC insured.
- Prototype Privacy Notice and Terms pages linked from the pilot form and
  footer.
- Production Vercel deployment at `https://payshield-lime.vercel.app`, with the
  Vercel project connected to `forstersolutions/PayShield`, Web Analytics and
  Speed Insights enabled, and production smoke checks passing.

## Configure Before Traffic

- Set `PAYSHIELD_WAITLIST_WEBHOOK_URL` to a CRM, Airtable, Slack, Make, Zapier,
  or internal webhook.
- Set `PAYSHIELD_WAITLIST_WEBHOOK_SECRET` so the receiving webhook can validate
  the HMAC-SHA256 signature headers before storing leads.
- Set `PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` after the webhook is configured
  so valid public submissions do not return demo-mode success.
- Confirm the receiving webhook responds in under eight seconds.
- Run `npm run smoke:deploy -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app --submit-test --require-webhook`
  and confirm it returns webhook mode before paid traffic.
- Enable Vercel Web Analytics and Speed Insights in the Vercel dashboard.
- Confirm custom events appear for pilot request attempt, submission, and
  failure after the first production or preview deployment.
- Confirm privacy policy and terms links before collecting personal data beyond
  pilot emails and optional notes.

## Do Not Claim Yet

- Banking services provided by a named sponsor bank.
- FDIC insurance, pass-through insurance, or insured account coverage.
- Live direct deposit, ACH, debit card, virtual card, or bill-pay functionality.
- Consumer deposit account opening, KYC approval, or regulated money movement.

## Required Before Live Funds

- Sponsor bank or banking-as-a-service program agreement.
- KYC, AML, fraud monitoring, sanctions screening, and adverse-action handling
  where applicable.
- Double-entry ledger with immutable audit trail, reconciliation, reversals,
  error states, and settlement reporting.
- ACH authorization flow, Reg E/error-resolution workflow, dispute operations,
  fee disclosures, privacy policy, and customer support procedures.
- Card issuing and authorization controls if the safe-spending card becomes
  real.
- Approved compliance review of all website, app, fee, and partner-bank copy.

## Suggested Pilot Funnel

1. Deploy from GitHub to Vercel.
2. Configure the waitlist webhook and analytics.
3. Drive small traffic to families, hourly workers, gig workers, employers, and
   partner-bank/BaaS contacts.
4. Measure the safe-to-spend message, target segment, bucket priorities, and
   willingness to pay.
5. Use pilot data to choose the first regulated infrastructure path.
