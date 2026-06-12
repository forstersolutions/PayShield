# Campaign Copy Guardrails

Use this guide before paid ads, email campaigns, social posts, partner one-pagers,
or alternate landing-page copy go live.

PayShield is a commercial paycheck-control product surface. Campaign copy can
promote Safe to Spend, customizable protected buckets, and provider-ready
controls while staying clear that PayShield does not offer regulated financial
services until approved provider activation is complete.

## Required Review Flow

1. Draft campaign copy in a text or Markdown file under `docs/campaigns/`.
2. Run `npm run campaign:lint -- path/to/campaign-copy.md`.
3. Add every paid ad, email, social, partner, and alternate landing-page draft
   to `docs/campaigns/manifest.json`.
4. Run `npm run campaign:lint:all` so every listed draft is checked together.
5. Attach the command output to the paid-traffic readiness issue.
6. Have counsel review the final copy before broad public acquisition or any
   regulated financial-service claim.
7. Attach `docs/legal-review-packet.md` and `npm run legal:lint` output for the
   launch-surface review.

For pasted copy:

```bash
pbpaste | npm run campaign:lint -- --stdin
```

The linter is not legal approval. It catches obvious prohibited claims before
the review step.

## Approved Commercial Positioning

- PayShield is paycheck control software for households that need one reliable
  Safe to Spend number.
- PayShield helps households shape protected bucket rules before the week gets
  loud.
- PayShield can support household, employer, investor, and partner
  conversations without bank credentials or money movement.
- Account opening, card controls, and money movement stay locked until approved
  provider credentials, disclosures, and operating controls are active.
- The current public app does not provide financial services.

## Do Not Claim

- Do not say PayShield or Grayston Technologies is a bank.
- Do not say funds are FDIC insured, pass-through insured, or held by a sponsor
  bank.
- Do not say users can open a deposit account.
- Do not say PayShield supports live direct deposit, ACH, debit cards, virtual
  cards, or bill-pay.
- Do not say PayShield moves money, guarantees protection, prevents every
  overdraft, or guarantees that rent will never be missed.

## Evidence To Keep

- The campaign copy file or final screenshots.
- `npm run campaign:lint:all` output from the manifest.
- `npm run campaign:lint` output for any pasted or unmanifested one-off copy.
- `npm run legal:lint` output and the current legal review packet.
- The production URL and campaign destination URL.
- Counsel/legal review note.
- Analytics event confirmation after the first controlled campaign test.
