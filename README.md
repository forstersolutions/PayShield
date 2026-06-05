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
npm test
npm run market-preflight
npm run receiver:docker:build
npm run readiness:paid-traffic -- https://your-domain.com --expect-site-url https://your-domain.com
npm run readiness:paid-traffic -- https://your-domain.com --expect-site-url https://your-domain.com --allow-prototype
npm run smoke:deploy -- https://your-domain.com
npm run smoke:deploy -- https://your-domain.com --expect-site-url https://your-domain.com
npm run waitlist:data -- summary
npm run waitlist:data -- erase --email lead@example.com --dry-run
npm run webhook:receive
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret npm run webhook:test -- https://your-webhook-url
npm run build
npm run start
npm run lint
npm run typecheck
```

## Continuous Integration

`npm run verify` runs linting, TypeScript checks, waitlist API tests, market
copy/asset preflight checks, a production build, and a production dependency
audit. GitHub Actions runs the same preflight on pushes to `main` and pull
requests, then builds `Dockerfile.receiver` with
`npm run receiver:docker:build`. Vercel's Git integration will still create
preview and production deployments; the workflow is a source-level quality gate
before deployment.

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

`npm run webhook:receive` starts a small signed webhook receiver for teams that
want a lightweight persistence target before wiring a CRM. It verifies the
PayShield HMAC headers and appends accepted leads to ignored local
`data/waitlist/waitlist.ndjson` and `data/waitlist/waitlist.csv` files.
The receiver also exposes `GET /health` with a public-safe health response for
platform health checks.

For a container host with a persistent volume:

```bash
docker build -f Dockerfile.receiver -t payshield-waitlist-receiver .
docker run --rm \
  -p 8787:8787 \
  -e PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook \
  -v "$PWD/data/waitlist:/data/waitlist" \
  payshield-waitlist-receiver
curl http://localhost:8787/health
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook npm run webhook:test -- http://localhost:8787/payshield-waitlist
```

`npm run webhook:test -- https://your-webhook-url` sends one signed sample
payload to any receiver using `PAYSHIELD_WAITLIST_WEBHOOK_SECRET`, so the
endpoint can be verified before Vercel is switched into required-webhook mode.

If the lightweight receiver is used, `npm run waitlist:data -- summary` prints
non-PII totals and segment counts from the local receiver files. To honor a
pilot deletion request, first run:

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
events track segment, result, and status metadata only; they do not send email,
name, or free-text notes to analytics.

## Launch Notes

- The current app is a public-facing market prototype and product demo.
- Live funds require a banking sponsor, BaaS/program partner, KYC/AML workflow,
  ACH/card rails, dispute handling, disclosures, and double-entry ledgering.
- Do not claim PayShield is a bank.
- Do not claim FDIC insurance until the final sponsor bank and recordkeeping
  model supports precise, approved language.
- Enable Vercel Web Analytics and Speed Insights before paid traffic so segment,
  conversion, and performance can be measured from the first launch push.
- Have counsel review the prototype Privacy Notice and Terms before broad public
  acquisition or regulated financial-service launch.

See [docs/market-readiness.md](docs/market-readiness.md) for the current launch
checklist and regulated-money gates. See
[docs/vercel-launch.md](docs/vercel-launch.md) for the Vercel import,
environment, webhook, and post-deploy smoke-test runbook. The deploy smoke
checker validates required pages, launch assets, safe waitlist API validation,
browser security headers, and, when `--expect-site-url` is provided, production
canonical, sitemap, robots, and social image URLs.
See [SECURITY.md](SECURITY.md) for vulnerability reporting and production
security baseline notes.

## Source Asset

The product mockup in `public/images/payshield-product-mockup.avif` was
generated for this project, optimized for web delivery, and intentionally avoids
readable third-party financial branding. `public/images/payshield-social-card.jpg`
is a lightweight social preview fallback for Open Graph and Twitter crawlers.
`src/app/icon.svg` is the branded PayShield icon used by metadata and the web
app manifest.
