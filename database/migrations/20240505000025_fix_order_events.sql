-- +goose Up
-- +goose StatementBegin
DO $$ 
BEGIN
  IF EXISTS(SELECT *
    FROM information_schema.columns
    WHERE table_name='order_events' and column_name='status')
  THEN
      ALTER TABLE "public"."order_events" RENAME COLUMN "status" TO "event_type";
  END IF;

  IF EXISTS(SELECT *
    FROM information_schema.columns
    WHERE table_name='order_events' and column_name='message')
  THEN
      ALTER TABLE "public"."order_events" RENAME COLUMN "message" TO "description";
  END IF;
END $$;
ALTER TABLE order_events ADD COLUMN IF NOT EXISTS metadata JSONB;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$ 
BEGIN
  IF EXISTS(SELECT *
    FROM information_schema.columns
    WHERE table_name='order_events' and column_name='event_type')
  THEN
      ALTER TABLE "public"."order_events" RENAME COLUMN "event_type" TO "status";
  END IF;

  IF EXISTS(SELECT *
    FROM information_schema.columns
    WHERE table_name='order_events' and column_name='description')
  THEN
      ALTER TABLE "public"."order_events" RENAME COLUMN "description" TO "message";
  END IF;
END $$;
ALTER TABLE order_events DROP COLUMN IF EXISTS metadata;
-- +goose StatementEnd
