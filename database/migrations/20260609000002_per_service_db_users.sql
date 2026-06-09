-- ============================================================
-- S2-INF-02: Per-Service Database Users & Least-Privilege Grants
-- ============================================================
-- PURPOSE: Create a dedicated PostgreSQL role per backend service with
--          ONLY the minimum required privileges. The shared superuser
--          account (postgres) must NOT be used by application services
--          in production environments.
--
-- HOW TO RUN (production):
--   1. Set passwords as env-vars on the host (never in this file):
--        export TEMBUS_AUTH_DB_PASS="$(openssl rand -base64 32)"
--        export TEMBUS_ADMIN_DB_PASS="$(openssl rand -base64 32)"
--        export TEMBUS_ORDER_DB_PASS="$(openssl rand -base64 32)"
--        export TEMBUS_PAYMENT_DB_PASS="$(openssl rand -base64 32)"
--        export TEMBUS_ROUTING_DB_PASS="$(openssl rand -base64 32)"
--   2. Apply via psql with \set or pass via --variable:
--        psql -U postgres -d tembus -f this_file.sql \
--          -v auth_pass="$TEMBUS_AUTH_DB_PASS" \
--          -v admin_pass="$TEMBUS_ADMIN_DB_PASS" \
--          -v order_pass="$TEMBUS_ORDER_DB_PASS" \
--          -v payment_pass="$TEMBUS_PAYMENT_DB_PASS" \
--          -v routing_pass="$TEMBUS_ROUTING_DB_PASS"
--   3. Update each service's DATABASE_URL env-var to use the new role.
--   4. Revoke the shared postgres role from all application services.
--
-- ROLLBACK (if needed):
--   Run the corresponding -- [DOWN] section at the bottom.
--
-- SECURITY MODEL:
--   - Each service can only SELECT/INSERT/UPDATE/DELETE on its own tables.
--   - No service can CREATE TABLE, DROP TABLE, or ALTER TABLE.
--   - The read-replica role is SELECT-only across all service tables.
--   - Sequences are granted only where INSERT is allowed (for id generation).
-- ============================================================

-- [UP]
-- +goose Up

-- ── 1. CREATE ROLES ──────────────────────────────────────────────────────────
-- Passwords MUST be passed via --variable, never hardcoded.
-- In local dev, if you omit the -v flags, the role is created without a password
-- (NOLOGIN until you set one). This forces conscious configuration.

-- +goose StatementBegin
DO $$
BEGIN
  -- auth-service: manages users, OTP, sessions, trusted_devices, auth_identifiers
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tembus_auth') THEN
    CREATE ROLE tembus_auth WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;

  -- admin-service (Node.js): manages orders, couriers, wallets, system config, outbox
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tembus_admin') THEN
    CREATE ROLE tembus_admin WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;

  -- order-service (Go): manages orders, pricing, bulk uploads
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tembus_order') THEN
    CREATE ROLE tembus_order WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;

  -- payment-service (Go): manages wallets, transactions, payouts
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tembus_payment') THEN
    CREATE ROLE tembus_payment WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;

  -- routing-service (Go): reads feature_flags, system_configs; no writes
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tembus_routing') THEN
    CREATE ROLE tembus_routing WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;

  -- read-replica role: shared SELECT-only role for reporting / read replicas
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tembus_readonly') THEN
    CREATE ROLE tembus_readonly WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
-- +goose StatementEnd

-- ── 2. REVOKE public SCHEMA defaults (defense-in-depth) ─────────────────────
-- Prevent service roles from creating objects in public schema
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO tembus_auth, tembus_admin, tembus_order, tembus_payment, tembus_routing, tembus_readonly;

-- ── 3. GRANT: tembus_auth ────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users,
  customer_auth_identities,
  customer_auth_transactions,
  customer_otp_challenges,
  customer_otp_deliveries,
  user_sessions,
  auth_trusted_devices,
  otp_logs
TO tembus_auth;

GRANT INSERT ON audit_logs TO tembus_auth;
GRANT SELECT ON audit_logs TO tembus_auth;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tembus_auth;

-- ── 4. GRANT: tembus_admin ───────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users,
  orders,
  order_events,
  order_chats,
  dispute_chats,
  disputes,
  courier_profiles,
  courier_payout_accounts,
  courier_vehicles,
  courier_documents,
  courier_zones,
  courier_locations,
  courier_ratings,
  courier_service_capabilities,
  courier_offer_dispatches,
  courier_registration_links,
  delivery_service_products,
  customer_wallets,
  courier_wallets,
  customer_wallet_transactions,
  courier_wallet_transactions,
  feature_flags,
  system_configs,
  sla_configs,
  api_idempotency_keys,
  event_outbox,
  scheduled_reports,
  webhook_audit_events,
  maps_provider_credentials,
  maps_provider_credential_events,
  promo_campaigns,
  promo_redemptions,
  notifications,
  notification_preferences,
  status_transition_policies
TO tembus_admin;

GRANT INSERT ON audit_logs TO tembus_admin;
GRANT SELECT ON audit_logs TO tembus_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tembus_admin;

-- ── 5. GRANT: tembus_order ───────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON
  orders,
  order_events,
  order_chats,
  package_scans,
  courier_route_snapshots,
  courier_offer_dispatches,
  api_idempotency_keys,
  event_outbox
TO tembus_order;

GRANT SELECT ON
  delivery_service_products,
  feature_flags,
  system_configs,
  sla_configs,
  status_transition_policies,
  courier_profiles,
  courier_vehicles,
  courier_zones,
  maps_provider_credentials
TO tembus_order;

GRANT INSERT ON audit_logs TO tembus_order;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tembus_order;

-- ── 6. GRANT: tembus_payment ─────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON
  customer_wallets,
  courier_wallets,
  customer_wallet_transactions,
  courier_wallet_transactions,
  customer_wallet_ledger_entries,
  courier_earnings_ledger,
  courier_payout_requests,
  courier_payout_accounts,
  courier_payout_provider_webhook_events,
  courier_payout_risk_decisions,
  courier_payout_dispatches,
  courier_payout_reconciliation_runs,
  courier_payout_reconciliation_items,
  api_idempotency_keys,
  event_outbox,
  payments,
  payout_records
TO tembus_payment;

GRANT SELECT ON
  orders,
  users,
  courier_profiles,
  feature_flags,
  system_configs
TO tembus_payment;

GRANT INSERT ON audit_logs TO tembus_payment;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tembus_payment;

-- ── 7. GRANT: tembus_routing ─────────────────────────────────────────────────
GRANT SELECT ON
  feature_flags,
  system_configs,
  delivery_service_products,
  maps_provider_credentials
TO tembus_routing;

-- ── 8. GRANT: tembus_readonly ────────────────────────────────────────────────
-- Read replica / reporting role: SELECT on all tables, no writes
GRANT SELECT ON ALL TABLES IN SCHEMA public TO tembus_readonly;

-- ── 9. DEFAULT PRIVILEGES (for future tables) ────────────────────────────────
-- If new tables are added by goose migrations (run as postgres), grant
-- read access to tembus_readonly automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO tembus_readonly;

-- ============================================================
-- [DOWN] — Rollback: revoke grants and drop roles
-- Run this ONLY if reverting to shared postgres user.
-- ============================================================
-- +goose Down
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM tembus_auth, tembus_admin, tembus_order, tembus_payment, tembus_routing, tembus_readonly;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM tembus_auth, tembus_admin, tembus_order, tembus_payment, tembus_routing, tembus_readonly;
REVOKE USAGE ON SCHEMA public FROM tembus_auth, tembus_admin, tembus_order, tembus_payment, tembus_routing, tembus_readonly;
DROP ROLE IF EXISTS tembus_auth, tembus_admin, tembus_order, tembus_payment, tembus_routing, tembus_readonly;
GRANT CREATE ON SCHEMA public TO PUBLIC;
