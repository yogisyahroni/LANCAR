-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-001: Vehicle Type 'sepeda'
-- Tambahkan 'sepeda' ke CHECK constraint courier_profiles.vehicle_type
-- ============================================================

-- Constraint asli inline di CREATE TABLE → nama default postgres:
-- courier_profiles_vehicle_type_check
ALTER TABLE courier_profiles DROP CONSTRAINT IF EXISTS courier_profiles_vehicle_type_check;
ALTER TABLE courier_profiles
  ADD CONSTRAINT courier_profiles_vehicle_type_check
  CHECK (vehicle_type IN ('bebek', 'matic', 'sport', 'sepeda'));

-- +goose Down
ALTER TABLE courier_profiles DROP CONSTRAINT IF EXISTS courier_profiles_vehicle_type_check;
ALTER TABLE courier_profiles
  ADD CONSTRAINT courier_profiles_vehicle_type_check
  CHECK (vehicle_type IN ('bebek', 'matic', 'sport'));
