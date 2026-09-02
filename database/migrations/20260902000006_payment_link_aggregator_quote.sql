-- +goose Up
ALTER TABLE payment_links
    ADD COLUMN IF NOT EXISTS aggregator_quote_id UUID;

CREATE INDEX IF NOT EXISTS idx_payment_links_aggregator_quote
    ON payment_links (aggregator_quote_id);

-- +goose Down
DROP INDEX IF EXISTS idx_payment_links_aggregator_quote;
ALTER TABLE payment_links DROP COLUMN IF EXISTS aggregator_quote_id;
