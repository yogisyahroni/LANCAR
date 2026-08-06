-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-002: Role 'merchant' di users
-- Ikuti pola 20260604000001_maps_runtime_credentials.sql
-- ============================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'customer',
    'courier',
    'merchant',
    'ops_security',
    'ops_admin',
    'finance_admin',
    'cs_agent',
    'zone_manager',
    'super_admin'
  ));

-- +goose Down
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'customer',
    'courier',
    'ops_security',
    'ops_admin',
    'finance_admin',
    'cs_agent',
    'zone_manager',
    'super_admin'
  ));
