# Security incident tabletop — 2026-09-14

This is the executed local tabletop for `SECPLAT-2026-009`. It exercises the
security incident runbook's response invariants for credential compromise,
suspected data exposure, privileged Admin compromise, and forged/replayed
callbacks.

## Traceability

- Command: `python scripts/security/run_incident_tabletop.py --output docs/security/security-incident-tabletop-2026-09-14.json`
- Evidence: `security-incident-tabletop-2026-09-14.json`
- Environment: local deterministic tabletop; no provider, customer, courier or regulator contacted
- Result: 4/4 scenarios PASS

## Explicit limits

The run proves local response contracts only. It does not prove provider
revocation, production PAM/break-glass operation, market-specific privacy
notification deadlines, regulator contact execution, or a live callback
replay. No secret values, raw PII, credentials or provider payloads are stored
in the evidence.

Each scenario has an owner and a concrete gap in the JSON record. Those gaps
remain release follow-ups and must be rerun in an approved staging/provider or
production-safe window before the relevant capability is enabled.
