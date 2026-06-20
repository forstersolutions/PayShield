# PayShield Legal Review Packet

Status: counsel handoff packet, not legal approval.
Last updated: June 5, 2026.

Use this packet before broad public acquisition, paid ads, partner one-pagers, or
any regulated financial-service claim. It summarizes the current public
commercial product surface and the specific legal/compliance questions that still
need a qualified review.

## Review Scope

- Production URL: `https://payshield-lime.vercel.app`
- Main public page: `src/app/page.tsx`
- Product inquiry form: `src/app/components/waitlist-form.tsx`
- Privacy Notice: `src/app/privacy/page.tsx`
- Terms: `src/app/terms/page.tsx`
- Campaign copy guardrails: `docs/campaign-copy.md`
- Paid traffic readiness tracker: GitHub issue `#3`

## Current Positioning

The current public surface positions PayShield as a commercial paycheck-control
app for customer discovery, employer conversations, investor review, and
provider diligence.

Approved provider-activation framing currently present in the product:

- "PayShield is operated by Grayston Technologies."
- "Account opening, card controls, and money movement stay locked until
  approved provider credentials, disclosures, and operating controls are active."
- "PayShield provides paycheck control software for modeling protected buckets,
  bill rules, safe-to-spend decisions, and recovery plans."
- "Customer money controls require approved provider credentials, exact account,
  card, payment, and support disclosures, and Grayston operating runbooks before
  activation."

Counsel should confirm this framing is sufficient for the intended campaign
audience and channel.

## Public Claims To Review

These are the highest-risk claims or near-claims currently visible in public
copy. They are intentionally presented as product controls with provider
activation gates, but should still be reviewed before paid traffic.

- "A controlled ledger first. Banking rails when the partner stack is approved."
- "The front-end presents planning mechanics: paycheck planning, protected
  internal buckets, future bill-routing rules, core-ledger spending controls,
  emergency unlock friction, and recovery plans."
- Future-only public label: "Paycheck split model" and "A future
  partner-approved paycheck event would fund obligations first and send the
  remainder to safe spending."
- "Card controls" and "Future card-control logic would check safe spending
  instead of a total account-style balance."
- "Bill-only buckets" and "Rent, insurance, and vehicle reserves can be modeled
  for approved payees before payment rails are live."
- "The bank balance is not the truth. Safe to spend is."
- "Rent money cannot disappear into ordinary card purchases."
- "Emergency access creates a recovery plan instead of a penalty spiral."
- "Subscription-led revenue, not desperation fees."
- Pricing examples for Free, Plus, Pro, and Premium tiers.

## Required Disclaimers Currently Present

- Terms state provider-enabled services stay locked until approved provider
  credentials, disclosures, and operating controls are active.
- Terms state PayShield and Grayston Technologies do not activate account, card,
  transfer, or bill-payment workflows before those controls are in place.
- Privacy Notice states PayShield is operated by Grayston Technologies and that
  provider-enabled services require additional notices before activation.
- Contact form tells users not to include bank, card, SSN, account, or routing
  numbers.

## Counsel Questions

1. Confirm whether the planning-only framing is enough for paid search,
   social, email, and partner referral campaigns.
2. Confirm whether terms such as "Protected Paycheck OS", "protected internal
   buckets", "safe spending", and "rent money cannot disappear" create
   guarantee, UDAAP, or reliance risk.
3. Confirm whether pricing examples can remain public before real service terms,
   provider-program contracts, and fee disclosures exist.
4. Confirm whether future-only phrases such as "paycheck split model", "card
   controls", "bill-only buckets", and similar future mechanics need stronger
   qualification or removal from paid landing pages.
5. Confirm whether the Privacy Notice and Terms are sufficient for collecting
   product inquiry, sanitized UTM attribution, Vercel Web Analytics events, and
   Speed Insights metadata.
6. Confirm the consent language and retained audit fields:
   `consentText`, `consentedAt`, `consentVersion`, `privacyVersion`, and
   `termsVersion`.
7. Confirm lightweight receiver data handling, including
   `npm run receiver:evidence -- --url https://your-webhook-url --data-dir /path/to/waitlist --backup-dir /secure/path`,
   `npm run waitlist:data -- audit --data-dir /path/to/waitlist`,
   `npm run waitlist:data -- backup --data-dir /path/to/waitlist --backup-dir /secure/path`,
   `npm run waitlist:data -- verify-backup --backup-path /secure/path/waitlist-backup-...`,
   and
   `npm run waitlist:data -- erase --email lead@example.com --dry-run`; or
   confirm managed receiver/CRM evidence with
   `npm run receiver:managed:check -- --file launch-evidence/receiver-evidence.json`.
   If Vercel Marketplace Upstash Redis is used instead, confirm the Redis data
   handling owner, export process, deletion process, and encrypted server-side
   env vars `PAYSHIELD_WAITLIST_STORAGE=upstash`, `UPSTASH_REDIS_REST_URL`, and
   `UPSTASH_REDIS_REST_TOKEN`; after production cutover, confirm the redacted
   `npm run receiver:upstash:evidence -- https://payshield-lime.vercel.app --site-url https://payshield-lime.vercel.app --reviewer "Launch operator" --storage-owner "Revenue operations" --deletion-process-documented --export-process-documented --output launch-evidence/receiver-evidence.json`
   output proves consent metadata, sanitized attribution, `submissionId`, and
   email-hash index storage without printing lead PII or Upstash secrets.
   If Vercel Blob is used instead, confirm the private object storage owner,
   export process, deletion process, and encrypted server-side env vars
   `PAYSHIELD_WAITLIST_STORAGE=blob` and `BLOB_READ_WRITE_TOKEN`; after
   production cutover, confirm the redacted
   `npm run receiver:blob:evidence -- https://payshield-lime.vercel.app --site-url https://payshield-lime.vercel.app --reviewer "Launch operator" --storage-owner "Revenue operations" --deletion-process-documented --export-process-documented --output launch-evidence/receiver-evidence.json`
   output proves consent metadata, sanitized attribution, `submissionId`, and
   private Blob storage without printing lead PII or the Blob read-write token.
8. Confirm prohibited copy boundaries before any claim involving account
   opening, ACH, debit cards, virtual cards, bill-pay, money movement, FDIC, or
   sponsor-bank services.

## Evidence Commands

Run these commands and attach the outputs to the paid-traffic readiness issue
before counsel sign-off:

```bash
npm run market:evidence:init -- --dir launch-evidence --site-url https://payshield-lime.vercel.app --receiver-url https://your-webhook-url --data-dir /path/to/waitlist --backup-dir /secure/path
npm run campaign:lint:all
npm run campaign:lint -- docs/legal-review-packet.md docs/campaign-copy.md
npm run smoke:deploy -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app
npm run readiness:paid-traffic -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app --allow-demo-capture
```

After the production receiver or CRM is configured, add:

```bash
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret npm run webhook:test -- https://your-webhook-url --replay
npm run receiver:managed:check -- --file launch-evidence/receiver-evidence.json
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret npm run vercel:webhook:cutover -- --site-url https://payshield-lime.vercel.app --receiver-evidence-file launch-evidence/receiver-evidence.json
UPSTASH_REDIS_REST_URL=https://your-upstash-endpoint UPSTASH_REDIS_REST_TOKEN=server-side-rest-token npm run vercel:upstash:cutover -- --site-url https://payshield-lime.vercel.app --receiver-evidence-file launch-evidence/receiver-evidence.json --apply-env
npm run smoke:deploy -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app --submit-test --require-webhook
UPSTASH_REDIS_REST_URL=https://your-upstash-endpoint UPSTASH_REDIS_REST_TOKEN=server-side-rest-token npm run receiver:upstash:evidence -- https://payshield-lime.vercel.app --site-url https://payshield-lime.vercel.app --reviewer "Launch operator" --storage-owner "Revenue operations" --deletion-process-documented --export-process-documented --output launch-evidence/receiver-evidence.json
npm run receiver:upstash:check -- --file launch-evidence/receiver-evidence.json
BLOB_READ_WRITE_TOKEN=server-side-blob-token npm run receiver:blob:evidence -- https://payshield-lime.vercel.app --site-url https://payshield-lime.vercel.app --reviewer "Launch operator" --storage-owner "Revenue operations" --deletion-process-documented --export-process-documented --output launch-evidence/receiver-evidence.json
npm run receiver:blob:check -- --file launch-evidence/receiver-evidence.json
npm run readiness:paid-traffic -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app
npm run counsel:signoff:check -- --file launch-evidence/counsel-signoff.json
npm run analytics:probe -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app --output launch-evidence/analytics-evidence.json --require-paid-traffic-ready
npm run analytics:evidence:check -- --file launch-evidence/analytics-evidence.json --site-url https://payshield-lime.vercel.app
npm run market:go-no-go -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app --receiver-evidence-file launch-evidence/receiver-evidence.json --counsel-signoff-file launch-evidence/counsel-signoff.json --analytics-evidence-file launch-evidence/analytics-evidence.json
npm run market:status -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app --receiver-evidence-file launch-evidence/receiver-evidence.json --counsel-signoff-file launch-evidence/counsel-signoff.json --analytics-evidence-file launch-evidence/analytics-evidence.json
```

## Sign-Off Record

- Reviewer:
- Review date:
- Approved channels:
- Required edits before launch:
- Campaign copy files reviewed:
- Notes:

The final go/no-go gate expects this local JSON record in
`launch-evidence/counsel-signoff.json` after counsel review:

```json
{
  "ok": true,
  "reviewedAt": "2026-06-05T00:00:00.000Z",
  "reviewer": "Counsel or authorized reviewer",
  "scope": ["privacy", "terms", "publicClaims", "campaignCopy"],
  "campaignCopyLintOk": true
}
```
