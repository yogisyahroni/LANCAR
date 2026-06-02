-- +goose Up
ALTER TABLE courier_safety_events
  DROP CONSTRAINT IF EXISTS courier_safety_events_event_type_check;

ALTER TABLE courier_safety_events
  ADD CONSTRAINT courier_safety_events_event_type_check
  CHECK (
    event_type IN (
      'sos',
      'report_sender',
      'report_recipient',
      'prohibited_goods',
      'road_incident',
      'support_request',
      'recipient_unavailable',
      'address_not_found',
      'package_issue',
      'return_required',
      'failed_delivery',
      'route_issue'
    )
  );

-- +goose Down
ALTER TABLE courier_safety_events
  DROP CONSTRAINT IF EXISTS courier_safety_events_event_type_check;

ALTER TABLE courier_safety_events
  ADD CONSTRAINT courier_safety_events_event_type_check
  CHECK (
    event_type IN (
      'sos',
      'report_sender',
      'report_recipient',
      'prohibited_goods',
      'road_incident',
      'support_request'
    )
  );
