-- PayShield uses server-side PostgreSQL transactions through Supavisor. The
-- customer app never queries ledger tables through the Supabase Data API.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$roles$;

CREATE TABLE IF NOT EXISTS payshield_platform_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $security$
DECLARE
  table_name text;
  protected_tables text[] := ARRAY[
    'account_closure_requests',
    'app_users',
    'bank_connections',
    'bill_payment_schedules',
    'card_authorization_decisions',
    'commercial_billing_events',
    'commercial_checkout_intents',
    'commercial_subscriptions',
    'core_schema_migrations',
    'direct_deposit_setups',
    'household_bucket_change_events',
    'household_bucket_rules',
    'household_buckets',
    'household_money_profile_events',
    'household_money_profiles',
    'household_protection_plan_events',
    'households',
    'journal_entries',
    'journal_lines',
    'ledger_accounts',
    'money_rail_events',
    'paycheck_detection_rules',
    'paycheck_detections',
    'payee_control_events',
    'payees',
    'payshield_platform_migrations',
    'plaid_sync_jobs',
    'production_gate_evidence',
    'provider_cards',
    'provider_customers',
    'provider_events',
    'provider_financial_accounts',
    'provider_kyc_applications',
    'provider_token_secrets',
    'provider_token_vault_events',
    'reconciliation_exceptions',
    'transfer_intents',
    'unlock_requests'
  ];
BEGIN
  FOREACH table_name IN ARRAY protected_tables
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Required PayShield table public.% is missing', table_name;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated',
      table_name
    );
  END LOOP;
END
$security$;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.assert_journal_entry_balanced_by_id(text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_journal_entry_header_balanced()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_journal_entry_line_balanced()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_journal_line_household_scope()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_posted_journal_mutation()
  FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

INSERT INTO payshield_platform_migrations (version)
VALUES ('20260827185032')
ON CONFLICT (version) DO NOTHING;
