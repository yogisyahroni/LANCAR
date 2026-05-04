-- +goose Up
CREATE TABLE IF NOT EXISTS order_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_order_chats_order ON order_chats(order_id);
CREATE INDEX idx_order_chats_sender ON order_chats(sender_id);

-- +goose Down
DROP TABLE IF EXISTS order_chats;
