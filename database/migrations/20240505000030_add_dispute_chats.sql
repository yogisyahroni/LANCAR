-- +goose Up
CREATE TABLE IF NOT EXISTS dispute_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_dispute_chats_dispute ON dispute_chats(dispute_id);
CREATE INDEX idx_dispute_chats_sender ON dispute_chats(sender_id);

-- +goose Down
DROP TABLE IF EXISTS dispute_chats;
