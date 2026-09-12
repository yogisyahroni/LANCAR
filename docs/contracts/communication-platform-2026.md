# Communication Platform Contract — 2026

Vertical services emit semantic events, never FCM/APNs/SMS/WhatsApp provider
payloads. A canonical event includes recipient, market, locale, category,
priority, entity/order reference, template key/version and correlation ID.
`communication_events` is idempotent on `event_id`; `communication_deliveries`
is unique per event/channel. The existing `notifications` table is the in-app
inbox projection and order chat tables remain the order communication source of
truth.

## Policy

Categories are `order`, `safety`, `security`, `support`, `system` and
`marketing`. Order/safety/security critical communication cannot be disabled by
a marketing opt-out. Optional preferences are scoped by category/channel and
include timezone and quiet hours; every change is audited with a
market-compliance consent source. Marketing has no SMS/email/WhatsApp fallback
unless an explicit consent and market capability policy exists.

Channel enablement and estimated cost are market-scoped in
`communication_channel_capabilities`. The staging `id-jk` profile enables only
in-app and push; SMS, email, WhatsApp and masked calling remain explicitly
disabled until their vendor/capability contract is configured. Disabled
channels are recorded as suppressed, never as successful delivery.

## Push, fallback and receipts

Device tokens are scoped by account/device/app/surface/version. Registration
retires a token previously attached to the same device under another account;
logout retires the current token. Invalid provider tokens are retired through
the lifecycle adapter and excluded from sends. Delivery status is queued, sent,
delivered, read, failed, suppressed or dead-letter. Provider adapters classify
permanent 4xx/410 errors as dead-letter and retry bounded transient failures
with exponential backoff. A provider outage is non-fatal to order state.

Push deep links are typed `tembus://orders/<id>` or
`tembus://<entity-type>/<id>` and clients must reconcile an authoritative
snapshot before an action. Push is never an authoritative mutation.

## Chat, masking and access

Order chat is scoped to the order and re-checks participant authorization on
every send/read operation. Text and links containing phone/contact details are
masked. Attachment requests are rejected until the moderation path is active;
the reserved policy is image/jpeg, image/png or image/webp, at most 10 MiB,
virus/malware scan required, no executable/archive content, and no client URL
is trusted as proof of a completed scan. Reports must enter Support/Safety
workflows, and Support access is role/need based and audited. Ordinary chat
retention is 30 days; safety report metadata/evidence is retained according to
the configured legal hold and is not mixed into ordinary chat cleanup. Raw
contact lists and unmasked phone numbers are never returned by normal
messaging APIs.

## Template governance

Templates are versioned by key, market, locale, channel and category. Required
variables must appear in the body before save. Protected legal/financial/safety
copy requires approved status. The admin delivery-health view aggregates channel
and status only; it does not browse private inbox content.

Protected copy is created through the protected-draft maker endpoint and can
only be promoted by the separate admin approver endpoint. The ordinary template
save endpoint cannot self-approve protected copy.

Live vendor activation for OTP, payment and external SMS/WhatsApp/telephony is
a release follow-up. Local adapter, policy, retry, idempotency, masking and
failure behavior are verified without presenting fixtures as vendor proof.
