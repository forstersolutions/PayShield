# PayShield Legal Review Packet

Status: counsel handoff packet, not legal approval.
Last updated: June 5, 2026.

Use this packet before broad public acquisition, paid ads, partner one-pagers, or
any regulated financial-service claim. It summarizes the current public
prototype surface and the specific legal/compliance questions that still need a
qualified review.

## Review Scope

- Production URL: `https://payshield-lime.vercel.app`
- Main public page: `src/app/page.tsx`
- Pilot request form: `src/app/components/waitlist-form.tsx`
- Privacy Notice: `src/app/privacy/page.tsx`
- Terms: `src/app/terms/page.tsx`
- Campaign copy guardrails: `docs/campaign-copy.md`
- Paid traffic readiness tracker: GitHub issue `#3`

## Current Positioning

The current public surface positions PayShield as a market prototype for
customer discovery, employer conversations, investor review, and banking-partner
diligence.

Approved prototype framing currently present in the product:

- "Prototype only. PayShield is not a bank."
- "Prototype ready for diligence. Regulated-money launch still needs the partner
  stack."
- Future-only public phrase: "Start with demand validation, then connect real
  money movement."
- "The prototype is ready for customer discovery, employer conversations,
  investor review, and banking-partner diligence."

Counsel should confirm this framing is sufficient for the intended campaign
audience and channel.

## Public Claims To Review

These are the highest-risk claims or near-claims currently visible in public
copy. They are intentionally presented as prototype/future mechanics, but should
still be reviewed before paid traffic.

- "A controlled ledger first. Banking rails when the partner stack is approved."
- "The front-end presents the real product mechanics: paycheck detection,
  protected internal buckets, bill-only payment routes, card authorization
  limits, emergency unlock friction, and recovery plans."
- Future-only public label: "Direct deposit split" and "A future paycheck event
  would fund obligations first and send the remainder to safe spending."
- "Card controls" and "Debit authorization checks safe spending instead of the
  total account balance."
- "Bill-only buckets" and "Rent, insurance, and vehicle money can route only to
  approved payees and expected rails."
- "The bank balance is not the truth. Safe to spend is."
- "Rent money cannot disappear into ordinary card purchases."
- "Emergency access creates a recovery plan instead of a penalty spiral."
- "Subscription-led revenue, not desperation fees."
- Pricing examples for Free, Plus, Pro, and Premium tiers.

## Required Disclaimers Currently Present

- Terms state PayShield is not a bank.
- Terms state the site does not provide banking, deposit, payment, debit card,
  bill-pay, or money movement services.
- Terms state the prototype does not represent that funds are held, insured,
  protected by FDIC insurance, or eligible for pass-through deposit insurance.
- Privacy Notice states the site does not currently open deposit accounts, move
  money, issue cards, or collect bank credentials.
- Pilot form tells users not to include bank, card, SSN, account, or routing
  numbers.

## Counsel Questions

1. Confirm whether the prototype/future framing is enough for paid search,
   social, email, and partner referral campaigns.
2. Confirm whether terms such as "Protected Paycheck OS", "protected internal
   buckets", "safe spending", and "rent money cannot disappear" create
   guarantee, UDAAP, or reliance risk.
3. Confirm whether pricing examples can remain public before real service terms,
   partner-bank contracts, and fee disclosures exist.
4. Confirm whether future-only phrases such as "direct deposit split", "card
   controls", "bill-only buckets", and similar future mechanics need stronger
   qualification or removal from paid landing pages.
5. Confirm whether the Privacy Notice and Terms are sufficient for collecting
   pilot interest, sanitized UTM attribution, Vercel Web Analytics events, and
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
   `npm run waitlist:data -- erase --email lead@example.com --dry-run`.
8. Confirm prohibited copy boundaries before any claim involving account
   opening, ACH, debit cards, virtual cards, bill-pay, money movement, FDIC, or
   sponsor-bank services.

## Evidence Commands

Run these commands and attach the outputs to the paid-traffic readiness issue
before counsel sign-off:

```bash
npm run campaign:lint -- docs/legal-review-packet.md docs/campaign-copy.md
npm run smoke:deploy -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app
npm run readiness:paid-traffic -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app --allow-prototype
```

After the production receiver or CRM is configured, add:

```bash
PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret npm run webhook:test -- https://your-webhook-url --replay
npm run smoke:deploy -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app --submit-test --require-webhook
npm run readiness:paid-traffic -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app
```

## Sign-Off Record

- Reviewer:
- Review date:
- Approved channels:
- Required edits before launch:
- Campaign copy files reviewed:
- Notes:
