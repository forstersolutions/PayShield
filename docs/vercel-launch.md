# Vercel Launch Runbook

Use this checklist after the repository is pushed to
`forstersolutions/PayShield`.

## Import

1. In Vercel, import the GitHub repository `forstersolutions/PayShield`.
2. Keep the framework preset as Next.js.
3. Keep the build command as `npm run build`.
4. Use Node.js 20.9 or newer. The project currently validates on Node.js 22.
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
```

`NEXT_PUBLIC_SITE_URL` is exposed to the browser and should contain only the
public site URL. The webhook URL and shared secret are server-only.

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

The request includes `x-payshield-webhook-secret` when
`PAYSHIELD_WAITLIST_WEBHOOK_SECRET` is configured. The receiving endpoint should
respond in under eight seconds.

## Post-Deploy Smoke Checks

Run the smoke checker against the preview URL and then the production URL:

```bash
npm run smoke:deploy -- https://your-domain.com
```

The default smoke check validates the homepage, legal pages, SEO routes, launch
assets, and waitlist consent validation without creating a persisted lead.
After the webhook is configured, run one explicit submission test:

```bash
npm run smoke:deploy -- https://your-domain.com --submit-test
```

Manual equivalents:

```bash
curl -I https://your-domain.com/
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
