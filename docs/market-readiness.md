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
  consent, sensitive financial-detail rejection, optional webhook forwarding,
  allowlisted campaign attribution from UTM fields, and an opt-in fail-closed
  mode for paid traffic when signed webhook persistence is required.
- Vercel-compatible Next.js app with production build, metadata, sitemap,
  robots, and baseline browser security headers.
- JPEG social preview card for broad Open Graph and Twitter crawler support,
  while the in-page product mockup uses AVIF for faster delivery.
- Branded PayShield icon and web app manifest for deploy previews, saved links,
  and install surfaces.
- `npm run verify` and GitHub Actions CI for linting, TypeScript checks,
  waitlist API tests, market copy/asset preflight checks, production builds,
  production dependency audits, and receiver Docker image builds before Vercel
  deployment.
- Dependabot is configured for weekly npm and GitHub Actions update PRs, with
  grouped runtime, observability, lint/type, and workflow maintenance. npm
  semver-major updates are deferred during launch so major framework and tooling
  migrations stay intentional. Dependabot security updates, secret scanning,
  push protection, and private vulnerability reporting are enabled on GitHub.
- Security policy for private vulnerability reporting, sensitive data handling,
  public `/.well-known/security.txt`, and the current prototype/live-money
  boundary.
- Paid-traffic readiness issue form for tracking launch evidence and the
  remaining lead-capture, legal, analytics, and production-ops gates.
- Automated market preflight checks for required prototype disclaimers, consent
  links, launch assets, env examples, and blocked regulated-finance claims.
- Campaign copy linter and guardrails for checking paid ads, email campaigns,
  social posts, partner one-pagers, and alternate landing-page copy before
  counsel review.
- Post-deploy smoke checker for Vercel preview and production URLs, including
  homepage metadata, legal pages, SEO routes, assets, browser security headers,
  public security disclosure, absence of default scaffold assets, production
  site URL alignment, and safe waitlist API validation.
- Route-level waitlist API tests covering demo mode, validation, honeypot
  filtering, rate limiting, oversized requests, webhook forwarding, and webhook
  failure handling.
- Vercel Web Analytics and Speed Insights are installed and mounted.
- Pilot conversion events track non-PII segment, result, status, and sanitized
  campaign metadata.
- Prototype Privacy Notice discloses campaign attribution fields, Vercel Web
  Analytics, Speed Insights, and the analytics boundary that excludes emails,
  names, sensitive financial details, and free-text pilot notes.
- `/api/waitlist` emits structured logs for request start, validation outcomes,
  webhook mode, completion, and failures.
- `/api/health` reports public-safe deployment and waitlist readiness state
  without exposing the webhook URL or signing secret.
- Signed webhook receiver utility for validating HMAC headers and writing leads
  to ignored local NDJSON/CSV files when a lightweight receiver is needed.
- Dedicated `Dockerfile.receiver` for running the signed receiver on a container
  host with a persistent `/data/waitlist` volume and `GET /health` checks.
- Receiver data-ops command for non-PII lead summaries and email-based deletion
  requests against the lightweight receiver files, including campaign/source
  counts for paid tests.
- Signed webhook smoke tester for proving a CRM or lightweight receiver accepts
  PayShield HMAC payloads before paid traffic is enabled.
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
  so valid public submissions fail closed unless signed webhook capture is
  configured.
- Confirm the receiving webhook responds in under eight seconds.
- If no CRM receiver exists yet, deploy or tunnel `npm run webhook:receive` with
  `PAYSHIELD_WAITLIST_WEBHOOK_SECRET` set, then use that endpoint as the
  temporary webhook target.
- If the lightweight receiver is used for production capture, run it from
  `Dockerfile.receiver` on a host with a persistent volume mounted at
  `/data/waitlist`, confirm `GET /health` returns
  `service: "payshield-waitlist-receiver"`, and include the volume backup/export
  owner in the launch evidence.
- If the lightweight receiver is used, run
  `npm run waitlist:data -- summary --data-dir /path/to/waitlist` after test
  submissions to confirm non-PII counts, and use
  `npm run waitlist:data -- erase --email lead@example.com --dry-run` before
  honoring deletion requests.
- Run `PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret npm run webhook:test -- https://your-webhook-url`
  against the receiver and confirm it returns a 2xx response before configuring
  Vercel to require webhook persistence.
- Confirm `https://payshield-lime.vercel.app/api/health` reports
  `waitlist.webhookSigningConfigured: true` and
  `waitlist.paidTrafficReady: true` after the webhook, signing secret, and
  fail-closed flag are configured.
- Run `npm run readiness:paid-traffic -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app`
  and confirm it passes without `--allow-prototype`.
- Run `npm run smoke:deploy -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app --submit-test --require-webhook`
  and confirm it returns webhook mode before paid traffic.
- Enable Vercel Web Analytics and Speed Insights in the Vercel dashboard.
- Confirm custom events appear for pilot request attempt, submission, and
  failure after the first production or preview deployment.
- Submit at least one test URL with `utm_source`, `utm_medium`, and
  `utm_campaign`, then confirm analytics and the receiver show only sanitized
  campaign fields, not raw query strings or free-text notes.
- Confirm the Privacy Notice still discloses campaign attribution, analytics,
  performance metadata, and the analytics PII boundary before campaign traffic.
- Confirm privacy policy and terms links before collecting personal data beyond
  pilot emails and optional notes.
- Run `npm run campaign:lint -- path/to/campaign-copy.md` for every paid ad,
  email, social, partner, or alternate landing-page copy draft and attach the
  output to the readiness issue before counsel review.
- Open a Paid Traffic Readiness issue and attach evidence for the webhook test,
  production health response, CI run, Vercel deployment, analytics, and legal
  review before spending on acquisition.

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
