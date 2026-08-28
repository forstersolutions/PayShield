# Money Rails Operations

## Ledger

Supabase PostgreSQL owns household identity, protected bucket controls,
double-entry journals, provider events, payment schedules, bank sync jobs,
reconciliation exceptions, and closure requests. Vercel connects through the
transaction pooler with a maximum pool size of two per function instance.

Apply `services/core/migrations` first, then `supabase/migrations`:

```bash
PAYSHIELD_LEDGER_DATABASE_URL="<pooler-uri>" npm run supabase:schema:apply
PAYSHIELD_LEDGER_DATABASE_URL="<pooler-uri>" npm run supabase:schema:verify
```

The platform migration forces RLS and removes `anon` and `authenticated` Data
API access from every ledger table. The customer application uses authenticated
Vercel APIs only.

## Paycheck Flow

1. The customer connects an income account through Plaid Link.
2. PayShield encrypts and stores the access token server-side.
3. Plaid transaction webhooks create durable sync jobs.
4. Vercel processes the job after the webhook response; the daily maintenance
   route retries anything left queued.
5. Matching deposits post one balanced journal entry.
6. Buckets fund in priority order and the remainder becomes Safe to Spend.
7. Duplicate deposits return the prior result by idempotency key.

## Bill And Transfer Flow

- A destination must be verified and assigned to one protected bucket.
- Amounts cannot exceed the destination limit or bucket availability.
- Provider execution is recorded before local settlement status advances.
- Unknown, mismatched, or ambiguous provider events enter reconciliation.
- Posted journal rows are immutable; corrections use reversals.

## Card Flow

- Authorization checks card status, merchant controls, and Safe to Spend.
- Protected money is excluded from ordinary purchases.
- Approved bill destinations can use only their assigned bucket.
- Every decision records its provider reference and idempotency key.

## Closure Flow

An accepted closure request immediately blocks new money actions and pauses
automation. The durable worker closes provider resources, revokes Plaid,
removes the RevenueCat customer, deletes the Clerk identity, and completes local
closure only after required external steps succeed. Failed steps retry from the
stored request. Submitted transfers and bills remain available for settlement
and reconciliation.

## Operations

- Vercel Cron calls `/api/jobs/maintenance` with `CRON_SECRET` daily.
- Plaid sync and closure also run immediately after their initiating response.
- Review open reconciliation exceptions before enabling or changing live rails.
- Rotate webhook, provider, Clerk, RevenueCat, and encryption secrets one at a
  time and run deployed smoke checks after each change.
- Keep live money disabled during database restore, provider incident, or ledger
  verification failure.

## Activation Order

1. Supabase schema and security verification.
2. Clerk production authentication.
3. RevenueCat sandbox products and webhook.
4. Plaid sandbox Link, exchange, webhook, sync, disconnect, and replay tests.
5. Banking-provider sandbox onboarding, account, card, transfer, bill, reversal,
   and reconciliation tests.
6. Counsel, sponsor, and operating-runbook approvals.
7. Controlled live-money activation and physical-device smoke tests.
