# PayShield

PayShield is a Vercel-hosted Next.js prototype for a protected paycheck product:
future direct deposits would fund required buckets first, and the debit card
would only access safe-to-spend money.

## Getting Started

Use Node.js 20.9 or newer.

Install dependencies and run the local development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Scripts

```bash
npm run dev
npm run verify
npm test
npm run market-preflight
npm run smoke:deploy -- https://your-domain.com
npm run smoke:deploy -- https://your-domain.com --expect-site-url https://your-domain.com
npm run build
npm run start
npm run lint
npm run typecheck
```

## Continuous Integration

`npm run verify` runs linting, TypeScript checks, waitlist API tests, market
copy/asset preflight checks, a production build, and a production dependency
audit. GitHub Actions runs the same preflight on pushes to `main` and pull
requests. Vercel's Git integration will still create preview and production
deployments; the workflow is a source-level quality gate before deployment.

Dependabot is configured for weekly npm and GitHub Actions update pull requests,
grouped by runtime, Vercel observability, lint/type tooling, and workflow
maintenance. During launch, npm semver-major updates are ignored so patch/minor
maintenance can keep moving without pulling unplanned framework or tooling
migrations into the release path.

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
```

`/api/waitlist` validates pilot requests, applies bounded in-memory rate
limiting and request-size guardrails, filters a honeypot field, and forwards
submissions to `PAYSHIELD_WAITLIST_WEBHOOK_URL` when configured. Without the
webhook, the form returns a demo-mode success so the Vercel preview can still be
used in investor and partner conversations.
If `PAYSHIELD_WAITLIST_WEBHOOK_SECRET` is set, it is forwarded as
`x-payshield-webhook-secret`. Webhook delivery times out after eight seconds so
slow downstream tools do not hold the request open indefinitely.

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

## Source Asset

The product mockup in `public/images/payshield-product-mockup.avif` was
generated for this project, optimized for web delivery, and intentionally avoids
readable third-party financial branding. `public/images/payshield-social-card.jpg`
is a lightweight social preview fallback for Open Graph and Twitter crawlers.
`src/app/icon.svg` is the branded PayShield icon used by metadata and the web
app manifest.
