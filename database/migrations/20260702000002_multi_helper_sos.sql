-- +goose Up
CREATE TABLE IF NOT EXISTS courier_sos_helpers (
    incident_id UUID NOT NULL REFERENCES courier_sos_incidents(id) ON DELETE CASCADE,
    helper_courier_id UUID NOT NULL REFERENCES courier_profiles(id),
    status VARCHAR(50) NOT NULL DEFAULT 'ACCEPTED', -- ACCEPTED, ARRIVED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (incident_id, helper_courier_id)
);

CREATE INDEX IF NOT EXISTS idx_sos_helpers_incident ON courier_sos_helpers(incident_id);
CREATE INDEX IF NOT EXISTS idx_sos_helpers_courier ON courier_sos_helpers(helper_courier_id);

ALTER TABLE courier_sos_incidents
DROP COLUMN IF EXISTS helper_courier_id;

-- +goose Down
ALTER TABLE courier_sos_incidents
ADD COLUMN helper_courier_id UUID REFERENCES courier_profiles(id);

DROP TABLE IF EXISTS courier_sos_helpers;
