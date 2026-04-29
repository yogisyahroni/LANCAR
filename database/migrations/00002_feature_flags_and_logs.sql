-- +goose Up

CREATE TABLE feature_flags (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key           VARCHAR(100) UNIQUE NOT NULL,
    is_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    config        JSONB,
    description   TEXT NOT NULL,
    category      VARCHAR(50) NOT NULL DEFAULT 'general',
    require_checklist BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by    UUID REFERENCES users(id),
    updated_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_feature_flags_key ON feature_flags(key);
CREATE INDEX idx_feature_flags_category ON feature_flags(category);
CREATE INDEX idx_feature_flags_enabled ON feature_flags(is_enabled);

CREATE TABLE feature_flag_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key             VARCHAR(100) NOT NULL,
    is_enabled      BOOLEAN NOT NULL,
    config          JSONB,
    description     TEXT,
    category        VARCHAR(50),
    require_checklist BOOLEAN,
    updated_by      UUID NOT NULL REFERENCES users(id),
    change_reason   TEXT NOT NULL,
    checklist_data  JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feature_flag_logs_key ON feature_flag_logs(key);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_feature_flag_log_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'feature_flag_logs is an immutable audit table';
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER trg_prevent_feature_flag_log_update
BEFORE UPDATE OR DELETE ON feature_flag_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_feature_flag_log_update();
-- +goose StatementEnd

-- Insert existing feature flags if any
INSERT INTO feature_flags (key, is_enabled, description, category, require_checklist) VALUES 
('three_legs_relay', false, 'Enable 3-Legs Relay Model', 'routing', true)
ON CONFLICT DO NOTHING;

-- +goose Down
DROP TRIGGER IF EXISTS trg_prevent_feature_flag_log_update ON feature_flag_logs;
DROP FUNCTION IF EXISTS prevent_feature_flag_log_update;
DROP TABLE IF EXISTS feature_flag_logs;
DROP TABLE IF EXISTS feature_flags;
