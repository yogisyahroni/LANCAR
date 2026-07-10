-- +goose Up
-- ============================================================
-- Migration 20260708000001: Fix courier_locations Partitions
-- TEMBUS Hyperlocal Delivery Platform
-- ============================================================
-- URGENT: Tabel courier_locations sudah PARTITION BY RANGE tapi
-- hanya ada partisi untuk Mei 2026. Tanpa partisi aktif, INSERT
-- GPS kurir dari Juni 2026 ke atas akan GAGAL dengan error:
--   "no partition of relation ... found for row"
-- Migration ini membuat partisi untuk sisa 2026 + Q1 2027.
-- ============================================================

-- +goose NO TRANSACTION
-- ─────────────────────────────────────────────────────────────────
-- Buat partisi yang SUDAH LEWAT (backfill historis)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courier_locations_2026_06
    PARTITION OF courier_locations
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- ─────────────────────────────────────────────────────────────────
-- Buat partisi BULAN INI — Juli 2026 (KRITIS: diperlukan sekarang)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courier_locations_2026_07
    PARTITION OF courier_locations
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- ─────────────────────────────────────────────────────────────────
-- Buat partisi masa depan 2026
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courier_locations_2026_08
    PARTITION OF courier_locations
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE IF NOT EXISTS courier_locations_2026_09
    PARTITION OF courier_locations
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE IF NOT EXISTS courier_locations_2026_10
    PARTITION OF courier_locations
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS courier_locations_2026_11
    PARTITION OF courier_locations
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE IF NOT EXISTS courier_locations_2026_12
    PARTITION OF courier_locations
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- ─────────────────────────────────────────────────────────────────
-- Buat partisi buffer 2027 Q1
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courier_locations_2027_01
    PARTITION OF courier_locations
    FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE IF NOT EXISTS courier_locations_2027_02
    PARTITION OF courier_locations
    FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE IF NOT EXISTS courier_locations_2027_03
    PARTITION OF courier_locations
    FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

-- ─────────────────────────────────────────────────────────────────
-- DEFAULT PARTITION: Safety net — tangkap data yang jatuh di luar
-- semua partisi yang terdefinisi. Mencegah INSERT failure.
-- CATATAN: Data di default partition tidak bisa di-partition pruning
-- tapi lebih baik tersimpan daripada error.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courier_locations_default
    PARTITION OF courier_locations DEFAULT;

-- ─────────────────────────────────────────────────────────────────
-- Index lokal untuk partisi baru (PostgreSQL 11+ auto-inherits index
-- dari parent tapi explicit index di child partition lebih efisien)
-- ─────────────────────────────────────────────────────────────────
-- Spatial index untuk tiap partisi aktif (query GPS terdekat)
CREATE INDEX IF NOT EXISTS idx_cl_2026_07_spatial
    ON courier_locations_2026_07 USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_cl_2026_07_courier_time
    ON courier_locations_2026_07(courier_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_cl_2026_08_spatial
    ON courier_locations_2026_08 USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_cl_2026_08_courier_time
    ON courier_locations_2026_08(courier_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_cl_2026_09_spatial
    ON courier_locations_2026_09 USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_cl_2026_09_courier_time
    ON courier_locations_2026_09(courier_id, recorded_at DESC);

-- +goose Down
-- Hapus partisi dalam urutan terbalik
-- PERINGATAN: Ini akan menghapus semua data GPS di partisi tersebut!
DROP TABLE IF EXISTS courier_locations_default;
DROP TABLE IF EXISTS courier_locations_2027_03;
DROP TABLE IF EXISTS courier_locations_2027_02;
DROP TABLE IF EXISTS courier_locations_2027_01;
DROP TABLE IF EXISTS courier_locations_2026_12;
DROP TABLE IF EXISTS courier_locations_2026_11;
DROP TABLE IF EXISTS courier_locations_2026_10;
DROP TABLE IF EXISTS courier_locations_2026_09;
DROP TABLE IF EXISTS courier_locations_2026_08;
DROP TABLE IF EXISTS courier_locations_2026_07;
DROP TABLE IF EXISTS courier_locations_2026_06;
