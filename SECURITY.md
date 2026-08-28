# Security Policy

PayShield is operated by Grayston Technologies.

## Report A Vulnerability

Email `support@graystontechnologies.com` and request a secure handoff channel
before sharing sensitive details. Do not open a public issue for vulnerabilities
or exposed personal, financial, authentication, provider, or infrastructure data.

Include the affected route or component, reproduction steps, expected impact,
and whether any account or credential may have been exposed. Do not include real
account numbers, card data, government identifiers, bank credentials, access
tokens, signing secrets, or production customer records in the initial message.

## Security Baseline

- Clerk protects account access and stable subjects map to isolated households.
- Vercel Functions execute authenticated money-control operations server-side.
- Supabase PostgreSQL stores an immutable, household-scoped double-entry ledger.
- Ledger tables use forced row-level security and are unavailable to Supabase
  `anon` and `authenticated` Data API roles.
- Provider and Plaid callbacks are signature verified against exact raw bodies.
- Money writes and provider events are idempotent and reconciled.
- Provider access tokens are encrypted in server-side custody.
- Database credentials and provider secrets remain server-only Vercel
  environment variables and never ship in the website or mobile bundle.
- Public health exposes no configuration or readiness detail.
- `npm run verify` includes tests, route parity, infrastructure controls,
  migration checks, production build, and dependency audit.

Production response procedures are maintained in
`docs/money-rails-production.md` and the approved external operations runbooks.
