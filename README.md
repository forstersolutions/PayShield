# PayShield

PayShield is a Vercel-hosted Next.js prototype for a protected paycheck product:
future direct deposits would fund required buckets first, and the debit card
would only access safe-to-spend money.

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
npm run verify
npm run analytics:audit
npm run campaign:lint -- path/to/campaign-copy.md
npm run legal:lint
npm run launch:evidence -- https://your-domain.com --expect-site-url https://your-domain.com
npm run lead-capture:dry-run
npm test
npm run market-preflight
npm run receiver:docker:build
npm run receiver:docker:smoke
npm run readiness:paid-traffic -- https://your-domain.com --expect-site-url https://your-domain.com
npm run readiness:paid-traffic -- https://your-domain.com --expect-site-url https://your-domain.com --allow-prototype
npm run smoke:deploy -- https://your-domain.com
npm run smoke:deploy -- https://your-domain.com --expect-site-url https://your-domain.com
npm run waitlist:data -- summary
npm run waitlist:data -- audit
npm run waitlist:data -- backup
npm run waitlist:data -- erase --email lead@example.com --dry-run
npm run vercel:env:audit
npm run webhook:receive
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret npm run webhook:test -- https://your-webhook-url --replay
npm run build
npm run start
npm run lint
npm run typecheck
```

## Continuous Integration

`npm run verify` runs linting, TypeScript checks, waitlist API tests, analytics
instrumentation audit, market copy/asset preflight checks, a production build,
and a production dependency audit. GitHub Actions runs the same preflight on
pushes to `main` and pull requests, then runs `npm run receiver:docker:smoke` to
build `Dockerfile.receiver`, start it with a mounted data volume, verify health,
signed replay capture, non-PII summary/audit output, and deletion dry-run
handling.
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

The prototype works without environment variables. For production capture,
configure these optional Vercel variables:

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.com
PAYSHIELD_WAITLIST_WEBHOOK_URL=https://your-webhook-url
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook
PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true
```

`/api/waitlist` validates pilot requests, applies bounded in-memory rate
limiting and request-size guardrails, filters a honeypot field, and forwards
submissions to `PAYSHIELD_WAITLIST_WEBHOOK_URL` when configured. Without the
webhook, the form returns a demo-mode success so the Vercel preview can still be
used in investor and partner conversations.
The form also captures allowlisted campaign attribution from `utm_source`,
`utm_medium`, `utm_campaign`, `utm_content`, and `utm_term`, plus the landing
path without query parameters. The API re-sanitizes those fields before sending
an optional `attribution` object to the webhook; raw query strings, emails,
URLs, and long account-like numbers are not forwarded.
Webhook payloads include audit fields for the accepted contact-consent text,
Privacy Notice version, Terms version, and consent timestamp so production
receivers can retain proof of pilot outreach consent. Each accepted request also
gets a `submissionId` UUID so receivers can treat signed replays as idempotent
and avoid duplicate lead rows.
If `PAYSHIELD_WAITLIST_WEBHOOK_SECRET` is set, PayShield signs the exact JSON
body with HMAC-SHA256 and sends `x-payshield-webhook-signature` plus
`x-payshield-webhook-timestamp`. The raw secret is not forwarded. Webhook
delivery times out after eight seconds so slow downstream tools do not hold the
request open indefinitely.
Set `PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` before paid traffic so valid
submissions fail closed instead of appearing successful without durable lead
capture.

`npm run readiness:paid-traffic -- https://your-domain.com --expect-site-url https://your-domain.com`
audits the public launch surface and fails unless `/api/health` proves
paid-traffic-ready webhook capture. Add `--allow-prototype` to document the
current prototype state while keeping demo capture as a warning.

`npm run vercel:env:audit` checks Vercel Production for the site URL, webhook
URL, webhook signing secret, and fail-closed flag without printing encrypted
values. Use `npx vercel env ls | npm run vercel:env:audit -- --stdin --allow-prototype`
to document the current prototype state before the webhook variables exist.

`npm run launch:evidence -- https://your-domain.com --expect-site-url https://your-domain.com`
prints a redacted JSON packet for the readiness issue. It combines production
health, public paid-traffic readiness checks, analytics instrumentation audit,
Vercel env audit status, and the local lead-capture dry run. Default mode is
prototype evidence mode; add `--strict` after the webhook env variables are
configured to fail unless production health and Vercel env prove
paid-traffic-ready capture.

`npm run lead-capture:dry-run` starts the lightweight receiver on localhost,
forces `/api/waitlist` into signed required-webhook mode, submits one pilot
request through the real route handler, verifies persisted consent and
sanitized attribution fields, verifies idempotent replay, prints a non-PII
summary plus receiver-file audit, and dry-runs an email erasure. Run it before
selecting the hosted receiver or CRM endpoint so the repo-owned capture path is
known-good.

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
docker build -f Dockerfile.receiver -t payshield-waitlist-receiver .
docker run --rm \
  -p 8787:8787 \
  -e PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook \
  -v "$PWD/data/waitlist:/data/waitlist" \
  payshield-waitlist-receiver
curl http://localhost:8787/health
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook npm run webhook:test -- http://localhost:8787/payshield-waitlist --replay
```

`npm run receiver:docker:smoke` builds `Dockerfile.receiver`, runs the image with
a temporary host-mounted `/data/waitlist` volume, checks `/health`, sends a
signed replay smoke payload, verifies non-PII data summary/audit output, and
dry-runs email deletion handling. GitHub Actions runs this smoke check on each
launch commit so the lightweight receiver fallback is more than build-only.

`npm run webhook:test -- https://your-webhook-url --replay` sends one signed
sample payload to any receiver using `PAYSHIELD_WAITLIST_WEBHOOK_SECRET`, then
sends the same signed payload again so idempotent replay handling can be
verified before Vercel is switched into required-webhook mode.

If the lightweight receiver is used, `npm run waitlist:data -- summary` prints
non-PII totals, segment counts, and campaign/source counts from the local
receiver files. `npm run waitlist:data -- audit` checks required consent
metadata, `submissionId` idempotency keys, CSV/NDJSON consistency, and file
integrity hashes without printing emails, names, notes, or paths.
`npm run waitlist:data -- backup --backup-dir /secure/path` copies
`waitlist.ndjson`, `waitlist.csv`, and a redacted manifest into a timestamped
backup directory. The copied files contain lead data, so keep the backup path
outside git and restrict access. To honor a pilot deletion request, first run:

```bash
npm run waitlist:data -- erase --email lead@example.com --dry-run
```

Then rerun without `--dry-run` to remove matching records from
`waitlist.ndjson` and regenerate `waitlist.csv`.

`/api/health` exposes public-safe deployment and waitlist readiness state. It
does not expose the webhook URL or signing secret, and it reports whether the
site is still in demo capture mode or paid-traffic-ready webhook mode.

The pilot form requires consent to the prototype Privacy Notice and Terms before
submission.

Vercel Web Analytics and Speed Insights are wired in `src/app/layout.tsx`. Enable
both products in the Vercel project dashboard after import. Pilot conversion
events track segment, result, status, and sanitized campaign metadata only; they
do not send email, name, raw query strings, or free-text notes to analytics.
`npm run analytics:audit` checks the mounted analytics components, approved
pilot event names, approved analytics property keys, campaign metadata mapping,
and banned PII fields.

## Launch Notes

- The current app is a public-facing market prototype and product demo.
- Live funds require a banking sponsor, BaaS/program partner, KYC/AML workflow,
  ACH/card rails, dispute handling, disclosures, and double-entry ledgering.
- Do not claim PayShield is a bank.
- Do not claim FDIC insurance until the final sponsor bank and recordkeeping
  model supports precise, approved language.
- Enable Vercel Web Analytics and Speed Insights before paid traffic so segment,
  conversion, and performance can be measured from the first launch push.
- Have counsel review the prototype Privacy Notice, Terms, and legal review
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

## Source Asset

The product mockup in `public/images/payshield-product-mockup.avif` was
generated for this project, optimized for web delivery, and intentionally avoids
readable third-party financial branding. `public/images/payshield-social-card.jpg`
is a lightweight social preview fallback for Open Graph and Twitter crawlers.
`src/app/icon.svg` is the branded PayShield icon used by metadata and the web
app manifest.
