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
  ready and signed with `PAYSHIELD_WAITLIST_WEBHOOK_SECRET`, then set it to
  `true` before paid traffic.

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
The same workflow also runs `npm run receiver:docker:build` so the lightweight
receiver image remains buildable when that fallback capture path is needed.

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
closed unless the webhook URL and signing secret are configured.

If there is no webhook yet, leave `PAYSHIELD_WAITLIST_WEBHOOK_URL` empty. The
form will still return demo-mode success for prototype walkthroughs, but
submissions will not persist outside Vercel logs and analytics.

## Webhook Contract

`/api/waitlist` sends a `POST` request with JSON:

```json
{
  "attribution": {
    "landingPath": "/",
    "utmCampaign": "household-launch",
    "utmContent": "safe-to-spend-card",
    "utmMedium": "cpc",
    "utmSource": "paid-social",
    "utmTerm": "budget-protection"
  },
  "email": "pilot@example.com",
  "name": "Pilot Lead",
  "segment": "Household",
  "message": "Rent and insurance first.",
  "consentText": "I agree that PayShield can contact me about the pilot and handle my information under the Privacy Notice and Terms.",
  "consentedAt": "2026-06-05T00:00:00.000Z",
  "consentVersion": "pilot-contact-consent-2026-06-05",
  "privacyVersion": "pilot-privacy-2026-06-05",
  "source": "payshield-market-site",
  "termsVersion": "pilot-terms-2026-06-05",
  "createdAt": "2026-06-05T00:00:00.000Z"
}
```

The consent fields are required for production lead capture. Receivers should
store `consentVersion`, `privacyVersion`, `termsVersion`, `consentedAt`, and
`consentText` with the lead so pilot outreach consent can be audited later.

`attribution` is optional. The site captures only allowlisted UTM parameters
from `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term`,
plus a landing path without query parameters. The API re-sanitizes those fields
and drops raw URLs, email-like values, and long account-like numbers before
forwarding the webhook or emitting analytics events.

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
- Health path: `/health`.
- Port: `8787`, override with `PORT`.
- Output directory: `data/waitlist`, override with
  `PAYSHIELD_RECEIVER_DATA_DIR`.
- Files written: `waitlist.ndjson` and `waitlist.csv`.

The output directory is ignored by git because it contains lead data. To use it
with production traffic, host the receiver behind HTTPS, set
`PAYSHIELD_WAITLIST_WEBHOOK_URL` to that endpoint, set the same
`PAYSHIELD_WAITLIST_WEBHOOK_SECRET` in Vercel, then set
`PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true`.

For a container host with a persistent volume, build the dedicated receiver
image:

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

Do not use a container instance without a persistent volume for paid traffic.
The receiver writes lead data to files under `/data/waitlist`; ephemeral storage
will lose accepted leads on restart or redeploy.

The lightweight receiver data files can be checked without printing emails or
notes:

```bash
npm run waitlist:data -- summary --data-dir /path/to/waitlist
```

To honor a deletion request, dry-run the removal first and then rerun without
`--dry-run`:

```bash
npm run waitlist:data -- erase --email lead@example.com --data-dir /path/to/waitlist --dry-run
npm run waitlist:data -- erase --email lead@example.com --data-dir /path/to/waitlist
```

The erase command rewrites `waitlist.ndjson` and regenerates `waitlist.csv` from
the remaining records. It refuses to rewrite if the NDJSON file contains
malformed lines.

Before changing Vercel to required-webhook mode, prove the receiver accepts a
signed PayShield payload:

```bash
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook npm run webhook:test -- https://your-webhook-url
```

The tester sends one sample lead, expects a 2xx response, and prints the
receiver response without printing the signing secret.

## Post-Deploy Smoke Checks

Run the smoke checker against the preview URL and then the production URL:

```bash
npm run smoke:deploy -- https://your-domain.com
npm run smoke:deploy -- https://your-domain.com --expect-site-url https://your-domain.com
```

The default smoke check validates the homepage, legal pages, SEO routes, launch
assets, browser security headers, public `security.txt`, removal of default
scaffold assets, `/api/health`, and waitlist consent validation without creating
a persisted lead. Use `--expect-site-url` on the production URL to confirm
canonical metadata, social image URLs, robots, sitemap entries, and
`security.txt` match `NEXT_PUBLIC_SITE_URL`.
It also confirms the Privacy Notice discloses campaign attribution, Vercel Web
Analytics, Speed Insights, and that analytics events exclude emails, names,
sensitive financial details, and free-text pilot notes.

`/api/health` returns public-safe readiness state. In demo mode, it returns
`waitlist.mode: "demo"` and `waitlist.paidTrafficReady: false`. After the
webhook URL, signing secret, and `PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` are
configured, it should return `waitlist.mode: "webhook"`,
`waitlist.webhookSigningConfigured: true`, and
`waitlist.paidTrafficReady: true`. The endpoint does not expose the webhook URL
or signing secret.

After the webhook is configured, run one explicit submission test:

```bash
npm run readiness:paid-traffic -- https://your-domain.com --expect-site-url https://your-domain.com
npm run smoke:deploy -- https://your-domain.com --expect-site-url https://your-domain.com --submit-test --require-webhook
```

Before the webhook is configured, the same readiness command may be run with
`--allow-prototype`; it should pass the public launch-surface checks while
warning that waitlist capture is still in demo mode.

Manual equivalents:

```bash
curl -I https://your-domain.com/
curl -I https://your-domain.com/ | rg 'x-content-type-options|referrer-policy|x-frame-options|strict-transport-security|permissions-policy'
curl -I https://your-domain.com/images/payshield-social-card.jpg
curl https://your-domain.com/robots.txt
curl https://your-domain.com/sitemap.xml
```

Submit one pilot request from the site and confirm:

- The success message appears.
- The webhook receives the payload, or the response clearly says demo mode.
- A test URL with `utm_source`, `utm_medium`, and `utm_campaign` produces only
  sanitized `attribution` fields in the receiver.
- Vercel logs show `request_completed`.
- Vercel Web Analytics receives `Pilot Request Attempted` and
  `Pilot Request Submitted` with non-PII campaign metadata.
- Vercel Speed Insights starts recording page data.

## Before Paid Traffic

- Confirm custom domain and `NEXT_PUBLIC_SITE_URL` match.
- Confirm Privacy Notice and Terms links work from the pilot form and footer.
- Confirm the Privacy Notice discloses UTM attribution, analytics, performance
  metadata, and the analytics PII boundary before campaign traffic.
- Confirm `/.well-known/security.txt` links to private GitHub vulnerability
  reporting and the repository security policy.
- Confirm social previews use `payshield-social-card.jpg`.
- Run `npm run campaign:lint -- path/to/campaign-copy.md` against paid ads,
  emails, social posts, partner one-pagers, and alternate landing-page copy.
- Confirm no public copy says PayShield is a bank, claims FDIC insurance, or
  implies live money movement.
- Have counsel review the prototype Privacy Notice, Terms, fintech claims, and
  partner-bank disclaimers.
