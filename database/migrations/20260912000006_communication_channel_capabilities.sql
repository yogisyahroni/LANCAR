-- +goose Up

-- Market-scoped channel capability and cost policy. Provider activation is
-- explicit; disabled channels remain suppressed rather than pretending that
-- a vendor delivery succeeded.
CREATE TABLE IF NOT EXISTS communication_channel_capabilities (
  market_code VARCHAR(40) NOT NULL,
  channel VARCHAR(24) NOT NULL CHECK (channel IN ('in_app','push','sms','email','whatsapp','masked_call')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  consent_required BOOLEAN NOT NULL DEFAULT TRUE,
  cost_minor BIGINT NOT NULL DEFAULT 0 CHECK (cost_minor >= 0),
  fallback_rank INT NOT NULL DEFAULT 0 CHECK (fallback_rank >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market_code, channel)
);

INSERT INTO communication_channel_capabilities(market_code,channel,enabled,consent_required,cost_minor,fallback_rank)
VALUES
  ('id-jk','in_app',TRUE,FALSE,0,1),
  ('id-jk','push',TRUE,FALSE,0,2),
  ('id-jk','sms',FALSE,TRUE,0,3),
  ('id-jk','email',FALSE,TRUE,0,4),
  ('id-jk','whatsapp',FALSE,TRUE,0,5),
  ('id-jk','masked_call',FALSE,TRUE,0,6)
ON CONFLICT (market_code,channel) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS communication_channel_capabilities;
