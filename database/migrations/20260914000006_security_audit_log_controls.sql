-- +goose Up
-- Security incident investigation controls for the canonical cross-service
-- audit_logs table. History is immutable to application roles; retention is
-- an explicit, bounded maintenance function instead of an application DELETE.

-- Keep retention cleanup available to the existing operational maintenance
-- path without granting DELETE to service roles.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION tembus_cleanup_audit_logs(
    max_age_days INTEGER DEFAULT 365,
    batch_size INTEGER DEFAULT 1000
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    cutoff TIMESTAMPTZ;
    deleted_rows BIGINT := 0;
    batch_deleted BIGINT;
BEGIN
    IF max_age_days < 1 OR batch_size < 1 THEN
        RAISE EXCEPTION 'audit retention parameters must be positive';
    END IF;

    cutoff := NOW() - make_interval(days => max_age_days);
    LOOP
        WITH batch AS (
            SELECT ctid
            FROM audit_logs
            WHERE created_at < cutoff
            ORDER BY created_at, id
            LIMIT batch_size
        )
        DELETE FROM audit_logs AS target
        USING batch
        WHERE target.ctid = batch.ctid;

        GET DIAGNOSTICS batch_deleted = ROW_COUNT;
        deleted_rows := deleted_rows + batch_deleted;
        EXIT WHEN batch_deleted < batch_size;
    END LOOP;

    RETURN deleted_rows;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION reject_audit_log_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- PostgreSQL's migration/maintenance owner is the only direct cleanup
    -- identity. Application roles must use the SECURITY DEFINER function.
    IF TG_OP = 'DELETE' AND current_user IN ('postgres', 'tembus_audit_maintainer') THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'audit_logs are append-only; use a compensating record or controlled retention cleanup';
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();

-- Service roles can emit/read their audit records but cannot rewrite history or
-- bypass retention through direct table mutation. Use a catalog lookup so a
-- fresh install remains valid if a role is not present yet.
-- +goose StatementBegin
DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['tembus_auth', 'tembus_admin', 'tembus_order', 'tembus_payment'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM %I', role_name);
        END IF;
    END LOOP;
END;
$$;
-- +goose StatementEnd

REVOKE ALL ON FUNCTION tembus_cleanup_audit_logs(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tembus_cleanup_audit_logs(INTEGER, INTEGER) TO tembus_order;

COMMENT ON TABLE audit_logs IS
'Canonical cross-service audit stream. Application roles may append/read only; updates/deletes are rejected and retention uses tembus_cleanup_audit_logs.';

-- +goose Down
DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
DROP FUNCTION IF EXISTS reject_audit_log_mutation();
REVOKE ALL ON FUNCTION tembus_cleanup_audit_logs(INTEGER, INTEGER) FROM tembus_order;
DROP FUNCTION IF EXISTS tembus_cleanup_audit_logs(INTEGER, INTEGER);
