# Sandbox

Sandbox credentials are provisioned with `environment: sandbox` and are
separate from live credentials. Sandbox order creation returns a deterministic
safe response shape with `financial_obligation_created: false` and
`provider_call: false`; it does not call the payment, risk, or external
provider integrations. Sandbox orders are stored only in the developer
platform's isolated sandbox table and are scoped to the owning client and user.

Live requests use the canonical order-service endpoints with a short-lived
server-generated owner token. This preserves normal authorization, pricing,
idempotency, state-machine, and payment/risk invariants. API keys, webhook
secrets, JWT secrets, and encryption keys must never be committed or copied
into task evidence, logs, or screenshots.
