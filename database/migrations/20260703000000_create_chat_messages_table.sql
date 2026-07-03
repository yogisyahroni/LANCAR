-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    sender_name VARCHAR(255),
    sender_role VARCHAR(50),
    message_text TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_order_id ON chat_messages(order_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS chat_messages;

-- +goose StatementEnd
