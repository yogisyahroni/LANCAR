-- +goose Up

CREATE TABLE IF NOT EXISTS merchant_notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    new_order_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    order_cancellations BOOLEAN NOT NULL DEFAULT TRUE,
    daily_summary_reports BOOLEAN NOT NULL DEFAULT TRUE,
    promotional_updates BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- +goose Down

DROP TABLE IF EXISTS merchant_notification_preferences;
