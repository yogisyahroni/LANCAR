-- Migration: Customer Google Auth + Zenziva OTP Infrastructure
-- Description: Creates tables for Google identity linking, auth transactions,
--              OTP challenges, and OTP delivery audit. Replaces plaintext OTP pattern.
-- Reversible: YES (see DOWN section at the bottom)

-- ─────────────────────────────────────────────────────────────
-- UP
-- ─────────────────────────────────────────────────────────────

-- 1. customer_auth_identities
--    Stores external login providers per customer (e.g., Google).
--    provider_subject is the stable Google "sub" claim.
CREATE TABLE IF NOT EXISTS customer_auth_identities (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider            TEXT        NOT NULL,                -- 'google'
    provider_subject    TEXT        NOT NULL,                -- Google sub claim (stable)
    provider_email      TEXT,                               -- email from provider at link time
    email_verified      BOOLEAN     NOT NULL DEFAULT false,
    linked_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at        TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique partial index: one active identity per provider+subject
CREATE UNIQUE INDEX IF NOT EXISTS uidx_customer_auth_identities_provider_subject_active
    ON customer_auth_identities (provider, provider_subject)
    WHERE revoked_at IS NULL;

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_customer_auth_identities_user_provider
    ON customer_auth_identities (user_id, provider);

-- ─────────────────────────────────────────────────────────────

-- 2. customer_auth_transactions
--    Short-lived (10 min) state for OAuth flows, OTP challenges, and account linking.
--    state_hash, nonce_hash, device_id_hash are SHA-256 hashes — never raw values.
CREATE TABLE IF NOT EXISTS customer_auth_transactions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    type                TEXT        NOT NULL,                -- 'google_start', 'google_complete', 'otp_send', 'link_google', 'step_up'
    status              TEXT        NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'expired', 'consumed'
    provider            TEXT,                               -- 'google', null
    user_id             UUID,                               -- set once user is identified
    identifier_hash     TEXT,                               -- hash of email or phone used in transaction
    state_hash          TEXT,                               -- hash of OAuth state param (one-time)
    nonce_hash          TEXT,                               -- hash of OIDC nonce (one-time)
    device_id_hash      TEXT,                               -- hash of device_id
    platform            TEXT        NOT NULL DEFAULT 'unknown', -- 'web', 'android_customer'
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
    consumed_at         TIMESTAMPTZ,
    metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_auth_transactions_status_expires
    ON customer_auth_transactions (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_customer_auth_transactions_identifier_created
    ON customer_auth_transactions (identifier_hash, created_at)
    WHERE identifier_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_auth_transactions_device_created
    ON customer_auth_transactions (device_id_hash, created_at)
    WHERE device_id_hash IS NOT NULL;

-- ─────────────────────────────────────────────────────────────

-- 3. customer_otp_challenges
--    Single source of truth for OTP. OTP codes are NEVER stored plaintext.
--    code_hash is HMAC-SHA256(code, OTP_HASH_PEPPER). 
CREATE TABLE IF NOT EXISTS customer_otp_challenges (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id      UUID        NOT NULL REFERENCES customer_auth_transactions(id) ON DELETE CASCADE,
    user_id             UUID,                               -- null if user is not yet identified
    purpose             TEXT        NOT NULL,               -- 'registration_phone', 'new_device', 'link_google', 'password_reset', 'step_up'
    identifier_hash     TEXT        NOT NULL,               -- hash of phone number
    recipient_mask      TEXT        NOT NULL,               -- e.g. '+62******7890' shown to user
    channel             TEXT        NOT NULL,               -- 'whatsapp', 'sms'
    provider            TEXT        NOT NULL,               -- 'zenziva', 'dry_run'
    code_hash           TEXT        NOT NULL,               -- HMAC-SHA256(code, pepper) — never plaintext
    attempts            INT         NOT NULL DEFAULT 0,
    max_attempts        INT         NOT NULL DEFAULT 5,
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
    used_at             TIMESTAMPTZ,
    locked_until        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_otp_challenges_transaction_expires
    ON customer_otp_challenges (transaction_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_customer_otp_challenges_identifier_created
    ON customer_otp_challenges (identifier_hash, created_at);

CREATE INDEX IF NOT EXISTS idx_customer_otp_challenges_provider_channel_created
    ON customer_otp_challenges (provider, channel, created_at);

-- ─────────────────────────────────────────────────────────────

-- 4. customer_otp_deliveries
--    Audit trail for every OTP send attempt (success, failure, fallback).
--    Idempotent on (provider, provider_message_id).
CREATE TABLE IF NOT EXISTS customer_otp_deliveries (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id        UUID        NOT NULL REFERENCES customer_otp_challenges(id) ON DELETE CASCADE,
    provider            TEXT        NOT NULL,               -- 'zenziva', 'dry_run'
    channel             TEXT        NOT NULL,               -- 'whatsapp', 'sms'
    provider_message_id TEXT,                               -- message id returned by Zenziva
    status              TEXT        NOT NULL,               -- 'accepted', 'sent', 'delivered', 'failed', 'fallback'
    error_code          TEXT,                               -- provider-internal error code (not shown to customer)
    sent_at             TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    failed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency index: reject duplicate deliveries from same provider+message_id
CREATE UNIQUE INDEX IF NOT EXISTS uidx_customer_otp_deliveries_provider_msgid
    ON customer_otp_deliveries (provider, provider_message_id)
    WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_otp_deliveries_challenge_created
    ON customer_otp_deliveries (challenge_id, created_at);

-- ─────────────────────────────────────────────────────────────

-- 5. Feature Flags for Google Auth
--    Inserted with is_enabled = false so features are off by default.
INSERT INTO feature_flags (key, is_enabled, description, created_at, updated_at)
VALUES
    ('customer_google_login_enabled',        false, 'Enable Google login for customer web and Android', now(), now()),
    ('customer_google_registration_enabled', false, 'Enable Google registration for new customers', now(), now()),
    ('customer_google_linking_enabled',      false, 'Allow existing customers to link their Google account', now(), now()),
    ('customer_new_device_otp_required',     true,  'Require OTP step-up on new/untrusted devices', now(), now()),
    ('otp_provider_live',                    false, 'Use live Zenziva provider instead of dry_run', now(), now())
ON CONFLICT (key) DO UPDATE SET
    description = EXCLUDED.description,
    updated_at  = now();

-- ─────────────────────────────────────────────────────────────
-- DOWN
-- ─────────────────────────────────────────────────────────────
-- To roll back this migration, run:
--
-- DELETE FROM feature_flags
--   WHERE key IN (
--     'customer_google_login_enabled',
--     'customer_google_registration_enabled',
--     'customer_google_linking_enabled',
--     'customer_new_device_otp_required',
--     'otp_provider_live'
--   );
--
-- DROP TABLE IF EXISTS customer_otp_deliveries;
-- DROP TABLE IF EXISTS customer_otp_challenges;
-- DROP TABLE IF EXISTS customer_auth_transactions;
-- DROP TABLE IF EXISTS customer_auth_identities;
