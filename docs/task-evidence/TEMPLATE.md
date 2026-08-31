---
task_id: REPLACE-WITH-TASK-ID
status: PARTIAL
reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: NONE
tests: NOT_RUN
e2e_staging: NOT_RUN
migration: NOT_RUN
observability: NOT_RUN
security_privacy: NOT_RUN
rollback_recovery: NOT_RUN
unproven_requirements: "List every requirement not yet proven."
known_blockers: NONE
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

## Blockers

If none:

`None.`

## Notes / N/A Justification

For every frontmatter field set to `N/A`, add a concise justification here and add
the corresponding `<field>_na_reason` frontmatter key.
