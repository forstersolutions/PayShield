# PayShield

PayShield is a Vercel-hosted Next.js app for a closed-beta paycheck protection
product. The current repo now contains the app-first dashboard, Clerk-ready auth
boundary, regulated core backend scaffold, Postgres ledger migration, provider
adapter contract, and fail-closed live-money gates for the full neobank build.

The public app does not open accounts, hold funds, issue cards, route payments,
or claim insured coverage until a BaaS/card partner, sponsor-bank disclosures,
counsel approval, operational runbooks, Clerk auth, the dedicated core backend,
and the Postgres ledger are configured.

## Getting Started

Use Node.js 22.x.

Install dependencies and run the local development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

Production is deployed on Vercel at
[https://payshield-lime.vercel.app](https://payshield-lime.vercel.app).

## Scripts

```bash
npm run dev
npm run core:server
npm run core:compose:config
npm run verify
npm run analytics:audit
npm run campaign:lint -- path/to/campaign-copy.md
npm run counsel:signoff:check -- --file launch-evidence/counsel-signoff.json
npm run legal:lint
npm run launch:evidence -- https://your-domain.com --expect-site-url https://your-domain.com
npm run lead-capture:dry-run
npm test
npm run market-preflight
npm run market:status -- https://your-domain.com --expect-site-url https://your-domain.com
npm run receiver:compose:config
npm run receiver:docker:build
npm run receiver:docker:smoke
npm run receiver:evidence -- --url https://your-webhook-url --data-dir /path/to/waitlist --backup-dir /secure/path
npm run receiver:managed:check -- --file launch-evidence/receiver-evidence.json
npm run receiver:blob:evidence -- https://payshield-lime.vercel.app --site-url https://payshield-lime.vercel.app --output launch-evidence/receiver-evidence.json
npm run receiver:blob:check -- --file launch-evidence/receiver-evidence.json
npm run receiver:upstash:check -- --file launch-evidence/receiver-evidence.json
npm run readiness:paid-traffic -- https://your-domain.com --expect-site-url https://your-domain.com
npm run readiness:paid-traffic -- https://your-domain.com --expect-site-url https://your-domain.com --allow-demo-capture
npm run smoke:deploy -- https://your-domain.com
npm run smoke:deploy -- https://your-domain.com --expect-site-url https://your-domain.com
npm run vercel:upstash:cutover -- --site-url https://your-domain.com
npm run vercel:webhook:cutover -- --site-url https://your-domain.com --receiver-evidence-file launch-evidence/receiver-evidence.json
npm run waitlist:data -- summary
npm run waitlist:data -- audit
npm run waitlist:data -- backup
npm run waitlist:data -- verify-backup --backup-path /secure/path/waitlist-backup-...
npm run waitlist:data -- erase --email lead@example.com --dry-run
npm run vercel:env:audit
npm run webhook:receive
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret npm run webhook:test -- https://your-webhook-url --replay
npm run build
npm run start
npm run lint
npm run typecheck
```

## Regulated Core

The frontend remains on Vercel. Regulated ledger, provider webhook, card
authorization, reconciliation, and future money-movement operations belong in
the dedicated core service:

```bash
npm run core:server
docker compose --env-file .env.example -f compose.core.yml up --build
```

`services/core/migrations/0001_neobank_core.sql` defines the first Postgres
ledger schema: households, app users, provider customers, ledger accounts,
journal entries, journal lines, payees, provider events, and reconciliation
exceptions.

The app exposes the planned API surface now:

```text
GET  /api/app/me
GET  /api/app/balances
POST /api/app/onboarding/start
POST /api/app/buckets
POST /api/app/payees
POST /api/app/unlocks
POST /api/provider/webhooks
POST /api/card/authorize
```

Without complete live-money gates, onboarding returns a blocked response and
card authorization runs only in simulation mode against the PayShield ledger.

## Continuous Integration

`npm run verify` runs linting, TypeScript checks, waitlist API tests, analytics
instrumentation audit, market copy/asset preflight checks, a production build,
and a production dependency audit. GitHub Actions runs the same preflight on
pushes to `main` and pull requests, then runs `npm run receiver:docker:smoke` to
build `Dockerfile.receiver`, start it with a mounted data volume, verify health,
signed replay capture, non-PII summary/audit output, and deletion dry-run
handling, including backup manifest hash verification.
CI also runs `npm run receiver:compose:config` to validate the production
receiver compose handoff manifest with a dummy secret and host data directory.
Vercel's Git integration will still create preview and production deployments;
the workflow is a source-level quality gate before deployment.

Dependabot is configured for weekly npm and GitHub Actions update pull requests,
grouped by runtime, Vercel observability, lint/type tooling, and workflow
maintenance. During launch, npm semver-major updates are ignored so patch/minor
maintenance can keep moving without pulling unplanned framework or tooling
migrations into the release path. GitHub Dependabot security updates, secret
scanning, push protection, and private vulnerability reporting are enabled for
the repository.

## Vercel

The app is structured for Vercel's Git integration. Connect the GitHub
repository `forstersolutions/PayShield`, keep the framework preset as Next.js,
and use the default build command:

```bash
npm run build
```

The planner works without environment variables. For production contact capture,
configure one durable capture path with these Vercel variables:

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# Webhook/CRM capture path:
PAYSHIELD_WAITLIST_WEBHOOK_URL=https://your-webhook-url
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook

# Vercel-native Blob capture path:
PAYSHIELD_WAITLIST_STORAGE=blob
BLOB_READ_WRITE_TOKEN=server-side-blob-token

# Vercel-native Upstash capture path:
PAYSHIELD_WAITLIST_STORAGE=upstash
UPSTASH_REDIS_REST_URL=https://your-upstash-endpoint
UPSTASH_REDIS_REST_TOKEN=server-side-rest-token

# Set after one capture path is configured:
PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true
```

`/api/waitlist` is retained as a backwards-compatible product-inquiry endpoint.
It validates contact requests, applies bounded in-memory rate
limiting and request-size guardrails, filters a honeypot field, and forwards
submissions to `PAYSHIELD_WAITLIST_WEBHOOK_URL` when configured. If
`PAYSHIELD_WAITLIST_STORAGE=blob` is set, it stores one private JSON object per
validated submission in Vercel Blob. If `PAYSHIELD_WAITLIST_STORAGE=upstash` is
set, it stores validated submissions in Vercel Marketplace Upstash Redis
instead. Without webhook, Blob, or Upstash capture, the endpoint returns a
local-capture response for development; do not use contact capture for paid
acquisition until durable storage is configured and required.
The form also captures allowlisted campaign attribution from `utm_source`,
`utm_medium`, `utm_campaign`, `utm_content`, and `utm_term`, plus the landing
path without query parameters. The API re-sanitizes those fields before sending
an optional `attribution` object to the webhook; raw query strings, emails,
URLs, and long account-like numbers are not forwarded.
Webhook payloads include audit fields for the accepted product-onboarding
contact-consent text,
Privacy Notice version, Terms version, and consent timestamp so production
receivers can retain proof of product onboarding consent. Each accepted request also
gets a `submissionId` UUID so receivers can treat signed replays as idempotent
and avoid duplicate lead rows.
If `PAYSHIELD_WAITLIST_WEBHOOK_SECRET` is set, PayShield signs the exact JSON
body with HMAC-SHA256 and sends `x-payshield-webhook-signature` plus
`x-payshield-webhook-timestamp`. The raw secret is not forwarded. Webhook
delivery times out after eight seconds so slow downstream tools do not hold the
request open indefinitely.
Set `PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` before paid traffic so valid
submissions fail closed instead of appearing successful without durable lead
capture. For the preferred Vercel-native path, create a private Vercel Blob
store, set `PAYSHIELD_WAITLIST_STORAGE=blob`, and confirm Vercel has injected
`BLOB_READ_WRITE_TOKEN` as an encrypted server-side Production env var.
For the alternate Vercel-native path, install Upstash Redis from Vercel
Marketplace, set `PAYSHIELD_WAITLIST_STORAGE=upstash`, and configure
`UPSTASH_REDIS_REST_URL` plus `UPSTASH_REDIS_REST_TOKEN` as encrypted
Production env vars.
Use the Upstash cutover planner to print the redacted Vercel env, redeploy,
strict evidence, smoke, and Upstash evidence commands without exposing the
Upstash values:

```bash
UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
  npm run vercel:upstash:cutover -- --site-url https://your-domain.com
```

`npm run readiness:paid-traffic -- https://your-domain.com --expect-site-url https://your-domain.com`
audits the public launch surface and fails unless `/api/health` proves
paid-traffic-ready durable lead capture. Add `--allow-demo-capture` only for
non-production evidence runs where demo capture should be reported as a warning.

`npm run vercel:env:audit` checks Vercel Production for the site URL, webhook
URL, webhook signing secret, and fail-closed flag without printing encrypted
values. Use `npx vercel env ls | npm run vercel:env:audit -- --stdin --allow-demo-capture`
only for non-production evidence runs before durable capture variables exist.

`npm run launch:evidence -- https://your-domain.com --expect-site-url https://your-domain.com`
prints a redacted JSON packet for the readiness issue. It combines production
health, public paid-traffic readiness checks, analytics instrumentation audit,
Vercel env audit status, and the local lead-capture dry run. Default mode is
launch-surface evidence mode; add `--strict` after the webhook env variables are
configured to fail unless production health and Vercel env prove
paid-traffic-ready capture.

`npm run market:status -- https://your-domain.com --expect-site-url https://your-domain.com`
prints a redacted production status snapshot for the readiness issue. It
combines production health, local git commit, latest GitHub CI run, Vercel
deployment readiness, launch evidence, and go/no-go remaining gates so every
launch commit can be audited without manually stitching outputs together.

`npm run counsel:signoff:check -- --file launch-evidence/counsel-signoff.json`
validates the redacted counsel sign-off record before final go/no-go. It
requires approval status, reviewed date, reviewer label, privacy/terms/public
claims/campaign-copy scope, campaign copy lint confirmation, and no sensitive
values in the evidence file.

`npm run lead-capture:dry-run` starts the lightweight receiver on localhost,
forces `/api/waitlist` into signed required-webhook mode, submits one product
request through the real route handler, verifies persisted consent and
sanitized attribution fields, verifies idempotent replay, prints a non-PII
summary plus receiver-file audit, creates and verifies a redacted backup
manifest, and dry-runs an email erasure. Run it before selecting the hosted
receiver or CRM endpoint so the repo-owned capture path is known-good.

`npm run webhook:receive` starts a small signed webhook receiver for teams that
want a lightweight persistence target before wiring a CRM. It verifies the
PayShield HMAC headers and appends accepted leads to ignored local
`data/waitlist/waitlist.ndjson` and `data/waitlist/waitlist.csv` files. Replayed
submissions with the same `submissionId` return success without appending a
duplicate NDJSON or CSV row.
The receiver also exposes `GET /health` with a public-safe health response for
platform health checks.

For a container host with a persistent volume:

```bash
npm run receiver:docker:smoke
npm run receiver:compose:config
cp .env.receiver.example .env.receiver
mkdir -p /srv/payshield/waitlist /srv/payshield/waitlist-backups
# Set PAYSHIELD_WAITLIST_WEBHOOK_SECRET in .env.receiver before starting.
docker compose --env-file .env.receiver -f compose.receiver.yml up -d --build
curl http://localhost:8787/health
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook npm run webhook:test -- http://localhost:8787/payshield-waitlist --replay
```

`npm run receiver:docker:smoke` builds `Dockerfile.receiver`, runs the image with
a temporary host-mounted `/data/waitlist` volume, checks `/health`, sends a
signed replay smoke payload, verifies non-PII data summary/audit output, and
dry-runs email deletion handling, including backup manifest hash verification.
GitHub Actions runs this smoke check on each launch commit so the lightweight
receiver fallback is more than build-only.
`compose.receiver.yml` is the production handoff manifest for that fallback:
it uses the same image, requires a runtime webhook signing secret, mounts
`PAYSHIELD_RECEIVER_HOST_DATA_DIR` into `/data/waitlist`, adds a container
healthcheck, and restarts unless stopped.

After the lightweight receiver is reachable and the operator host can read its
data directory, run the receiver evidence command:

```bash
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook \
  npm run receiver:evidence -- \
  --url https://your-webhook-url \
  --data-dir /path/to/waitlist \
  --backup-dir /secure/path
```

The command verifies `/health`, sends a signed test payload and signed replay,
checks non-PII summary counts, audits receiver files, creates and verifies a
protected backup, and dry-runs deletion of the test lead without printing lead
PII or the signing secret.

If production capture uses a managed CRM, Airtable, Slack, Make, Zapier, or
internal webhook instead of the lightweight file receiver, copy
`launch-evidence/managed-receiver-evidence-template.json` to
`launch-evidence/receiver-evidence.json`, fill it after signed replay and
storage review, then run
`npm run receiver:managed:check -- --file launch-evidence/receiver-evidence.json`.
The validator checks signed replay acceptance, signature verification, durable
storage, consent metadata, `submissionId` idempotency, sanitized attribution,
deletion/export process documentation, and redaction before final go/no-go.

If production capture uses Vercel Marketplace Upstash Redis, copy
`launch-evidence/upstash-receiver-evidence-template.json` to
`launch-evidence/receiver-evidence.json`, fill it after `/api/health`,
production submit, storage, export, and deletion review, then run
`npm run receiver:upstash:check -- --file launch-evidence/receiver-evidence.json`.

If production capture uses Vercel Blob, copy
`launch-evidence/blob-receiver-evidence-template.json` to
`launch-evidence/receiver-evidence.json`, fill it after `/api/health`,
production submit, private Blob object, export, and deletion review, then run
`npm run receiver:blob:check -- --file launch-evidence/receiver-evidence.json`.
After Production is configured and redeployed, generate redacted proof directly
from the live site and private store:

```bash
BLOB_READ_WRITE_TOKEN=server-side-blob-token \
  npm run receiver:blob:evidence -- \
  https://payshield-lime.vercel.app \
  --site-url https://payshield-lime.vercel.app \
  --reviewer "Launch operator" \
  --storage-owner "Revenue operations" \
  --deletion-process-documented \
  --export-process-documented \
  --output launch-evidence/receiver-evidence.json

npm run receiver:blob:check -- --file launch-evidence/receiver-evidence.json
```

`npm run webhook:test -- https://your-webhook-url --replay` sends one signed
sample payload to any receiver using `PAYSHIELD_WAITLIST_WEBHOOK_SECRET`, then
sends the same signed payload again so idempotent replay handling can be
verified before Vercel is switched into required-webhook mode. Its CLI output
prints an email hash and redacted receiver responses, not the test email, name,
note, signing secret, or raw receiver message fields.

If the lightweight receiver is used, `npm run waitlist:data -- summary` prints
non-PII totals, segment counts, and campaign/source counts from the local
receiver files. `npm run waitlist:data -- audit` checks required consent
metadata, `submissionId` idempotency keys, CSV/NDJSON consistency, and file
integrity hashes without printing emails, names, notes, or paths.
`npm run waitlist:data -- backup --backup-dir /secure/path` copies
`waitlist.ndjson`, `waitlist.csv`, and a redacted manifest into a timestamped
backup directory. The copied files contain lead data, so keep the backup path
outside git and restrict access. After each protected export, run
`npm run waitlist:data -- verify-backup --backup-path /secure/path/waitlist-backup-...`
to confirm the copied file hashes still match the redacted manifest. To honor a
pilot deletion request, first run:

```bash
npm run waitlist:data -- erase --email lead@example.com --dry-run
```

Then rerun without `--dry-run` to remove matching records from
`waitlist.ndjson` and regenerate `waitlist.csv`.

`/api/health` exposes public-safe deployment and waitlist readiness state. It
does not expose the webhook URL or signing secret, and it reports whether the
site is still in demo capture mode or paid-traffic-ready webhook mode.

The contact form requires consent to the PayShield Privacy Notice and Terms
before submission.

Vercel Web Analytics and Speed Insights are wired in `src/app/layout.tsx`. Enable
both products in the Vercel project dashboard after import. Product inquiry conversion
events track segment, result, status, and sanitized campaign metadata only; they
do not send email, name, raw query strings, or free-text notes to analytics.
`npm run analytics:audit` checks the mounted analytics components, approved
product-inquiry event names, approved analytics property keys, campaign metadata mapping,
and banned PII fields.

## Launch Notes

- The current app is a closed-beta neobank foundation. It does not move money,
  hold funds, open accounts, issue cards, or provide insured coverage.
- Live funds require a banking sponsor, BaaS/card program partner, KYC/AML workflow,
  payment/card rails, dispute handling, disclosures, support operations, and
  double-entry ledgering.
- Do not claim PayShield is a bank.
- Do not claim FDIC insurance until the final sponsor bank and recordkeeping
  model supports precise, approved language.
- Enable Vercel Web Analytics and Speed Insights before paid traffic so segment,
  conversion, and performance can be measured from the first launch push.
- Have counsel review the Privacy Notice, Terms, and legal review
  packet before broad public acquisition or regulated financial-service launch.

See [docs/market-readiness.md](docs/market-readiness.md) for the current launch
checklist and regulated-money gates. See [docs/campaign-copy.md](docs/campaign-copy.md)
for paid campaign and ad-copy guardrails, and
[docs/legal-review-packet.md](docs/legal-review-packet.md) for counsel handoff
questions. See [docs/vercel-launch.md](docs/vercel-launch.md) for the Vercel import,
environment, webhook, and post-deploy smoke-test runbook. The deploy smoke
checker validates required pages, launch assets, safe waitlist API validation,
browser security headers, public `security.txt`, absence of default scaffold
assets, Privacy Notice attribution and analytics disclosures, and, when
`--expect-site-url` is provided, production canonical, sitemap, robots,
security, and social image URLs.
See [SECURITY.md](SECURITY.md) for vulnerability reporting and production
security baseline notes.

## Source Assets

`public/images/payshield-social-card.jpg` is the lightweight social preview
fallback for Open Graph and Twitter crawlers. `src/app/icon.svg` is the branded
PayShield icon used by metadata and the web app manifest. The homepage product
surface is the live planner rather than a static mockup.
