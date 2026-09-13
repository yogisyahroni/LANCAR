# CRM campaign operations runbook

Canonical UI: `https://admin.bawain.my.id` → Platform Operations → CRM.
Canonical API: `https://api.bawain.my.id`.

1. Create a DRAFT with a market, governed audience, `budget_version`, and a
   promo funding breakdown whose total equals the budget.
2. Use Preview audience. The UI labels the result as an estimate; it is not a
   guaranteed conversion count.
3. Submit approval. A super-admin completes the TOTP-protected publication
   transition to `SCHEDULED` or `ACTIVE`.
4. Dispatch only with an approved, market/locale/channel-matching marketing
   template. Missing templates fail honestly and do not create a delivered
   claim.
5. Review treatment/holdout metrics. Metrics include completed order count and
   canonical completed revenue; coupon redemption alone is insufficient.
6. Pause or stop the campaign when spend, refund, margin, support or spam
   guardrails breach. Every state mutation is audited with actor and prior state.

## Failure handling

- A communication provider failure leaves the exposure and marks delivery/event
  failed; it does not change order state.
- A repeated internal conversion request is idempotent at the exposure row.
- A market or consent mismatch is rejected before recipient resolution.
- Payment/OTP provider issues are escalated to the vendor coordination queue;
  do not insert a fake success or provider reference.
