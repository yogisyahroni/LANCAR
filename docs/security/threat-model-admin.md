# Threat model — admin and operations

The admin service is reachable through the authenticated admin portal only.
Risks include role bypass, arbitrary payment/order rewrite, sensitive location
disclosure, unsafe campaign rollout, and shared credentials. Controls are
role-scoped routes, TOTP/idempotency for mutations, maker-checker where
high-impact, append-only audit records, minimal views, and kill-switch/recovery
ownership. Owner: Operations/Security.
