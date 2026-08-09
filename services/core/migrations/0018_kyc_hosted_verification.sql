-- Retain the provider-hosted identity verification handoff so interrupted
-- onboarding can resume without collecting identity documents in PayShield.

ALTER TABLE provider_kyc_applications
  ADD COLUMN IF NOT EXISTS verification_url TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'provider_kyc_verification_url_length_check'
  ) THEN
    ALTER TABLE provider_kyc_applications
      ADD CONSTRAINT provider_kyc_verification_url_length_check
      CHECK (verification_url IS NULL OR length(verification_url) <= 2000);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS provider_kyc_pending_expiry_idx
  ON provider_kyc_applications(status, expires_at)
  WHERE status IN ('started', 'provider_pending', 'submitted', 'manual_review');
