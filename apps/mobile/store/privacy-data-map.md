# Store privacy declarations

This map is the source for App Store Privacy and Google Play Data safety forms.
It must be reconciled against the configured production providers before each
submission.

| Data | Collected | Linked to identity | Primary purpose |
| --- | --- | --- | --- |
| Name and email | Yes | Yes | Account management and support |
| Government identity/KYC data | Provider hosted | Yes | Identity verification and compliance |
| Financial account and transaction data | Yes | Yes | Paycheck detection and money controls |
| Purchase and subscription history | Yes | Yes | Paid access and customer support |
| User and device identifiers | Yes | Yes | Authentication, fraud prevention, and security |
| Product interaction and diagnostics | Yes | Usually | Reliability, security, and support |

PayShield does not sell personal data or use financial data for third-party
advertising. Plaid and the selected banking/card provider receive data required
to perform the services the household requests. RevenueCat receives app user,
product, transaction, and entitlement data required for subscription access.

Required submission checks:

- Confirm Clerk, RevenueCat, Plaid, banking/card provider, Vercel, and AWS data
  practices against the live configuration.
- Publish the exact production privacy policy before review.
- Complete Apple privacy nutrition labels and Google Data safety answers in the
  store consoles; Fastlane cannot submit those questionnaires.
- Add account-deletion instructions and verify deletion from inside the app.
