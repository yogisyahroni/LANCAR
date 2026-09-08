# Payment provider outage runbook

## Trigger

Use when payment authorization/callback latency, provider 5xx, signature
verification failures, reconciliation lag or the payment circuit breaker alert
exceeds the SLO threshold.

## Contain

1. Assign IC and Payments/Finance owner; record the first callback/payment
   correlation ID and affected provider/market.
2. Confirm the provider status using an approved channel without copying
   credentials or raw payment payloads into the incident.
3. Keep checkout/payment success fail-closed. Do not mark an order paid from a
   client response, timeout, guessed callback or stale cache.
4. Let the provider adapter breaker and bounded retry budget work. Stop
   non-idempotent retries and pause risky rollout/payment configuration changes.
5. Keep verified callbacks and idempotency records durable; queue/retry
   provider reconciliation with the existing operation key.

## Recover

1. Probe the provider through the adapter only after the configured cooldown;
   verify signature, amount/currency and order identity.
2. Replay callbacks idempotently, then compare provider status to local payment,
   order, refund and ledger records.
3. Release customer-facing payment flow only after callback success, queue age,
   error budget and reconciliation mismatch are within threshold.
4. If a payment was acknowledged externally but local state is uncertain,
   quarantine it for Finance reconciliation; never fabricate success/refund.

## Evidence

Record detection, breaker state, retry count, queued/replayed count,
reconciliation result, customer communication and postmortem action owners.
Redact tokens, signatures, card data, raw provider body and customer identity.

