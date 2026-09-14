# Mobile rollout promotion gate

The mobile workflow builds release artifacts and can validate a redacted
release metrics packet before an operator increases the rollout stage. The
promotion sequence is strictly:

`none → internal → alpha → beta → percentage`

`.github/workflows/android-apps.yml` exposes this as a manual
`workflow_dispatch`. It does not call Play Console or claim that a store
rollout occurred. The operator must provide a committed packet path and use a
workflow SHA that matches the packet's release commit.

## Packet requirements

The packet must contain:

- traceable commit, app version, config schema, release notes and SHA-256 for
  the candidate and rollback artifacts;
- the current and target rollout stages, percentage and approval state;
- active-order and support recovery flags;
- backend compatibility for both legacy and new clients with at least the
  policy compatibility window;
- a time-bounded metrics window and enough samples for crash-free sessions,
  ANR, payment success and create-order success.

The thresholds are versioned in `scripts/mobile/rollout_policy.json`. Any
missing field, stage skip, artifact traceability failure, compatibility
failure, recovery disablement or guardrail breach fails closed. The command
prints only the packet digest and validation errors; packets must not contain
PII, tokens or provider secrets.

For a local contract check:

```powershell
python scripts/mobile/test_staged_rollout.py
```

For an actual promotion packet, run the same command used by CI with the
workflow commit as `--expected-commit`. A PASS is a pre-promotion control
result, not proof of Play Store execution or live payment-provider behavior.
