# Market Readiness

This repository is ready to support a Grayston-operated paycheck control product
surface, Vercel deployments, partner demos, BaaS/card-provider diligence, and
product demand capture. Account opening, card controls, and money movement stay
locked until approved provider credentials, disclosures, and operating controls
are active.

## Ready Now

- App-first protected-paycheck dashboard with Safe to Spend as the primary
  balance, protected bucket funding, provider readiness status, operating rail
  order, card-decision simulation, and emergency unlock recovery preview.
- Customizable bucket control studio with editable bucket names, targets,
  protection modes, due rules, priorities, local profile storage, and app API
  save semantics.
- Interactive bill-routing panel for scheduling approved payees against their
  protected buckets, with amount/date validation and visible provider-gated
  execution status.
- Clerk-ready app access boundary for `/app` and `/api/app/*`, with demo mode
  retained until Clerk keys are configured.
- Dedicated regulated core backend scaffold, Dockerfile, compose manifest, and
  Postgres ledger migrations for households, users, provider customers, ledger
  accounts, journal entries, journal lines, payees, provider events,
  reconciliation exceptions, household bucket profiles, bucket rules, and
  bucket-change audit events. The ledger migrations include deferred Postgres
  constraint triggers that require every journal entry to have at least two
  lines, balance to zero cents at transaction commit, and remain immutable after
  posting so corrections happen through reversal entries.
- Dedicated core backend operation routes for profile state, balances, bucket
  profile loading/saving, onboarding start, payee modeling, protected-bucket
  bill-payment scheduling, emergency unlocks, card authorization simulation,
  and provider webhooks. The service accepts both `/app/*` and `/api/app/*`
  style paths, returns no-store JSON, enforces request-size and JSON-shape
  guardrails, and can require
  `PAYSHIELD_CORE_SERVICE_TOKEN` for internal operation routes.
- Next.js app APIs delegate app, card-authorization, and provider-webhook
  operations to the dedicated core service whenever `PAYSHIELD_CORE_API_URL` is
  configured. Delegated requests include the optional
  `PAYSHIELD_CORE_SERVICE_TOKEN`, preserve authenticated app user context for
  `/api/app/*`, keep no-store response semantics, and fail closed instead of
  falling back to local simulation when the configured core is unavailable or
  misconfigured.
- Core migration operations include a redacted, checksummed
  `npm run core:migrations:plan` output, `npm run core:migrations:check` gate,
  an explicit `npm run core:migrations:apply` path that requires
  `PAYSHIELD_LEDGER_DATABASE_URL` and `psql`, a tracked
  `core_schema_migrations` ledger with checksums, and
  `npm run core:migrations:verify` output that returns the non-secret
  `PAYSHIELD_LEDGER_SCHEMA_VERIFIED=true` and
  `PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION=0003` values only after the
  required tables, triggers, functions, and migration checksums are present.
  The live-money Postgres gate does not pass from a database URL alone.
- Core Docker smoke command that builds `Dockerfile.core`, starts the service
  with token protection, checks health, proves authorized balance and card
  authorization behavior, and confirms onboarding stays fail-closed until
  provider and compliance gates pass. CI runs this before receiver smoke checks.
- `BankingProvider` adapter contract and fail-closed provider implementation
  covering customer creation, KYC start, account opening, paycheck routing
  instructions, card issuing, transfers, bill payments, provider webhooks, and
  card authorization responses.
- App APIs for beta state, balances, bucket profile loading/saving, onboarding
  start, payee modeling, protected-bucket bill-payment scheduling, unlock
  recovery, provider webhooks, and card authorization simulation.
- Pricing and positioning copy for Free, Plus, Pro, and Premium plans.
- Product inquiry form with server-side validation, bounded in-memory rate
  limiting, request-size guardrails, honeypot filtering, required privacy/terms
  consent, sensitive financial-detail rejection, optional webhook forwarding,
  optional private Vercel Blob storage, optional Vercel Marketplace Upstash
  Redis storage, Grayston support routing, consent audit fields,
  allowlisted campaign attribution from UTM fields, and an opt-in fail-closed
  mode for paid traffic when durable persistence is required.
- Vercel-compatible Next.js app with production build, metadata, sitemap,
  robots, and baseline browser security headers.
- JPEG social preview card for broad Open Graph and Twitter crawler support,
  while the homepage opens directly into the live planner.
- Branded PayShield icon and web app manifest for deploy previews, saved links,
  and install surfaces.
- `npm run verify` and GitHub Actions CI for linting, TypeScript checks,
  waitlist API tests, market copy/asset preflight checks, production builds,
  production dependency audits, and receiver Docker image smoke checks before
  Vercel deployment.
- Dependabot is configured for weekly npm and GitHub Actions update PRs, with
  grouped runtime, observability, lint/type, and workflow maintenance. npm
  semver-major updates are deferred during launch so major framework and tooling
  migrations stay intentional. Dependabot security updates, secret scanning,
  push protection, and private vulnerability reporting are enabled on GitHub.
- Security policy for Grayston support vulnerability intake, sensitive data
  handling, public `/.well-known/security.txt`, and the regulated partner
  boundary.
- Paid-traffic readiness issue form for tracking launch evidence and the
  remaining lead-capture, legal, analytics, and production-ops gates.
- Redacted launch evidence command that combines production health, public
  readiness checks, analytics instrumentation audit status, Vercel env audit
  status, local lead-capture proof, and the remaining hard gates for the
  readiness issue.
- Market go/no-go command that combines strict production launch evidence,
  hosted receiver evidence, counsel sign-off, and live analytics evidence into
  one redacted JSON decision before paid traffic starts.
- Market status snapshot command that combines production health, local git
  commit, GitHub CI, Vercel deployment readiness, launch evidence, and
  go/no-go remaining gates for repeatable readiness issue updates.
- Local evidence packet initializer that creates ignored counsel, analytics,
  managed receiver, Blob receiver, and Upstash receiver JSON templates plus redacted
  receiver/launch/go-no-go commands for the final operator handoff.
- Vercel webhook cutover planner that validates receiver evidence and prints
  the redacted Production env, redeploy, strict evidence, and required-webhook
  smoke sequence without exposing the signing secret.
- Private Vercel Blob receiver evidence generator and validator that submit a
  production smoke lead, verify the exact private object by receipt ID, and
  emit redacted proof for final go/no-go without printing lead PII or
  `BLOB_READ_WRITE_TOKEN`.
- Vercel Upstash cutover planner that validates local Upstash env references
  and prints the redacted Production env, redeploy, strict evidence,
  required-capture smoke, and Upstash evidence commands without exposing the
  REST URL or token.
- Automated market preflight checks for regulated-partner boundary language,
  consent links, launch assets, env examples, and blocked regulated-finance
  claims.
- Campaign copy linter and guardrails for checking paid ads, email campaigns,
  social posts, partner one-pagers, and alternate landing-page copy before
  counsel review.
- Counsel sign-off validator for checking the redacted legal/compliance
  approval record before final go/no-go.
- Manifest-backed campaign lint command that checks every listed paid social,
  paid search, email, partner, and alternate landing-page draft for
  approved-partner framing and prohibited regulated-finance claims.
- Post-deploy smoke checker for Vercel preview and production URLs, including
  homepage metadata, legal pages, SEO routes, assets, browser security headers,
  public security disclosure, absence of default scaffold assets, production
  site URL alignment, and safe waitlist API validation.
- Route-level waitlist API tests covering demo mode, validation, honeypot
  filtering, rate limiting, oversized requests, webhook forwarding, and webhook
  failure handling.
- Vercel Web Analytics and Speed Insights are installed and mounted.
- Product inquiry conversion events track non-PII segment, result, status, and sanitized
  campaign metadata.
- Analytics audit command for verifying mounted Vercel Analytics and Speed
  Insights, approved pilot event names, approved analytics property keys,
  sanitized campaign metadata mapping, and banned PII fields before campaign
  traffic.
- Live analytics evidence validator for checking redacted Vercel Web Analytics
  and Speed Insights proof before final go/no-go.
- Managed receiver evidence validator for checking CRM, Airtable, Slack, Make,
  Zapier, or internal webhook proof of signed replay, signature verification,
  durable storage, consent metadata, `submissionId` idempotency, sanitized
  attribution, deletion/export process documentation, and redaction before
  final go/no-go.
- Privacy Notice discloses campaign attribution fields, Vercel Web
  Analytics, Speed Insights, and the analytics boundary that excludes emails,
  names, sensitive financial details, and free-text product inquiry notes.
- `/api/waitlist` emits structured logs for request start, validation outcomes,
  webhook mode, completion, and failures.
- `/api/health` reports public-safe deployment and waitlist readiness state
  without exposing the webhook URL or signing secret.
- `/api/health` can prove paid-traffic-ready durable capture through a signed
  HTTPS webhook receiver, private Vercel Blob storage, or Vercel Marketplace
  Upstash Redis storage without exposing storage URLs or tokens. Localhost HTTP
  is allowed only for non-production receiver proofs.
- Signed webhook receiver utility for validating HMAC headers and writing leads
  to ignored local NDJSON/CSV files when a lightweight receiver is needed.
- Waitlist webhook payloads include a `submissionId`, consent text, consent
  timestamp, Privacy Notice version, and Terms version for idempotent capture
  and product onboarding auditability.
- Dedicated `Dockerfile.receiver` for running the signed receiver on a container
  host with a persistent `/data/waitlist` volume and `GET /health` checks.
- Dedicated `compose.receiver.yml` handoff manifest that builds the receiver
  image, requires a runtime signing secret, bind-mounts an operator-owned
  persistent host data directory, adds a `/health` healthcheck, and restarts
  unless stopped.
- Docker receiver smoke command for proving the container image starts with a
  mounted `/data/waitlist` volume, reports health, accepts signed replayed
  submissions, writes summary-ready data, and supports deletion dry-run
  handling.
- Receiver data-ops command for non-PII lead summaries and email-based deletion
  requests against the lightweight receiver files, including campaign/source
  counts for paid tests.
- Receiver data audit command for redacted proof of required consent metadata,
  `submissionId` idempotency keys, CSV/NDJSON consistency, and receiver-file
  integrity hashes after production test submissions.
- Receiver backup/export command for copying lightweight receiver lead files
  and a redacted manifest into an operator-owned secure backup directory before
  campaign traffic.
- Receiver backup verification command for checking the protected export
  manifest and copied file hashes without printing lead PII or filesystem
  paths.
- Signed webhook smoke tester for proving a CRM or lightweight receiver accepts
  PayShield HMAC payloads before paid traffic is enabled.
- End-to-end lead capture dry run that starts the lightweight receiver locally,
  forces `/api/waitlist` into signed required-webhook mode, verifies persisted
  consent fields, sanitized attribution, idempotent replay, non-PII summary
  output, and deletion dry-run handling before a hosted receiver is selected.
- Conservative fintech language that ties provider-enabled services to
  approved activation and avoids deposit-insurance claims.
- Privacy Notice and Terms pages linked from the contact form and
  footer.
- Production Vercel deployment at `https://payshield-lime.vercel.app`, with the
  Vercel project connected to `forstersolutions/PayShield`, Web Analytics and
  Speed Insights enabled, and production smoke checks passing.

## Configure Before Traffic

- Choose one durable production capture path before traffic.
- For a webhook path, set `PAYSHIELD_WAITLIST_WEBHOOK_URL` to a CRM, Airtable,
  Slack, Make, Zapier, or internal webhook.
- For a webhook path, set `PAYSHIELD_WAITLIST_WEBHOOK_SECRET` so the receiving
  webhook can validate the HMAC-SHA256 signature headers before storing leads.
- For a webhook path in Vercel Production, use an HTTPS webhook URL. Localhost
  HTTP is only accepted by the app for local/non-production receiver proof.
  Keep credentials, query strings, and fragments out of the webhook URL; use a
  path-scoped provider URL plus `PAYSHIELD_WAITLIST_WEBHOOK_SECRET` for signing.
- For the preferred Vercel-native storage path, create and link a private
  Vercel Blob store, set `PAYSHIELD_WAITLIST_STORAGE=blob`, and confirm
  `BLOB_READ_WRITE_TOKEN` is configured in Vercel Production.
- For the alternate Vercel-native storage path, install Upstash Redis from
  Vercel Marketplace, set `PAYSHIELD_WAITLIST_STORAGE=upstash`, and configure
  `UPSTASH_REDIS_REST_URL` plus `UPSTASH_REDIS_REST_TOKEN` in Vercel
  Production.
- Set `PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` after the selected capture path
  is configured so valid public submissions fail closed unless durable capture
  is configured.
- Confirm the receiving webhook responds in under eight seconds.
- If no CRM receiver exists yet, deploy or tunnel `npm run webhook:receive` with
  `PAYSHIELD_WAITLIST_WEBHOOK_SECRET` set, then use that endpoint as the
  temporary webhook target.
- Run `npm run lead-capture:dry-run` locally before choosing the hosted receiver
  or CRM endpoint, and attach the non-PII command output to the readiness issue.
- If the lightweight receiver is used for production capture, run it from
  `compose.receiver.yml` or `Dockerfile.receiver` on a host with a persistent
  volume mounted at `/data/waitlist`, confirm `GET /health` returns
  `service: "payshield-waitlist-receiver"`, and include the volume backup/export
  owner in the launch evidence.
- Before enabling provider-backed account, card, or payment operations in the
  Vercel frontend, deploy the dedicated core service, set
  `PAYSHIELD_CORE_API_URL` to its HTTPS base URL, set the matching
  `PAYSHIELD_CORE_SERVICE_TOKEN` on both services if token protection is
  enabled, keep `PAYSHIELD_CORE_TIMEOUT_MS` between 1000 and 30000, and verify
  `/api/app/balances`, `/api/app/bill-payments`, `/api/card/authorize`, and
  `/api/provider/webhooks` return `x-payshield-core-proxied: true` from the web
  app.
- If `compose.receiver.yml` is used, set `PAYSHIELD_WAITLIST_WEBHOOK_SECRET`
  and `PAYSHIELD_RECEIVER_HOST_DATA_DIR` in `.env.receiver`, start it with
  `docker compose --env-file .env.receiver -f compose.receiver.yml up -d --build`,
  and confirm the host data directory is outside git with restricted access.
- Run `npm run receiver:docker:smoke` before deploying the lightweight receiver
  path and attach the redacted output to the readiness issue.
- Run `npm run receiver:compose:config` before deploying
  `compose.receiver.yml` and attach the command result or CI run to the
  readiness issue.
- After the lightweight receiver is reachable and the operator host can read
  its data directory, run
  `PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret npm run receiver:evidence -- --url https://your-webhook-url --data-dir /path/to/waitlist --backup-dir /secure/path`
  and attach the redacted JSON output to the readiness issue.
- If the lightweight receiver is used, run
  `npm run waitlist:data -- summary --data-dir /path/to/waitlist` after test
  submissions to confirm non-PII counts, run
  `npm run waitlist:data -- audit --data-dir /path/to/waitlist` to confirm
  receiver-file integrity and required metadata without printing PII, run
  `npm run waitlist:data -- backup --data-dir /path/to/waitlist --backup-dir /secure/path`
  to create a protected export with a redacted manifest, run
  `npm run waitlist:data -- verify-backup --backup-path /secure/path/waitlist-backup-...`
  to confirm the export hashes match the manifest, and use
  `npm run waitlist:data -- erase --email lead@example.com --dry-run` before
  honoring deletion requests.
- Confirm the receiver stores `consentVersion`, `privacyVersion`,
  `termsVersion`, `consentedAt`, and `consentText` for every accepted test lead.
- Replay the same signed test payload and confirm the receiver returns success
  without appending a second row for the same `submissionId`.
- Run `PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret npm run webhook:test -- https://your-webhook-url --replay`
  against the receiver and confirm the initial send and replay both return 2xx
  responses before configuring Vercel to require webhook persistence.
- If a managed CRM, Airtable, Slack, Make, Zapier, or internal webhook is used,
  copy `launch-evidence/managed-receiver-evidence-template.json` to
  `launch-evidence/receiver-evidence.json`, fill it after signed replay and
  storage review, run
  `npm run receiver:managed:check -- --file launch-evidence/receiver-evidence.json`,
  and attach the redacted output to the readiness issue.
- Run
  `PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret npm run vercel:webhook:cutover -- --site-url https://payshield-lime.vercel.app --receiver-evidence-file launch-evidence/receiver-evidence.json`
  and follow the printed redacted Vercel Production env, redeploy, strict
  launch evidence, and required-webhook smoke sequence.
- If Vercel Marketplace Upstash Redis is used, run
  `UPSTASH_REDIS_REST_URL=https://your-upstash-endpoint UPSTASH_REDIS_REST_TOKEN=server-side-rest-token npm run vercel:upstash:cutover -- --site-url https://payshield-lime.vercel.app --receiver-evidence-file launch-evidence/receiver-evidence.json --apply-env`
  and apply or follow the printed redacted Vercel Production env, redeploy,
  strict launch evidence, required-capture smoke, and Upstash evidence sequence.
- If Vercel Blob is used, create and link a private store, set
  `PAYSHIELD_WAITLIST_STORAGE=blob` and
  `PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true`, redeploy Production, then run the
  required-capture smoke and Blob evidence sequence.
- After Upstash capture is configured in Vercel Production and the
  required-capture smoke passes, run
  `UPSTASH_REDIS_REST_URL=https://your-upstash-endpoint UPSTASH_REDIS_REST_TOKEN=server-side-rest-token npm run receiver:upstash:evidence -- https://payshield-lime.vercel.app --site-url https://payshield-lime.vercel.app --reviewer "Launch operator" --storage-owner "Revenue operations" --deletion-process-documented --export-process-documented --output launch-evidence/receiver-evidence.json`,
  then run
  `npm run receiver:upstash:check -- --file launch-evidence/receiver-evidence.json`
  and attach the redacted output. The command verifies the live Upstash record,
  consent metadata, sanitized attribution, `submissionId`, and email-hash index
  without printing the smoke lead email, REST URL, or token.
- After Blob capture is configured in Vercel Production and the
  required-capture smoke passes, run
  `BLOB_READ_WRITE_TOKEN=server-side-blob-token npm run receiver:blob:evidence -- https://payshield-lime.vercel.app --site-url https://payshield-lime.vercel.app --reviewer "Launch operator" --storage-owner "Revenue operations" --deletion-process-documented --export-process-documented --output launch-evidence/receiver-evidence.json`,
  then run
  `npm run receiver:blob:check -- --file launch-evidence/receiver-evidence.json`
  and attach the redacted output. The command verifies the live private Blob
  object, consent metadata, sanitized attribution, and `submissionId` without
  printing the smoke lead email, note, or Blob read-write token.
- Run `npm run vercel:env:audit` and confirm Vercel Production has
  `NEXT_PUBLIC_SITE_URL`, `PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK`, and either the
  webhook env vars, Blob env vars, or Upstash env vars before paid traffic.
- Run `npm run launch:evidence -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app`
  and attach the redacted JSON output to the readiness issue. After production
  durable capture is configured, rerun the command with `--strict`.
- Run
  `npm run market:go-no-go -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app --receiver-evidence-file receiver-evidence.json --counsel-signoff-file counsel-signoff.json --analytics-evidence-file analytics-evidence.json`
  before marking the paid-traffic issue ready. Use `--allow-not-ready` while
  gathering evidence so the command prints the current missing gates without
  exiting nonzero.
- Run
  `npm run market:status -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app --receiver-evidence-file launch-evidence/receiver-evidence.json --counsel-signoff-file launch-evidence/counsel-signoff.json --analytics-evidence-file launch-evidence/analytics-evidence.json`
  after each launch commit or evidence update and attach the redacted snapshot
  to the readiness issue.
- Confirm `https://payshield-lime.vercel.app/api/health` reports
  either `waitlist.webhookSigningConfigured: true` for webhook capture or
  `waitlist.storageConfigured: true` for Blob or Upstash capture, and
  `waitlist.paidTrafficReady: true` after the selected durable capture path and
  fail-closed flag are configured.
- Run `npm run readiness:paid-traffic -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app`
  and confirm it passes without `--allow-demo-capture`.
- Run `npm run smoke:deploy -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app --submit-test --require-webhook`
  and confirm it returns webhook mode before paid traffic.
- Enable Vercel Web Analytics and Speed Insights in the Vercel dashboard.
- Run `npm run analytics:audit` and attach the redacted output before campaign
  traffic.
- Confirm custom events appear for product inquiry attempt, submission, and
  failure after the first production or preview deployment.
- Submit at least one test URL with `utm_source`, `utm_medium`, and
  `utm_campaign`, then confirm analytics and the receiver show only sanitized
  campaign fields, not raw query strings or free-text notes.
- Fill `launch-evidence/analytics-evidence.json` after the live
  campaign-attributed production test, then run
  `npm run analytics:evidence:check -- --file launch-evidence/analytics-evidence.json --site-url https://payshield-lime.vercel.app`
  and attach the redacted output before final go/no-go.
- Confirm the Privacy Notice still discloses campaign attribution, analytics,
  performance metadata, and the analytics PII boundary before campaign traffic.
- Confirm privacy policy and terms links before collecting personal data beyond
  pilot emails and optional notes.
- Run `npm run campaign:lint -- path/to/campaign-copy.md` for every paid ad,
  email, social, partner, or alternate landing-page copy draft and attach the
  output to the readiness issue before counsel review.
- Run `npm run campaign:lint:all` against `docs/campaigns/manifest.json` and
  attach the redacted manifest output so every listed campaign draft is covered
  before counsel review.
- Run `npm run legal:lint` and attach the output with
  `docs/legal-review-packet.md` before counsel review.
- Fill `launch-evidence/counsel-signoff.json` only after counsel approves the
  current Privacy Notice, Terms, public claims, and campaign copy, then run
  `npm run counsel:signoff:check -- --file launch-evidence/counsel-signoff.json`
  and attach the redacted output before final go/no-go.
- Open a Paid Traffic Readiness issue and attach evidence for the webhook test,
  production health response, CI run, Vercel deployment, analytics, and legal
  review before spending on acquisition.

## Go/No-Go Evidence Files

Create the local handoff packet outside tracked source:

```bash
npm run market:evidence:init -- \
  --dir launch-evidence \
  --site-url https://payshield-lime.vercel.app \
  --receiver-url https://your-webhook-url \
  --data-dir /path/to/waitlist \
  --backup-dir /secure/path
```

`launch-evidence/` is ignored by git. The command creates
`counsel-signoff.json`, `analytics-evidence.json`,
`managed-receiver-evidence-template.json`,
`upstash-receiver-evidence-template.json`,
`blob-receiver-evidence-template.json`, and `commands.md` with the exact
redacted receiver, env audit, required-capture smoke, strict launch, final
go/no-go, and status snapshot commands.

`npm run market:go-no-go` reads `launch-evidence/receiver-evidence.json`.
For the lightweight file receiver, write the JSON output from
`npm run receiver:evidence` to that path. For a managed CRM or internal webhook,
copy `managed-receiver-evidence-template.json` to that path, fill the redacted
storage and replay review fields, and run `npm run receiver:managed:check`.
For Vercel Marketplace Upstash Redis, copy
`upstash-receiver-evidence-template.json` to that path, fill the redacted health,
production submit, storage, export, and deletion review fields, and run
`npm run receiver:upstash:check`.
For Vercel Blob, copy `blob-receiver-evidence-template.json` to that path, fill
the redacted health, production submit, private object, export, and deletion
review fields, and run `npm run receiver:blob:check`.
Production receiver evidence URLs must use HTTPS and must not include
credentials, query strings, or fragments. Localhost HTTP is accepted only for
local proof packets, not final paid-traffic go/no-go evidence.
Keep the evidence file outside git, then attach only the redacted command output
to the readiness issue after the go/no-go command passes.

Use this counsel sign-off shape after review:

```json
{
  "ok": true,
  "reviewedAt": "2026-06-05T00:00:00.000Z",
  "reviewer": "Counsel or authorized reviewer",
  "scope": ["privacy", "terms", "publicClaims", "campaignCopy"],
  "campaignCopyLintOk": true
}
```

Use this live analytics evidence shape after a production campaign-attributed
test:

```json
{
  "ok": true,
  "observedAt": "2026-06-05T00:00:00.000Z",
  "productionUrl": "https://payshield-lime.vercel.app",
  "source": "Vercel Web Analytics and Speed Insights dashboard",
  "observedEventNames": [
    "Pilot Request Attempted",
    "Pilot Request Submitted"
  ],
  "observedCampaignProperties": [
    "campaignMedium",
    "campaignName",
    "campaignSource",
    "hasCampaignAttribution"
  ],
  "webAnalyticsPilotConversions": true,
  "sanitizedCampaignMetadata": true,
  "speedInsightsProductionData": true
}
```

These evidence files must not include lead emails, names, notes, webhook
secrets, authorization headers, URL credentials, query tokens, or fragments.
The go/no-go command fails if it detects those values.

## Do Not Claim Yet

- Banking services provided by a named sponsor bank.
- FDIC insurance, pass-through insurance, or insured account coverage.
- Live direct deposit, ACH, debit card, virtual card, or bill-pay functionality.
- Consumer deposit account opening, KYC approval, or regulated transfer activity.

## Required Before Live Funds

- Sponsor bank or banking-as-a-service program agreement.
- KYC, AML, fraud monitoring, sanctions screening, and adverse-action handling
  where applicable.
- Double-entry ledger with immutable audit trail, reconciliation, reversals,
  error states, and settlement reporting.
- Applied Postgres ledger schema verified with
  `npm run core:migrations:verify`; set
  `PAYSHIELD_LEDGER_SCHEMA_VERIFIED=true` and
  `PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION=0003` only from that successful
  verification output.
- ACH authorization flow, Reg E/error-resolution workflow, dispute operations,
  fee disclosures, privacy policy, and customer support procedures.
- Card issuing and authorization controls before the safe-spending card is
  activated through a provider.
- Approved compliance review of all website, app, fee, and provider-program copy.

## Suggested Pilot Funnel

1. Deploy from GitHub to Vercel.
2. Configure the waitlist webhook and analytics.
3. Drive small traffic to families, hourly workers, gig workers, employers, and
   provider/BaaS contacts.
4. Measure the Safe to Spend message, target segment, custom bucket rules,
   priority ordering, support requests, and willingness to pay.
5. Use pilot data to choose the first regulated infrastructure path.
