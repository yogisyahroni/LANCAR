# TEMBUS Ads reliability runbook

## Failure behavior

1. Placement requests have a strict 2s timeout.
2. Gateway `ads-service` circuit breaker/bulkhead opens on upstream failure.
3. Customer Experience renders organic/house fallback and keeps checkout,
   payment, tracking, support and emergency journeys independent.
4. Billing writes use a database transaction and campaign row lock. Reporting
   may lag without permitting spend beyond total/daily caps.

## Signals

Track placement latency/success, no-fill, candidate count, rejection reason,
auction latency, budget exhaustion, prevented overspend, event replay/loss,
attribution backlog, billing mismatch and invalid-traffic rate. Redact raw
identities and delivery secrets from logs.

## Recovery checks

- Verify `/health` and `/ready` for Ads Service.
- Verify organic-only placement response while Ads is unavailable.
- Inspect `ads_billing_events` idempotency and `ads_campaign_revisions` before
  any repair.
- Correct invalid traffic with a credit/reversal event; never update/delete
  merchant statement history.
- Reconcile served events ↔ Ads ledger ↔ merchant statement before re-opening a
  payment hold or suspended campaign.

## Load and release drill

Run the Ads unit/concurrency suite, gateway resilience suite, migration checks,
then a staging placement request at expected Home/Food QPS. A failed Ads
dependency must be observed while a checkout/order request remains healthy.
