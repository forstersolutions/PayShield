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
- `PAYSHIELD_WAITLIST_WEBHOOK_URL` is not configured yet. The contact form returns
  demo-mode success and emits logs/analytics until durable capture is selected.
- A private Vercel Blob store named `payshield-waitlist` is linked to the
  project and `BLOB_READ_WRITE_TOKEN` is configured for Production. Set
  `PAYSHIELD_WAITLIST_STORAGE=blob` and
  `PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` only after the Blob code path is
  deployed.
- Upstash Redis Marketplace installation still requires Vercel marketplace terms
  acceptance before that alternate path can be used.

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
The same workflow also runs `npm run receiver:docker:smoke` so the lightweight
receiver image is buildable, starts with a mounted data volume, reports health,
accepts signed idempotent submissions, and supports non-PII summary plus
deletion dry-run handling when that fallback capture path is needed.

## Environment Variables

Configure these in Vercel for Production and Preview:

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

`NEXT_PUBLIC_SITE_URL` is exposed to the browser and should contain only the
public site URL. The webhook URL, shared signing secret, Blob read-write token,
Upstash REST URL, and Upstash REST token are server-only.
`PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` makes valid waitlist submissions fail
closed unless a signed webhook path, Blob storage path, or Upstash storage path
is configured.
Production webhook URLs must use HTTPS and must not include credentials, query
strings, or fragments. Localhost HTTP is accepted only for local receiver proof
outside Vercel Production.

For preferred Vercel-native durable capture, create a private Vercel Blob store
linked to the project and let Vercel inject `BLOB_READ_WRITE_TOKEN`. Then set
`PAYSHIELD_WAITLIST_STORAGE=blob` and
`PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` in Production. The app writes each
validated lead as one private JSON object under the configured storage prefix;
it does not expose the Blob token or object URL in public health responses.

For alternate Vercel-native durable capture, install Upstash Redis through
Vercel Marketplace and let Vercel inject the encrypted Redis REST env vars.
Then set `PAYSHIELD_WAITLIST_STORAGE=upstash` and
`PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` in Production. The app writes each
validated lead as a JSON record plus submission and email-hash indexes through
the Upstash Redis REST transaction API; it does not expose the Upstash endpoint
or token in public health responses.

If there is no webhook yet, leave `PAYSHIELD_WAITLIST_WEBHOOK_URL` empty. The
form will still return demo-mode success for planning app walkthroughs, but
submissions will not persist outside Vercel logs and analytics.

Audit the current Vercel environment state without printing encrypted values:

```bash
npm run vercel:env:audit
```

Audit the full commercial money-control path before selling access:

```bash
npm run vercel:env:audit -- --profile commercial
```

For launch-surface evidence before the webhook variables are configured:

```bash
npx vercel env ls | npm run vercel:env:audit -- --stdin --allow-demo-capture
```

The audit must pass without `--allow-demo-capture` before paid traffic.

Generate a redacted readiness evidence packet for the launch issue:

```bash
npm run launch:evidence -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app
```

The packet includes production health, public paid-traffic readiness checks,
analytics instrumentation audit status, Vercel env audit status, the local
lead-capture dry run, and the remaining hard gates. In the current planning app
state, it should report `paidTrafficReady: false`. After durable capture env
variables are configured, rerun it with `--strict` and attach the output only if
it passes.

Refresh the redacted production status snapshot after each launch commit or
evidence update:

```bash
npm run market:status -- \
  https://payshield-lime.vercel.app \
  --expect-site-url https://payshield-lime.vercel.app
```

The snapshot combines production health, local git commit, latest GitHub CI,
Vercel deployment readiness, launch evidence, and market go/no-go remaining
gates for the readiness issue.

Create a local ignored evidence packet before the final cutover:

```bash
npm run market:evidence:init -- \
  --dir launch-evidence \
  --site-url https://payshield-lime.vercel.app \
  --receiver-url https://your-webhook-url \
  --data-dir /path/to/waitlist \
  --backup-dir /secure/path
```

The command creates `launch-evidence/counsel-signoff.json`,
`launch-evidence/analytics-evidence.json`,
`launch-evidence/managed-receiver-evidence-template.json`,
`launch-evidence/upstash-receiver-evidence-template.json`,
`launch-evidence/blob-receiver-evidence-template.json`, and
`launch-evidence/commands.md`. The generated commands include Vercel env audit,
required-capture production submit smoke, strict launch evidence, final
go/no-go validation, and status refresh. The directory is ignored by git. Fill
the counsel and analytics JSON files only after counsel review and live
analytics observation. If production capture uses a managed CRM, Airtable,
Slack, Make, Zapier, or internal webhook, copy the managed receiver template to
`launch-evidence/receiver-evidence.json`, fill it after signed replay and
storage review, then validate it with
`npm run receiver:managed:check -- --file launch-evidence/receiver-evidence.json`.
If production capture uses Vercel Marketplace Upstash Redis, keep the Upstash
template as the pre-cutover placeholder. After Vercel Production is configured,
redeployed, and required-capture smoke passes, run
`npm run receiver:upstash:evidence -- https://payshield-lime.vercel.app --site-url https://payshield-lime.vercel.app --reviewer "Launch operator" --storage-owner "Revenue operations" --deletion-process-documented --export-process-documented --output launch-evidence/receiver-evidence.json`,
then validate it with
`npm run receiver:upstash:check -- --file launch-evidence/receiver-evidence.json`.
If production capture uses Vercel Blob, keep the Blob template as the
pre-cutover placeholder. After a private Blob store is linked, Vercel
Production is configured, redeployed, and required-capture smoke passes, run
`BLOB_READ_WRITE_TOKEN=server-side-blob-token npm run receiver:blob:evidence -- https://payshield-lime.vercel.app --site-url https://payshield-lime.vercel.app --reviewer "Launch operator" --storage-owner "Revenue operations" --deletion-process-documented --export-process-documented --output launch-evidence/receiver-evidence.json`,
then validate it with
`npm run receiver:blob:check -- --file launch-evidence/receiver-evidence.json`.
Run the generated final `npm run market:go-no-go` command without
`--allow-not-ready` only after all evidence files pass.

After counsel approves the current Privacy Notice, Terms, public claims, and
campaign copy, validate the redacted sign-off record:

```bash
npm run counsel:signoff:check -- \
  --file launch-evidence/counsel-signoff.json
```

After a campaign-attributed production test appears in Vercel Web Analytics and
Speed Insights, validate the redacted analytics evidence file:

```bash
npm run analytics:probe -- \
  https://payshield-lime.vercel.app \
  --expect-site-url https://payshield-lime.vercel.app \
  --output launch-evidence/analytics-evidence.json \
  --require-paid-traffic-ready

npm run analytics:evidence:check -- \
  --file launch-evidence/analytics-evidence.json \
  --site-url https://payshield-lime.vercel.app
```

After `launch-evidence/receiver-evidence.json` exists, generate the Vercel
Production cutover plan without printing the signing secret:

```bash
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook \
  npm run vercel:webhook:cutover -- \
  --site-url https://payshield-lime.vercel.app \
  --receiver-evidence-file launch-evidence/receiver-evidence.json
```

The command validates the receiver evidence, confirms the signing secret exists
in the local environment, and prints the `npx vercel env add` commands for
`PAYSHIELD_WAITLIST_WEBHOOK_URL`, `PAYSHIELD_WAITLIST_WEBHOOK_SECRET`, and
`PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` plus the required redeploy, env audit,
strict launch evidence, and required-webhook smoke commands. It references
`$PAYSHIELD_WAITLIST_WEBHOOK_SECRET` but does not print the secret value.

For the Upstash path, generate the redacted cutover plan instead of manually
typing the env commands:

```bash
UPSTASH_REDIS_REST_URL=https://your-upstash-endpoint \
UPSTASH_REDIS_REST_TOKEN=server-side-rest-token \
  npm run vercel:upstash:cutover -- \
  --site-url https://payshield-lime.vercel.app \
  --receiver-evidence-file launch-evidence/receiver-evidence.json
```

The command confirms the local Upstash env vars exist, validates the REST URL is
HTTPS and redacted, and prints `npx vercel env add` commands for
`PAYSHIELD_WAITLIST_STORAGE=upstash`, `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, and `PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` plus
the required redeploy, env audit, strict launch evidence, required-capture
smoke, and `receiver:upstash:check` commands. It references the local env vars
but does not print the REST URL or token values.

To apply the Vercel Production env vars directly from the local shell values,
add `--apply-env`:

```bash
UPSTASH_REDIS_REST_URL=https://your-upstash-endpoint \
UPSTASH_REDIS_REST_TOKEN=server-side-rest-token \
  npm run vercel:upstash:cutover -- \
  --site-url https://payshield-lime.vercel.app \
  --receiver-evidence-file launch-evidence/receiver-evidence.json \
  --apply-env
```

The apply mode only adds the four Production env vars and prints redacted step
status. After it succeeds, redeploy Production and run the printed env audit,
strict launch evidence, required-capture smoke, and Upstash evidence checks. If
Vercel reports an env var already exists, update or remove it in the Vercel
dashboard before rerunning.

For the Blob path, create and link a private Blob store, then set the two
non-secret mode flags before the paid-traffic deployment:

```bash
npx vercel blob create-store payshield-waitlist --access private --region iad1 --yes --environment production
printf %s blob | npx vercel env add PAYSHIELD_WAITLIST_STORAGE production
printf %s true | npx vercel env add PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK production
```

`BLOB_READ_WRITE_TOKEN` is injected by the linked Blob store. Do not print or
commit it. After the Blob env vars are configured in Vercel Production,
production is redeployed, and the required-capture smoke passes, generate
redacted Blob receiver evidence from the live site and private store:

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

npm run receiver:blob:check -- \
  --file launch-evidence/receiver-evidence.json
```

The evidence command submits one campaign-attributed production smoke lead,
checks `/api/health`, reads the exact private Blob object by receipt ID,
verifies stored consent metadata, sanitized attribution, and `submissionId`, and
writes only redacted evidence. It does not print the smoke lead email, note, or
Blob read-write token.

After the Upstash env vars are configured in Vercel Production, production is
redeployed, and the required-capture smoke passes, generate redacted Upstash
receiver evidence from the live site and Redis REST API:

```bash
UPSTASH_REDIS_REST_URL=https://your-upstash-endpoint \
UPSTASH_REDIS_REST_TOKEN=server-side-rest-token \
  npm run receiver:upstash:evidence -- \
  https://payshield-lime.vercel.app \
  --site-url https://payshield-lime.vercel.app \
  --reviewer "Launch operator" \
  --storage-owner "Revenue operations" \
  --deletion-process-documented \
  --export-process-documented \
  --output launch-evidence/receiver-evidence.json

npm run receiver:upstash:check -- \
  --file launch-evidence/receiver-evidence.json
```

The evidence command submits one campaign-attributed production smoke lead,
checks `/api/health`, verifies the stored Redis lead record, consent metadata,
sanitized attribution, `submissionId`, and email-hash index, and writes only
redacted evidence. It does not print the smoke lead email, REST URL, or token.

Before selecting a hosted receiver or CRM endpoint, prove the repo-owned lead
capture path locally:

```bash
npm run lead-capture:dry-run
```

The dry run starts the lightweight receiver on localhost, sets the waitlist API
to required signed webhook mode for the duration of the command, submits one
product inquiry through the real route handler, verifies stored consent metadata,
sanitized campaign attribution, idempotent replay behavior, non-PII data summary
output, and deletion dry-run handling, then deletes the temporary receiver data
directory. Use `--keep-data` only for local inspection; the preserved directory
contains test lead data.

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
  "consentText": "I agree that Grayston Technologies can contact me about PayShield onboarding and handle my information under the Privacy Notice and Terms.",
  "consentedAt": "2026-06-05T00:00:00.000Z",
  "consentVersion": "pilot-contact-consent-2026-06-05",
  "privacyVersion": "pilot-privacy-2026-06-05",
  "source": "payshield-market-site",
  "submissionId": "018f7f62-9878-4aab-9ed3-86368f7f4512",
  "termsVersion": "pilot-terms-2026-06-05",
  "createdAt": "2026-06-05T00:00:00.000Z"
}
```

The consent fields are required for production lead capture. Receivers should
store `consentVersion`, `privacyVersion`, `termsVersion`, `consentedAt`, and
`consentText` with the lead so product onboarding consent can be audited later.
`submissionId` is a UUID generated by the site for idempotency; receivers should
store it with the lead and treat a later signed request with the same
`submissionId` as a successful replay instead of a second lead.

`attribution` is optional. The site captures only allowlisted UTM parameters
from `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term`,
plus a landing path without query parameters. The API re-sanitizes those fields
and drops raw URLs, email-like values, and long account-like numbers before
forwarding the webhook or emitting analytics events.

When `PAYSHIELD_WAITLIST_WEBHOOK_SECRET` is configured, the request includes:

- `x-payshield-webhook-timestamp`: Unix timestamp in seconds.
- `x-payshield-webhook-signature`: `v1=<hex-hmac-sha256>`.
- `x-payshield-submission-id`: The same UUID as the JSON `submissionId`.

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

For a container host with a persistent volume, use the dedicated receiver
compose manifest:

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

The Docker smoke command uses a temporary host-mounted `/data/waitlist` volume
and prints redacted JSON. It should pass before the lightweight receiver is used
for production capture. GitHub Actions also runs it on every launch commit.
The compose config command validates the production handoff manifest with a
dummy secret and host data directory before an operator starts it on a receiver
host.
`compose.receiver.yml` builds `Dockerfile.receiver`, requires
`PAYSHIELD_WAITLIST_WEBHOOK_SECRET`, bind-mounts
`PAYSHIELD_RECEIVER_HOST_DATA_DIR` to `/data/waitlist`, publishes
`PAYSHIELD_RECEIVER_HOST_PORT`, adds a `/health` healthcheck, and restarts the
receiver unless stopped.

Do not use a container instance without a persistent volume for paid traffic.
The receiver writes lead data to files under `/data/waitlist`; ephemeral storage
will lose accepted leads on restart or redeploy.

After the receiver is reachable and the operator host can read the receiver data
directory, run the bundled receiver evidence sequence:

```bash
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook \
  npm run receiver:evidence -- \
  --url https://your-webhook-url \
  --data-dir /path/to/waitlist \
  --backup-dir /secure/path
```

The command verifies `GET /health`, sends a signed test payload, sends the same
payload again to prove idempotent replay, runs non-PII summary and file audit
checks, creates and verifies a protected backup, and dry-runs deletion of the
test lead without printing lead PII or the signing secret. Attach that redacted
JSON to the paid-traffic readiness issue before setting Vercel to required
webhook mode.

The lightweight receiver data files can be checked without printing emails or
notes:

```bash
npm run waitlist:data -- summary --data-dir /path/to/waitlist
npm run waitlist:data -- audit --data-dir /path/to/waitlist
npm run waitlist:data -- backup --data-dir /path/to/waitlist --backup-dir /secure/path
npm run waitlist:data -- verify-backup --backup-path /secure/path/waitlist-backup-...
```

The audit command verifies required consent metadata, `submissionId`
idempotency keys, duplicate counts, CSV/NDJSON row consistency, and receiver
file hashes without printing lead emails, names, notes, or filesystem paths.
The backup command copies the receiver files and a redacted manifest into a
timestamped directory. The copied NDJSON/CSV files contain lead data, so store
the backup outside git with restricted access and the named operator owner.
The verify-backup command confirms the copied file bytes and SHA-256 hashes
still match the redacted manifest without printing lead emails, names, notes, or
filesystem paths.

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
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret-for-your-webhook npm run webhook:test -- https://your-webhook-url --replay
```

The tester sends one sample lead, expects a 2xx response, sends the exact same
signed payload again, and prints both receiver responses without printing the
signing secret, smoke email, lead name, or note fields. The lightweight receiver
returns `duplicate: true` for the replay and does not append a second row. For
a managed receiver, use the redacted status values from this command and the
receiver storage review to fill `launch-evidence/receiver-evidence.json`, then
run `npm run receiver:managed:check -- --file launch-evidence/receiver-evidence.json`
before generating the Vercel cutover plan.

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
sensitive financial details, and free-text product inquiry notes.

`/api/health` returns public-safe readiness state. In demo mode, it returns
`waitlist.mode: "demo"` and `waitlist.paidTrafficReady: false`. After the
webhook URL, signing secret, and `PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true` are
configured, it should return `waitlist.mode: "webhook"`,
`waitlist.webhookEndpointConfigured: true`,
`waitlist.webhookSigningConfigured: true`, and
`waitlist.paidTrafficReady: true`. After Blob capture is configured, it should
return `waitlist.mode: "blob"`, `waitlist.storageConfigured: true`, and
`waitlist.paidTrafficReady: true`. After Upstash capture is configured, it
should return `waitlist.mode: "upstash"`, `waitlist.storageConfigured: true`,
and `waitlist.paidTrafficReady: true`. The endpoint does not expose the webhook
URL, signing secret, Blob read-write token, Upstash endpoint, or Upstash token.
For regulated product readiness, a configured `PAYSHIELD_LEDGER_DATABASE_URL`
only reports database presence; the Postgres ledger gate remains closed until
`npm run core:migrations:verify` succeeds and the resulting
`PAYSHIELD_LEDGER_SCHEMA_VERIFIED=true` plus
`PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION=0012` values are set for the
regulated backend environment. The live movement gate also remains closed until
`PAYSHIELD_BAAS_ADAPTER=http_json`, `PAYSHIELD_BAAS_API_BASE_URL`,
`PAYSHIELD_BAAS_PROVIDER`, and `PAYSHIELD_BAAS_API_KEY` point to the approved
BaaS/card provider adapter.

After durable capture is configured, run one explicit submission test:

```bash
npm run readiness:paid-traffic -- https://your-domain.com --expect-site-url https://your-domain.com
npm run smoke:deploy -- https://your-domain.com --expect-site-url https://your-domain.com --submit-test --require-webhook
```

Before the webhook is configured, the same readiness command may be run with
`--allow-demo-capture`; it should pass the public launch-surface checks while
warning that waitlist capture is still in demo mode.

Before campaign traffic, audit analytics instrumentation:

```bash
npm run analytics:audit
```

The audit checks that Vercel Analytics and Speed Insights are mounted, pilot
analytics event names are approved, analytics property keys are approved,
campaign metadata is limited to non-PII source/medium/campaign fields, and
track calls do not send email, names, free-text notes, consent text,
submission IDs, or sensitive UTM fields. This does not replace dashboard
confirmation after real test traffic.

Manual equivalents:

```bash
curl -I https://your-domain.com/
curl -I https://your-domain.com/ | rg 'x-content-type-options|referrer-policy|x-frame-options|strict-transport-security|permissions-policy'
curl -I https://your-domain.com/images/payshield-social-card.jpg
curl https://your-domain.com/robots.txt
curl https://your-domain.com/sitemap.xml
```

Submit one product inquiry from the site and confirm:

- The success message appears.
- The selected durable receiver stores the payload, or the response clearly says
  demo mode.
- A test URL with `utm_source`, `utm_medium`, and `utm_campaign` produces only
  sanitized `attribution` fields in the receiver or private storage path.
- Vercel logs show `request_completed`.
- Vercel Web Analytics receives `Product Inquiry Attempted` and
  `Product Inquiry Submitted` with non-PII campaign metadata.
- Vercel Speed Insights starts recording page data.
- `npm run analytics:evidence:check -- --file launch-evidence/analytics-evidence.json --site-url https://payshield-lime.vercel.app`
  passes before final go/no-go.

## Before Paid Traffic

- Confirm custom domain and `NEXT_PUBLIC_SITE_URL` match.
- Confirm Privacy Notice and Terms links work from the contact form and footer.
- Confirm the Privacy Notice discloses UTM attribution, analytics, performance
  metadata, and the analytics PII boundary before campaign traffic.
- Confirm `/.well-known/security.txt` links to private GitHub vulnerability
  reporting and the repository security policy.
- Confirm social previews use `payshield-social-card.jpg`.
- Run `npm run campaign:lint -- path/to/campaign-copy.md` against paid ads,
  emails, social posts, partner one-pagers, and alternate landing-page copy.
- Add every paid campaign draft to `docs/campaigns/manifest.json`, then run
  `npm run campaign:lint:all` and attach the manifest output before counsel
  review.
- Confirm no public copy says PayShield is a bank, claims FDIC insurance, or
  implies live money movement.
- Have counsel review the current app Privacy Notice, Terms, fintech claims, and
  provider-program disclosures.
