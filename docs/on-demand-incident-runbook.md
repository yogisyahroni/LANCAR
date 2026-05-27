# Runbook: On-Demand Tracking, Push, Chat, and Ledger Incident

**Owner:** Operations Command + Engineering On-Call | **Frequency:** As needed  
**Last Updated:** 2026-05-18 | **Last Run:** Not yet run in production

## Purpose

Use this runbook when an on-demand order has a customer or courier incident involving realtime tracking, push notification, in-app chat, proof upload, or courier earning ledger. The goal is to restore customer-visible status safely without corrupting ledger or order history.

This runbook covers:

- Customer cannot see courier movement.
- Courier accepted an offer but customer status does not update.
- Chat between customer and courier is delayed or missing.
- Push notification does not arrive.
- Pickup scan/photo or POD is missing from the customer view.
- Courier completed POD but earning ledger did not credit.
- Realtime observability alert appears in `order_events`.

## Prerequisites

- Admin dashboard access.
- Read access to PostgreSQL.
- Read access to Docker logs for `tembus-admin`, `tembus-redis`, and gateway.
- If changing order or ledger state, TOTP/admin approval is required.
- Known `order_id`, `order_number`, customer identifier, or courier identifier.

Local Docker defaults:

- API gateway: `http://localhost:8080`
- Admin service container: `tembus-admin`
- Database container: `tembus-db`
- Redis container: `tembus-redis`
- Admin dashboard: `http://localhost:3002`
- Customer web: `http://localhost:3000`

## Severity

| Severity | Criteria | Response |
|---|---|---|
| SEV1 | Many active on-demand orders cannot track/chat, or all push/socket traffic is failing. | Freeze risky deploys, page engineering on-call, start incident channel. |
| SEV2 | One zone or subset of orders has stale tracking, accepted offers without customer updates, or repeated proof failures. | Ops lead + backend on-call investigate within 15 minutes. |
| SEV3 | Single order/customer/courier issue with fallback polling still working. | Ops support investigates and documents resolution. |

## Procedure

### Step 1: Confirm Service Health

```powershell
docker compose ps
docker logs tembus-admin --tail 200
docker logs tembus-redis --tail 100
```

**Expected result:** `tembus-admin`, `tembus-redis`, `tembus-db`, and gateway are running with no repeated 500s.
**If it fails:** Restart only the failing service first:

```powershell
docker compose restart admin-service
docker compose restart redis
```

Do not restart the database during active incidents unless engineering approves it.

### Step 2: Check Realtime Observability Alerts

```sql
SELECT
  order_id,
  created_at,
  metadata->>'alert_type' AS alert_type,
  metadata->>'severity' AS severity,
  metadata
FROM order_events
WHERE event_type = 'realtime_observability_alert'
  AND created_at >= NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC
LIMIT 50;
```

Alert meanings:

| Alert | Meaning | First Action |
|---|---|---|
| `tracking_update_stale` | Order has courier assignment and older valid location. | Check courier app online state and `courier_locations`. |
| `accepted_without_customer_tracking_update` | Offer accepted but no valid customer-visible location yet. | Check courier tracking sync and zone/location permissions. |

**Expected result:** No recent critical alerts for active orders.  
**If it fails:** Continue to Step 3 for the impacted order.

### Step 3: Inspect Order, Courier, and Zone Linkage

Replace `:order_id` with the impacted order UUID.

```sql
SELECT
  o.id,
  o.order_number,
  o.status,
  o.model,
  o.service_code,
  o.customer_id,
  ol.courier_id,
  ol.status AS leg_status,
  cp.id AS courier_profile_id,
  cp.application_channel,
  cp.is_online,
  cp.current_zone_id,
  z.name AS zone_name,
  z.is_active AS zone_active,
  cp.last_location_at
FROM orders o
LEFT JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
LEFT JOIN courier_profiles cp ON cp.user_id = ol.courier_id
LEFT JOIN zones z ON z.id = cp.current_zone_id
WHERE o.id = :order_id;
```

**Expected result:** On-demand order has:

- `model` in `p2p`, `on_demand`, or `ondemand`
- `application_channel = on_demand`
- `is_online = true`
- active zone
- assigned courier on leg 1 after offer accepted

**If it fails:** Do not manually reassign in SQL. Use admin order controls or have engineering run a controlled dispatch recovery.

### Step 4: Check Socket Room and Realtime Logs

Search structured logs from `tembus-admin`.

```powershell
docker logs tembus-admin --since 30m | Select-String 'on_demand_realtime|order_room_join_denied|event_emitted|tracking_emit_latency_high|push_delivery_attention'
```

Important log fields:

- `domain = on_demand_realtime`
- `metric = socket_connected`
- `metric = order_room_joined`
- `metric = order_room_join_failed`
- `metric = event_emitted`
- `metric = tracking_emit_latency_ms`
- `event = push_delivery_attention`

**Expected result:** Customer and courier can join `order:{order_id}` and events are emitted.  
**If it fails:** If `order_room_join_denied`, verify the logged `user_id` is either order customer, assigned courier, or admin/ops role.

### Step 5: Verify Latest Valid Courier Location

```sql
SELECT
  cl.order_id,
  cl.courier_id,
  ST_Y(cl.location::geometry) AS latitude,
  ST_X(cl.location::geometry) AS longitude,
  cl.accuracy_m,
  cl.heading_deg,
  cl.speed_kmh,
  cl.is_spoofed,
  cl.recorded_at
FROM courier_locations cl
JOIN order_legs ol ON ol.order_id = cl.order_id
JOIN courier_profiles cp ON cp.id = cl.courier_id
WHERE cl.order_id = :order_id
  AND COALESCE(cl.is_spoofed, FALSE) = FALSE
  AND COALESCE(cl.accuracy_m, 0) <= 100
ORDER BY cl.recorded_at DESC
LIMIT 10;
```

**Expected result:** Latest valid location is less than 5 minutes old while order is active.  
**If it fails:** Check safety events.

```sql
SELECT
  created_at,
  severity,
  message,
  metadata
FROM courier_safety_events
WHERE order_id = :order_id
ORDER BY created_at DESC
LIMIT 20;
```

Common causes:

- `poor_accuracy`: courier GPS accuracy too low.
- `stale_timestamp`: app sent old location.
- `mock_location_detected`: location is blocked from customer view.
- `impossible_location_jump`: movement is physically unrealistic.

Recovery:

- Ask courier to keep app open, enable high-accuracy GPS, disable mock location, and retry sync.
- If app foreground tracking works but background stops, ask courier to tap battery optimization prompt in Profile.
- Never mark suspicious location as valid manually.

### Step 6: Check Customer Tracking API

Use a customer or admin token with access to the order.

```powershell
curl.exe -H "Authorization: Bearer <TOKEN>" "http://localhost:8080/api/v1/tracking?order_id=<ORDER_ID>"
curl.exe -H "Authorization: Bearer <TOKEN>" "http://localhost:8080/api/v1/customer/orders/<ORDER_ID>/tracking-detail"
```

**Expected result:** Response includes `stage`, `timeline`, `location`, `target`, `eta_minutes`, and proof data when available.  
**If it fails:**

- `404 Lokasi kurir belum tersedia`: go back to Step 5.
- Access denied: verify customer/courier ownership in Step 3.
- Missing route polyline only: check Google Directions key; fallback ETA is acceptable during degraded mode.

### Step 7: Check Chat Path

```sql
SELECT
  id,
  order_id,
  sender_id,
  message_type,
  LEFT(message, 120) AS message_preview,
  created_at
FROM order_chats
WHERE order_id = :order_id
ORDER BY created_at DESC
LIMIT 20;
```

Then verify logs:

```powershell
docker logs tembus-admin --since 30m | Select-String 'chat_message|new_chat_message|event_emitted'
```

**Expected result:** Message is inserted into `order_chats` and emitted as `chat_message` / `new_chat_message`.  
**If it fails:** If DB insert exists but socket event missing, customer/courier can still recover by reopening chat, because chat history is stored. Restart admin-service only if many orders have missing socket events.

### Step 8: Check Push Notification and FCM

```sql
SELECT
  id,
  user_id,
  type,
  order_id,
  title,
  created_at,
  channel
FROM notifications
WHERE order_id = :order_id
ORDER BY created_at DESC
LIMIT 20;
```

```sql
SELECT
  user_id,
  platform,
  last_active_at,
  created_at
FROM user_devices
WHERE user_id IN (
  SELECT customer_id FROM orders WHERE id = :order_id
  UNION
  SELECT courier_id FROM order_legs WHERE order_id = :order_id
)
ORDER BY last_active_at DESC;
```

Logs to inspect:

```powershell
docker logs tembus-admin --since 30m | Select-String 'FCM|push_delivery_attention|firebase_not_initialized|no_registered_devices'
```

**Expected result:** Notification row exists and FCM has a registered token.  
**If it fails:**

- `firebase_not_initialized`: verify `FIREBASE_SERVICE_ACCOUNT`.
- `no_registered_devices`: ask user to open app and re-login to register token.
- Invalid token cleanup is automatic; ask user to open app again after cleanup.

### Step 9: Check Pickup/POD Proof State

```sql
SELECT
  id,
  scan_type,
  photo_url,
  override_reason,
  location_accuracy_m,
  scanned_at,
  created_at
FROM package_scans
WHERE order_id = :order_id
ORDER BY COALESCE(scanned_at, created_at) ASC;
```

Expected on-demand proof sequence:

1. `pickup_scan` or `pickup`
2. `pickup_photo`
3. `pod`

Rules:

- Courier cannot start delivery until pickup scan/input code and pickup photo both exist.
- Courier cannot complete delivery without POD photo.
- Courier cannot cancel after pickup proof exists.
- Proof must be inside geofence.

If proof is rejected, inspect:

```sql
SELECT
  proof_step,
  proof_status,
  rejection_reason,
  distance_m,
  radius_m,
  accuracy_m,
  created_at
FROM courier_proof_attempts
WHERE order_id = :order_id
ORDER BY created_at DESC
LIMIT 20;
```

### Step 10: Check Courier Earning Ledger After POD

```sql
SELECT
  id,
  courier_id,
  order_id,
  source,
  direction,
  amount_idr,
  settlement_status,
  transaction_type,
  metadata,
  created_at
FROM courier_earnings_ledger
WHERE order_id = :order_id
ORDER BY created_at DESC;
```

**Expected result:** After `pod`, there is one `direction = credit`, `source = delivery`, `transaction_type = earning_credit`, `settlement_status = available`.  
**If it fails:**

- Verify order status is `delivered`.
- Verify `order_legs.courier_id` matches the courier.
- Do not insert ledger rows manually without engineering approval.
- Use a controlled repair script or admin-only endpoint with audit trail if available.

Ledger safety rule:

- Never update courier balance directly.
- Never delete ledger rows.
- Corrections must be appended as new ledger entries with a clear `transaction_type` and metadata.

## Recovery Playbooks

### Customer Cannot Track Courier

1. Confirm order assignment in Step 3.
2. Check latest valid location in Step 5.
3. Check tracking API in Step 6.
4. Check socket room logs in Step 4.
5. Ask courier to foreground app and send location sync.
6. If location remains blocked, inspect `courier_safety_events`; do not expose blocked location.

### Courier Accepted, Customer Status Did Not Update

1. Check `order_events` for `offer_accepted`.
2. Check notification row type `courier_assigned`.
3. Check realtime logs for `offer_accepted` and `courier_otw_pickup`.
4. If notification exists but push missing, follow Step 8.
5. If socket event failed for many orders, restart `admin-service`.

### Chat Missing

1. Check `order_chats`.
2. If row exists, ask both apps to reopen chat to load stored history.
3. Check socket auth and `join_order_room`.
4. If row does not exist, retry send from app; capture request error.

### POD Completed But Courier Earning Missing

1. Confirm `package_scans.scan_type = pod`.
2. Confirm `orders.status = delivered`.
3. Check ledger query in Step 10.
4. Escalate to backend on-call for controlled ledger repair.
5. Do not update available balance directly.

### Push Notification Missing

1. Confirm notification row exists.
2. Confirm `user_devices` has current token.
3. Check `FIREBASE_SERVICE_ACCOUNT`.
4. Check logs for FCM failures.
5. Ask user to open app and re-login if token absent.

## Verification

- [ ] Active order appears correctly in customer tracking API.
- [ ] Customer web/mobile shows current stage without manual refresh, or polling fallback updates within expected interval.
- [ ] Courier app can send tracking sync and chat.
- [ ] Customer and courier chat history appears from DB.
- [ ] Proof sequence is correct: pickup scan/input, pickup photo, POD.
- [ ] POD completion creates exactly one courier earning credit.
- [ ] No new `realtime_observability_alert` for the same order after recovery.

## Rollback

Rollback only application code or service deployment. Do not rollback database state by deleting rows.

Safe rollback:

```powershell
docker compose pull admin-service
docker compose up -d admin-service
```

If rollback is from a Git deployment:

```powershell
git log --oneline -5
git revert <bad_commit_sha>
```

Database rollback rules:

- Do not delete `order_events`, `package_scans`, `courier_locations`, or `courier_earnings_ledger`.
- If a ledger correction is required, append a compensating ledger row with audit metadata.
- If an order needs operational cancellation after pickup proof, escalate. Courier cancellation is intentionally blocked after pickup.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `accepted_without_customer_tracking_update` alert | Courier accepted but app has not synced valid location. | Ask courier to foreground app and retry location sync; check GPS permissions and mock-location safety events. |
| `tracking_update_stale` alert | Courier tracking stopped while order active. | Check app background optimization, network, Redis/admin logs; restart admin-service only for broad outage. |
| Customer tracking API returns `Lokasi kurir belum tersedia` | No valid courier location accepted. | Inspect `courier_locations` and `courier_safety_events`; keep blocked locations hidden. |
| Push missing but notification exists | FCM token missing/invalid or Firebase not initialized. | Check `user_devices`, FCM logs, and `FIREBASE_SERVICE_ACCOUNT`; ask user to reopen app. |
| Chat row exists but UI not updating | Socket room join or emit issue. | Check `join_order_room`, auth token, and `event_emitted` logs; reopening chat loads DB fallback. |
| POD exists but earning missing | Ledger credit failed or was skipped due zero payout. | Check order payout fields and ledger; escalate for append-only repair. |
| Customer sees stale ETA/polyline | Google Directions unavailable or cache fallback. | Verify API key and provider logs; fallback haversine ETA is acceptable degraded mode. |

## Escalation

| Situation | Contact | Method |
|---|---|---|
| SEV1, multi-order realtime outage | Engineering on-call + Ops lead | Incident channel + phone |
| Ledger missing/duplicate/incorrect | Backend lead + Finance ops | Incident channel, require audit note |
| Suspected location fraud or mock GPS | Trust & Safety / Ops command | Courier safety queue |
| Firebase project/token issue | Mobile lead + Backend on-call | Incident channel |
| Google Maps route/ETA outage | Backend on-call | Incident channel, degraded mode accepted |

## Pre-National Deploy Checklist

- [ ] `FIREBASE_SERVICE_ACCOUNT` configured in staging and production.
- [ ] Customer and courier real devices register FCM tokens.
- [ ] WebSocket auth works for customer, courier, admin, and ops roles.
- [ ] `join_order_room` succeeds only for customer, assigned courier, admin, super_admin, or ops.
- [ ] Tracking sync creates valid `courier_locations`.
- [ ] Mock/stale/poor-accuracy locations are blocked and create `courier_safety_events`.
- [ ] Tracking API returns stage, timeline, ETA, target, and valid location.
- [ ] Chat works foreground and reloads from DB after reconnect.
- [ ] Pickup scan/input and pickup photo are both required before delivery.
- [ ] POD is required before completion.
- [ ] Ledger earning credit is append-only and idempotent after POD.
- [ ] Realtime metrics are visible in logs and Redis key pattern `metrics:on_demand_realtime:*`.
- [ ] `realtime_observability_alert` appears only when deliberately simulated.

## History

| Date | Run By | Notes |
|---|---|---|
| 2026-05-18 | Codex | Initial runbook created for P3 on-demand incident operations. |
