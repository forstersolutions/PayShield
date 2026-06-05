# Campaign Copy Guardrails

Use this guide before paid ads, email campaigns, social posts, partner one-pagers,
or alternate landing-page copy go live.

PayShield is currently a market prototype. Campaign copy can test the
safe-to-spend message, pilot interest, employer conversations, investor review,
and partner diligence. It must not imply that PayShield already offers regulated
financial services.

## Required Review Flow

1. Draft campaign copy in a text or Markdown file.
2. Run `npm run campaign:lint -- path/to/campaign-copy.md`.
3. Attach the command output to the paid-traffic readiness issue.
4. Have counsel review the final copy before broad public acquisition or any
   regulated financial-service claim.

For pasted copy:

```bash
pbpaste | npm run campaign:lint -- --stdin
```

The linter is not legal approval. It catches obvious prohibited claims before
the review step.

## Approved Prototype Positioning

- PayShield is a protected-paycheck prototype.
- PayShield helps test whether one safe-to-spend balance resonates with
  households.
- PayShield is collecting pilot interest for customer discovery, employer
  conversations, investor review, and partner diligence.
- PayShield is not a bank.
- The prototype does not open accounts, move money, issue cards, or offer FDIC
  insurance.

## Do Not Claim

- PayShield is a bank.
- Funds are FDIC insured, pass-through insured, or held by a sponsor bank.
- Users can open a deposit account.
- PayShield supports live direct deposit, ACH, debit cards, virtual cards, or
  bill-pay.
- PayShield moves money, guarantees protection, prevents every overdraft, or
  guarantees that rent will never be missed.

## Evidence To Keep

- The campaign copy file or final screenshots.
- `npm run campaign:lint` output.
- The production URL and campaign destination URL.
- Counsel/legal review note.
- Analytics event confirmation after the first controlled campaign test.
