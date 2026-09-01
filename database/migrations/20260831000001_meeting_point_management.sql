-- +goose Up
ALTER TABLE meeting_points
  ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'hub';

CREATE INDEX IF NOT EXISTS idx_meeting_points_category ON meeting_points(category);

-- +goose Down
DROP INDEX IF EXISTS idx_meeting_points_category;
ALTER TABLE meeting_points DROP COLUMN IF EXISTS category;
