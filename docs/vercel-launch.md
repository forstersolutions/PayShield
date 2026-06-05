# Vercel Launch Runbook

Use this checklist after the repository is pushed to
`forstersolutions/PayShield`.

## Current Production

- Vercel project: `james-projects-397b955f/payshield`.
- Production URL: `https://payshield-lime.vercel.app`.
- GitHub repository connected: `forstersolutions/PayShield`.
- `NEXT_PUBLIC_SITE_URL` is configured for Production as
  `https://payshield-lime.vercel.app`.
- Vercel Web Analytics and Speed Insights are enabled for the project.
- `PAYSHIELD_WAITLIST_WEBHOOK_URL` is not configured yet. The pilot form returns
  demo-mode success and emits logs/analytics, but real lead persistence still
  requires a CRM, Airtable, Slack, Make, Zapier, or internal webhook. Keep
  `PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK` unset or `false` until the webhook is
  ready, then set it to `true` before paid traffic.

## Import

1. In Vercel, import the GitHub repository `forstersolutions/PayShield`.
2. Keep the framework preset as Next.js. `vercel.json` also pins this preset
   with `"framework": "nextjs"` so CLI-created projects do not fall back to
   `Other`.
3. Keep the build command as `npm run build`.
4. Use Node.js 22.x. The repository engines and CI are pinned to Node.js 22.
5. Enable automatic preview deployments for pull requests and production
   deployment from `main`.

GitHub Actions runs `npm run verify` before Vercel deploys from the GitHub
integration. This includes linting, TypeScript checks, route tests, market
copy/asset preflight checks, production build, and production dependency audit.

## Environment Variables

Configure these in Vercel for Production and Preview:

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.com
PAYSHIELD_WAITLIST_WEBHOOK_URL=https://your-webhook-url
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook
PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true
```

`NEXT_PUBLIC_SITE_URL` is exposed to the browser and should contain only the
public site URL. The webhook URL and shared signing secret are server-only.
`PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` makes valid waitlist submissions fail
closed unless the webhook URL is configured.

If there is no webhook yet, leave `PAYSHIELD_WAITLIST_WEBHOOK_URL` empty. The
form will still return demo-mode success for prototype walkthroughs, but
submissions will not persist outside Vercel logs and analytics.

## Webhook Contract

`/api/waitlist` sends a `POST` request with JSON:

```json
{
  "email": "pilot@example.com",
  "name": "Pilot Lead",
  "segment": "Household",
  "message": "Rent and insurance first.",
  "consentVersion": "pilot-privacy-2026-06-05",
  "source": "payshield-market-site",
  "createdAt": "2026-06-05T00:00:00.000Z"
}
```

When `PAYSHIELD_WAITLIST_WEBHOOK_SECRET` is configured, the request includes:

- `x-payshield-webhook-timestamp`: Unix timestamp in seconds.
- `x-payshield-webhook-signature`: `v1=<hex-hmac-sha256>`.

The HMAC message is `${timestamp}.${rawBody}` using the exact JSON request body.
The receiving endpoint should reject missing or invalid signatures, reject stale
timestamps, and respond in under eight seconds.

Node verification example:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verifyPayShieldSignature({ rawBody, secret, signature, timestamp }) {
  const expected = `v1=${createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")}`;
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    signatureBuffer.length === expectedBuffer.length &&
    timingSafeEqual(signatureBuffer, expectedBuffer)
  );
}
```

## Lightweight Receiver

If a CRM, Airtable, Slack, Make, Zapier, or internal receiver is not ready yet,
the repository includes a minimal signed receiver:

```bash
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook npm run webhook:receive
```

Defaults:

- Path: `/payshield-waitlist`.
- Port: `8787`, override with `PORT`.
- Output directory: `data/waitlist`, override with
  `PAYSHIELD_RECEIVER_DATA_DIR`.
- Files written: `waitlist.ndjson` and `waitlist.csv`.

The output directory is ignored by git because it contains lead data. To use it
with production traffic, host the receiver behind HTTPS, set
`PAYSHIELD_WAITLIST_WEBHOOK_URL` to that endpoint, set the same
`PAYSHIELD_WAITLIST_WEBHOOK_SECRET` in Vercel, then set
`PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true`.

## Post-Deploy Smoke Checks

Run the smoke checker against the preview URL and then the production URL:

```bash
npm run smoke:deploy -- https://your-domain.com
npm run smoke:deploy -- https://your-domain.com --expect-site-url https://your-domain.com
```

The default smoke check validates the homepage, legal pages, SEO routes, launch
assets, browser security headers, `/api/health`, and waitlist consent
validation without creating a persisted lead. Use `--expect-site-url` on the
production URL to confirm canonical metadata, social image URLs, robots, and
sitemap entries match `NEXT_PUBLIC_SITE_URL`.

`/api/health` returns public-safe readiness state. In demo mode, it returns
`waitlist.mode: "demo"` and `waitlist.paidTrafficReady: false`. After the
webhook URL and `PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` are configured, it
should return `waitlist.mode: "webhook"` and `waitlist.paidTrafficReady: true`.
The endpoint does not expose the webhook URL or signing secret.

After the webhook is configured, run one explicit submission test:

```bash
npm run smoke:deploy -- https://your-domain.com --expect-site-url https://your-domain.com --submit-test --require-webhook
```

Manual equivalents:

```bash
curl -I https://your-domain.com/
curl -I https://your-domain.com/ | rg 'x-content-type-options|referrer-policy|x-frame-options|permissions-policy'
curl -I https://your-domain.com/images/payshield-social-card.jpg
curl https://your-domain.com/robots.txt
curl https://your-domain.com/sitemap.xml
```

Submit one pilot request from the site and confirm:

- The success message appears.
- The webhook receives the payload, or the response clearly says demo mode.
- Vercel logs show `request_completed`.
- Vercel Web Analytics receives `Pilot Request Attempted` and
  `Pilot Request Submitted`.
- Vercel Speed Insights starts recording page data.

## Before Paid Traffic

- Confirm custom domain and `NEXT_PUBLIC_SITE_URL` match.
- Confirm Privacy Notice and Terms links work from the pilot form and footer.
- Confirm social previews use `payshield-social-card.jpg`.
- Confirm no public copy says PayShield is a bank, claims FDIC insurance, or
  implies live money movement.
- Have counsel review the prototype Privacy Notice, Terms, fintech claims, and
  partner-bank disclaimers.
