# Courier document and vehicle compliance contract — 2026

This contract extends the canonical courier lifecycle with server-owned
document and vehicle verification. It applies to courier registration, admin
review, matching eligibility, and reverification communication.

## Document model

`courier_documents` remains the source of truth for document evidence. Each
record carries:

- `doc_type`, `document_number`, `issued_at`, and `expires_at`;
- `document_status`: `pending_review`, `verified`, `rejected`, `expired`,
  `revoked`, or `retention_expired`;
- `verification_source`, reviewer fields, and revocation reason;
- private `storage_key`, storage provider/access class, checksum, MIME type,
  and `retention_until`.

`is_verified` is retained as a compatibility projection. A document is
eligible only when its canonical status is `verified`, it is not revoked or
retention-expired, and its expiry has not passed.

## Vehicle model

`courier_vehicles` is the source of truth for the primary vehicle. Make,
model, type/category, plate, production year, engine CC, engine type, and
maximum capacity are structured fields. The admin vehicle review endpoint
normalizes and validates these values before updating the legacy profile
projection.

## Eligibility and access

The database function `courier_profile_documents_eligible(profile_id)` is the
server-side policy used by activation, matching, surge supply, SOS/tracking
support, and operational reporting. Expiry/revocation cannot be bypassed by a
client toggle; the document trigger suspends an active courier immediately,
and the compliance worker marks time-based expiries.

Sensitive document reads require a compliance-admin role plus TOTP, return
through the private document path only, and write `courier_document_access_log`.
The auth service also enforces owner-or-compliance-admin authorization before
serving private courier document files.

## Reverification

The compliance worker creates idempotent reminder records for 30-day, 7-day,
and day-of expiry windows. Delivery is delegated to the existing Communication
notification platform through `createNotification`; failed deliveries remain
retryable.
