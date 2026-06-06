# Security Policy

PayShield is currently a commercial planning app. It does not process live funds,
open deposit accounts, issue cards, move money, or collect bank credentials.

## Reporting a Vulnerability

Do not open a public issue for security vulnerabilities, exposed secrets,
lead-data leaks, authentication weaknesses, or regulated-finance data handling
concerns.

Use GitHub private vulnerability reporting for this repository. If that flow is
temporarily unavailable, contact a repository maintainer through a private
channel first and wait for a secure place to share details.
The production site also publishes `/.well-known/security.txt` with the private
advisory link and this policy URL.

Include:

- Affected URL, route, script, dependency, or configuration.
- Reproduction steps and expected impact.
- Whether any personal data, credentials, webhook secrets, or Vercel
  environment values may be exposed.

Do not include:

- Real pilot lead data.
- Bank credentials, account numbers, cards, SSNs, or government IDs.
- Production webhook secrets, Vercel tokens, GitHub tokens, or other live
  credentials.

## Production Security Baseline

- GitHub secret scanning and push protection are enabled.
- GitHub Dependabot security updates are enabled.
- GitHub private vulnerability reporting is enabled.
- `npm run verify` includes a production dependency audit.
- Vercel deployment smoke checks verify browser security headers and
  `/.well-known/security.txt`.
- Waitlist webhook payloads support HMAC-SHA256 signatures and timestamp replay
  checks.

## Regulated-Finance Scope

Any future live-money release must complete sponsor-bank, BaaS, KYC/AML,
ledgering, ACH/card, dispute, disclosure, support, and counsel review before
handling regulated financial activity.
