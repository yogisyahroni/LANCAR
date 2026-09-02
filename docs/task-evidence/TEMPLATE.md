---
task_id: REPLACE-WITH-TASK-ID
status: PARTIAL
reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: NONE
tests: NOT_RUN
e2e: NOT_RUN
migration: NOT_RUN
observability: NOT_RUN
security_privacy: NOT_RUN
rollback_recovery: NOT_RUN
unproven_requirements: "List every requirement not yet proven."
known_blockers: NONE
locally_actionable_remaining: "List every remaining local action, or NONE."
unblock_condition: "List exact external unblock condition, or NONE."
dependency_chain_blocked: false
next_eligible_task: "NONE while this task is incomplete; set only after COMPLETE."
updated_at: 2026-09-01
---

# Evidence — REPLACE-WITH-TASK-ID

## Scope Implemented

Describe exactly what was implemented. Do not describe planned work as implemented.

## Files Changed

- `path/to/file` — what changed and why.

## Commands / Checks Run

Record commands actually executed and the real result.

```text
command:
result:
```

If a check was not run, keep its frontmatter value as `NOT_RUN` and explain why.

## Locally Actionable Remaining

List every remaining task that can be completed with repository code, local
tooling, available CI, or available test environments. This cannot be `NONE`
while status is `PARTIAL`.

## External Blockers

List exact unavailable credentials, provider, staging, legal, or other external
dependencies. Do not call ordinary implementation difficulty a blocker.

## Unblock Condition

State the exact condition needed to remove each external blocker.

## Dependency Impact

State whether downstream tasks are blocked and why. Keep
`dependency_chain_blocked: false` unless the dependency is actually blocked.

## Reality Gate Evaluation

### REALITY-2026-003 — Evidence-based Definition of Done

Status: `PARTIAL`

Evidence:

- implementation:
- tests:
- E2E/staging:
- migration/backfill:
- observability:
- security/privacy:
- rollback/recovery:

### REALITY-2026-011 — No fake completeness gate

Status: `PASS`

Confirm with evidence, not assumptions:

- no stub/TODO is being presented as complete;
- no production fake/static success remains in the implemented path;
- required UI is actually wired when GUI/app work is required;
- authoritative backend truth is used where required;
- no test/log/provider/production evidence is fabricated.

## Unproven / Remaining

List every unchecked, untested, unavailable, or not-yet-observed requirement.

If truly complete, write:

`None.`

## Next Eligible Task

Name the next task only after this task is COMPLETE. Otherwise write `None.`

## Blockers

If none:

`None.`

## Notes / N/A Justification

For every frontmatter field set to `N/A`, add a concise justification here and add
the corresponding `<field>_na_reason` frontmatter key.
