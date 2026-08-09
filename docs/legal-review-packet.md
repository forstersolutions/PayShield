# PayShield Counsel Review Packet

## Product Scope

PayShield is a Grayston Technologies product for US households. Customers can
purchase a membership, verify identity, connect an eligible account, detect
income, allocate deposits to protected buckets, view Safe to Spend, approve
payment destinations, schedule bills and transfers, control an eligible card,
unlock protected funds with recovery records, and export account activity.

## Review Surfaces

- Public product page and membership checkout.
- Account onboarding, identity verification, bank connection, and direct deposit.
- Safe to Spend calculation and protected bucket behavior.
- Payee enrollment, bill payment, transfer, card, unlock, and recovery flows.
- Subscription renewal, cancellation, delinquency, and account closure.
- Privacy Notice, Terms of Use, support communications, and error messages.
- Provider and sponsor disclosures supplied for the contracted program.

## Required Decisions

Counsel should approve:

- Product entity, contracting entity, governing law, venue, and notices.
- Exact account, card, deposit, funds availability, insurance, provider, sponsor,
  and fee language.
- Membership price presentation, automatic renewal, cancellation, refunds, and
  failed-payment handling.
- KYC/AML consent, sanctions, eligibility, adverse-action or denial handling, and
  identity-provider data flow.
- Electronic communications and electronic-signature consent.
- ACH and card authorization language, transaction limits, holds, reversals,
  disputes, errors, unauthorized activity, and timing.
- Protected bucket and unlock descriptions, including customer responsibility
  for rules and consequences of releasing protected funds.
- Privacy collection, use, disclosure, retention, deletion, analytics, security,
  subprocessors, state rights, and children provisions.
- Complaint handling, customer support availability, record retention, account
  restriction, suspension, termination, and business continuity.
- Accessibility and marketing claims.

## Evidence

The approval record must identify the reviewed commit and production copy,
reviewer, date, scope, provider program, required changes, and final status. Do
not store privileged legal advice or provider secrets in the repository.

Record the final redacted gate through the operator console or
`POST /api/launch/gate-evidence`. Keep
`PAYSHIELD_REGULATED_COUNSEL_SIGNOFF=false` and
`PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED=false` until the signed approval is
effective for the production provider program.

Contact: `support@graystontechnologies.com`
