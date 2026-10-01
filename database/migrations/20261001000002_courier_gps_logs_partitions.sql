-- +goose Up
-- Keep courier GPS sync durable across month boundaries. The original table
-- only shipped with May/June 2026 partitions, which made every later sync
-- fail with "no partition of relation courier_gps_logs found for row".

CREATE TABLE IF NOT EXISTS courier_gps_logs_2026_07
    PARTITION OF courier_gps_logs
    FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS courier_gps_logs_2026_08
    PARTITION OF courier_gps_logs
    FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS courier_gps_logs_2026_09
    PARTITION OF courier_gps_logs
    FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS courier_gps_logs_2026_10
    PARTITION OF courier_gps_logs
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS courier_gps_logs_2026_11
    PARTITION OF courier_gps_logs
    FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS courier_gps_logs_2026_12
    PARTITION OF courier_gps_logs
    FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS courier_gps_logs_2027_01
    PARTITION OF courier_gps_logs
    FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS courier_gps_logs_2027_02
    PARTITION OF courier_gps_logs
    FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS courier_gps_logs_2027_03
    PARTITION OF courier_gps_logs
    FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');

-- Future timestamps are retained instead of crashing the tracking sync. A
-- later scheduled partition rollout can move those rows into named months.
CREATE TABLE IF NOT EXISTS courier_gps_logs_default
    PARTITION OF courier_gps_logs DEFAULT;

-- +goose Down
DROP TABLE IF EXISTS courier_gps_logs_default;
DROP TABLE IF EXISTS courier_gps_logs_2027_03;
DROP TABLE IF EXISTS courier_gps_logs_2027_02;
DROP TABLE IF EXISTS courier_gps_logs_2027_01;
DROP TABLE IF EXISTS courier_gps_logs_2026_12;
DROP TABLE IF EXISTS courier_gps_logs_2026_11;
DROP TABLE IF EXISTS courier_gps_logs_2026_10;
DROP TABLE IF EXISTS courier_gps_logs_2026_09;
DROP TABLE IF EXISTS courier_gps_logs_2026_08;
DROP TABLE IF EXISTS courier_gps_logs_2026_07;
