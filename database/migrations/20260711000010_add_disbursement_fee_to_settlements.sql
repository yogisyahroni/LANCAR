-- +goose Up
ALTER TABLE merchant_settlements 
ADD COLUMN disbursement_fee_idr BIGINT NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE merchant_settlements 
DROP COLUMN disbursement_fee_idr;
