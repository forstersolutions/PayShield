# Security Policy

PayShield is operated by Grayston Technologies as paycheck control software.
Financial accounts, cards, money movement, and insurance coverage are available
only through approved regulated partners when enabled.

## Reporting a Vulnerability

Do not open a public issue for security vulnerabilities, exposed secrets,
lead-data leaks, authentication weaknesses, or regulated-finance data handling
concerns.

Email `support@graystontechnologies.com` with a concise report and request a
secure handoff channel before sharing sensitive technical detail. The production
site also publishes `/.well-known/security.txt` with the Grayston support
contact and this policy URL.

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
