-- +goose Up
-- PKG-2026-004: arrival is a server-recorded custody prerequisite.  Pickup
-- evidence may only be submitted after the courier has transitioned the
-- assigned on-demand order to pickup_arrived.
INSERT INTO status_transition_policies (
  workflow_role,
  from_status,
  to_status,
  label,
  description,
  requires_proof,
  requires_admin,
  display_order
) VALUES (
  'on_demand',
  'accepted',
  'pickup_arrived',
  'Konfirmasi tiba di pickup',
  'Kurir wajib mengonfirmasi sudah tiba di titik pickup sebelum verifikasi wajah atau bukti paket.',
  FALSE,
  FALSE,
  25
)
ON CONFLICT (workflow_role, from_status, to_status) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  requires_proof = EXCLUDED.requires_proof,
  requires_admin = EXCLUDED.requires_admin,
  is_active = TRUE,
  display_order = EXCLUDED.display_order,
  version = status_transition_policies.version + 1,
  updated_at = NOW();

-- package_scans is an evidence ledger.  Corrections must be represented by a
-- new event/attempt; mutating an existing scan would destroy custody history.
-- Retention cleanup may still delete expired rows according to the existing
-- data-retention policy.
CREATE OR REPLACE FUNCTION prevent_package_scan_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'package_scans is append-only; write a compensating scan instead';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_package_scan_update ON package_scans;
CREATE TRIGGER trg_prevent_package_scan_update
BEFORE UPDATE ON package_scans
FOR EACH ROW
EXECUTE FUNCTION prevent_package_scan_update();

-- +goose Down
DROP TRIGGER IF EXISTS trg_prevent_package_scan_update ON package_scans;
DROP FUNCTION IF EXISTS prevent_package_scan_update;

DELETE FROM status_transition_policies
WHERE workflow_role = 'on_demand'
  AND from_status = 'accepted'
  AND to_status = 'pickup_arrived';
