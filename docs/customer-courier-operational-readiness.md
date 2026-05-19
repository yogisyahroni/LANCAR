# Customer-Courier Workflow Operational Readiness

**Scope:** Customer web, customer mobile, courier mobile, admin-service, payment, dispatch, proof, tracking, and ledger.  
**Owner:** Operations Command + Engineering On-Call  
**Last updated:** 2026-05-19

## Status Machine

| Status | Meaning | Primary Owner | Normal Next State |
|---|---|---|---|
| `pending_payment` | Customer order exists but payment has not been confirmed | Payment ops | `pending` / ready for dispatch |
| `pending` | Payment confirmed, order is waiting for dispatch | Dispatch service | `offered` |
| `offered` | Sequential offer is active for one on-demand courier | Dispatch service | `accepted` or next courier offer |
| `accepted` | Courier accepted and should move to pickup | Courier app | `pickup_verified` |
| `pickup_verified` | Pickup scan/input and pickup photo are complete | Courier app | `delivery_started` |
| `delivery_started` | Courier is delivering to dropoff | Courier app | `delivered` |
| `delivered` | POD complete, customer can see final proof | Courier app + ledger | earning ledger credit |

## Stuck Order Diagnosis

### 1. `pending_payment` Too Long

```sql
SELECT
  o.id,
  o.order_number,
  o.status,
  o.payment_status,
  o.created_at,
  p.status AS snap_status,
  p.provider_reference,
  p.expires_at
FROM orders o
LEFT JOIN customer_payment_sessions p ON p.order_id = o.id
WHERE o.status = 'pending_payment'
  AND o.created_at < NOW() - INTERVAL '15 minutes'
ORDER BY o.created_at ASC
LIMIT 100;
```

Recovery:

- If provider says paid but order is still `pending_payment`, run the payment check endpoint or controlled payment reconciliation job.
- Do not update `orders.status` manually unless engineering runs an audited repair script.
- If payment expired, let customer retry payment from web/mobile.

### 2. Paid Order Without Dispatch

```sql
SELECT
  o.id,
  o.order_number,
  o.status,
  o.payment_status,
  o.updated_at,
  COUNT(d.id) AS dispatch_count
FROM orders o
LEFT JOIN courier_offer_dispatches d ON d.order_id = o.id
WHERE o.payment_status IN ('paid', 'settlement', 'capture')
  AND o.status IN ('pending', 'paid')
  AND o.updated_at < NOW() - INTERVAL '5 minutes'
GROUP BY o.id, o.order_number, o.status, o.payment_status, o.updated_at
HAVING COUNT(d.id) = 0
ORDER BY o.updated_at ASC
LIMIT 100;
```

Recovery:

- Verify service is on-demand and pickup/dropoff coordinates are valid.
- Check active zone and eligible courier count before triggering dispatch recovery.
- Re-dispatch through service code or admin action only, not raw SQL.

### 3. Dispatch Expired Repeatedly

```sql
SELECT
  d.order_id,
  o.order_number,
  COUNT(*) FILTER (WHERE d.status = 'expired') AS expired_count,
  COUNT(*) FILTER (WHERE d.status = 'rejected') AS rejected_count,
  MAX(d.updated_at) AS last_attempt_at
FROM courier_offer_dispatches d
JOIN orders o ON o.id = d.order_id
WHERE d.created_at >= NOW() - INTERVAL '2 hours'
GROUP BY d.order_id, o.order_number
HAVING COUNT(*) FILTER (WHERE d.status = 'expired') >= 3
ORDER BY last_attempt_at DESC
LIMIT 100;
```

Recovery:

- Check zone availability, courier on-duty count, vehicle capability, service coverage, and FCM/socket health.
- If no eligible courier exists, hold order and notify customer with a calm operational message.
- Do not broadcast to many couriers at once; sequential TTL offer remains the concurrency-safe policy.

### 4. Accepted Without Pickup Progress

```sql
SELECT
  o.id,
  o.order_number,
  o.status,
  ol.courier_id,
  MAX(cl.recorded_at) AS last_location_at,
  COUNT(ps.id) FILTER (WHERE ps.scan_type IN ('pickup', 'pickup_scan')) AS pickup_scan_count,
  COUNT(ps.id) FILTER (WHERE ps.scan_type = 'pickup_photo') AS pickup_photo_count
FROM orders o
JOIN order_legs ol ON ol.order_id = o.id
LEFT JOIN courier_locations cl ON cl.order_id = o.id
LEFT JOIN package_scans ps ON ps.order_id = o.id
WHERE o.status = 'accepted'
  AND o.updated_at < NOW() - INTERVAL '20 minutes'
GROUP BY o.id, o.order_number, o.status, ol.courier_id
ORDER BY o.updated_at ASC
LIMIT 100;
```

Recovery:

- Confirm courier is moving and sending valid tracking.
- If courier is at pickup but cannot verify, inspect geofence proof attempts.
- If item mismatch happens before pickup proof, courier can cancel with reason and photo.
- After pickup proof exists, cancellation by courier is blocked by policy.

### 5. Pickup Verified But Delivery Not Started

```sql
SELECT
  o.id,
  o.order_number,
  o.status,
  o.updated_at,
  COUNT(ps.id) FILTER (WHERE ps.scan_type IN ('pickup', 'pickup_scan')) AS pickup_scan_count,
  COUNT(ps.id) FILTER (WHERE ps.scan_type = 'pickup_photo') AS pickup_photo_count
FROM orders o
LEFT JOIN package_scans ps ON ps.order_id = o.id
WHERE o.status = 'pickup_verified'
  AND o.updated_at < NOW() - INTERVAL '10 minutes'
GROUP BY o.id, o.order_number, o.status, o.updated_at
ORDER BY o.updated_at ASC
LIMIT 100;
```

Recovery:

- Ask courier to refresh active task and tap delivery start if the app did not advance.
- Check backend event logs for proof validation failures.
- Do not skip delivery stage manually because customer tracking depends on lifecycle events.

### 6. Delivery Started But No POD

```sql
SELECT
  o.id,
  o.order_number,
  o.status,
  ol.courier_id,
  MAX(cl.recorded_at) AS last_location_at,
  COUNT(ps.id) FILTER (WHERE ps.scan_type = 'pod') AS pod_count
FROM orders o
JOIN order_legs ol ON ol.order_id = o.id
LEFT JOIN courier_locations cl ON cl.order_id = o.id
LEFT JOIN package_scans ps ON ps.order_id = o.id
WHERE o.status = 'delivery_started'
  AND o.updated_at < NOW() - INTERVAL '45 minutes'
GROUP BY o.id, o.order_number, o.status, ol.courier_id
ORDER BY o.updated_at ASC
LIMIT 100;
```

Recovery:

- Confirm courier is at dropoff and geofence is valid.
- If geofence fails because coordinates are wrong, escalate to ops for address correction flow.
- POD photo remains mandatory. Do not mark delivered without proof.

### 7. POD Without Ledger Credit

```sql
SELECT
  o.id,
  o.order_number,
  o.status,
  MAX(ps.created_at) AS pod_at,
  COUNT(l.id) FILTER (WHERE l.transaction_type = 'earning_credit') AS earning_credit_count
FROM orders o
JOIN package_scans ps ON ps.order_id = o.id AND ps.scan_type = 'pod'
LEFT JOIN courier_earnings_ledger l ON l.order_id = o.id
WHERE o.status = 'delivered'
GROUP BY o.id, o.order_number, o.status
HAVING COUNT(l.id) FILTER (WHERE l.transaction_type = 'earning_credit') = 0
ORDER BY pod_at DESC
LIMIT 100;
```

Recovery:

- Escalate to finance/backend for append-only ledger repair.
- Never update balance fields directly.
- Never delete or mutate existing ledger rows.
- Repair must create a new ledger entry with idempotency metadata and audit trail.

## Rollback Rules

- Application rollback is allowed when deploy causes 5xx, dispatch stall, tracking outage, or proof upload regression.
- Database rollback is not allowed for order lifecycle history, proof history, or ledger entries.
- Ledger corrections must be append-only.
- Courier offer recovery must respect sequential offer locking. Do not create competing active offers for the same order.

## Monitoring Queries

### Orders by Lifecycle Status

```sql
SELECT status, COUNT(*) AS total
FROM orders
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY status
ORDER BY total DESC;
```

### Payment Paid But Customer Cannot Track

```sql
SELECT
  o.id,
  o.order_number,
  o.status,
  o.payment_status,
  MAX(cl.recorded_at) AS last_location_at
FROM orders o
LEFT JOIN courier_locations cl ON cl.order_id = o.id
WHERE o.payment_status IN ('paid', 'settlement', 'capture')
  AND o.status IN ('accepted', 'pickup_verified', 'delivery_started')
GROUP BY o.id, o.order_number, o.status, o.payment_status
HAVING MAX(cl.recorded_at) IS NULL
    OR MAX(cl.recorded_at) < NOW() - INTERVAL '5 minutes'
ORDER BY o.updated_at ASC
LIMIT 100;
```

### Active Offers With Expired TTL Still Open

```sql
SELECT
  d.id,
  d.order_id,
  o.order_number,
  d.courier_id,
  d.status,
  d.expires_at
FROM courier_offer_dispatches d
JOIN orders o ON o.id = d.order_id
WHERE d.status = 'offered'
  AND d.expires_at < NOW()
ORDER BY d.expires_at ASC
LIMIT 100;
```

### Safety Events Requiring Ops Attention

```sql
SELECT
  order_id,
  courier_id,
  severity,
  message,
  metadata,
  created_at
FROM courier_safety_events
WHERE created_at >= NOW() - INTERVAL '24 hours'
  AND severity IN ('high', 'critical')
ORDER BY created_at DESC
LIMIT 100;
```

## Release Checklist

- [ ] Frontend build passes.
- [ ] Backend build and tests pass.
- [ ] Migration validation passes.
- [ ] Customer web can create order using saved DB address.
- [ ] Customer mobile can create order using selected pickup/dropoff.
- [ ] Payment status transitions order to dispatch-ready state.
- [ ] Courier receives one active sequential offer.
- [ ] Pickup scan/input and pickup photo are both required.
- [ ] POD is required and visible to customer.
- [ ] Ledger credit appears exactly once after POD.
- [ ] Tracking web/mobile shows same stage, ETA, and proof state.
- [ ] Rollback plan is documented and ledger-safe.
