# LANCAR Task Evidence Protocol

This directory contains verifiable evidence for implementation progress in
`task-food-marketplace-parity-2026.md`.

The protocol exists to enforce:

- `REALITY-2026-003 — Evidence-based Definition of Done`
- `REALITY-2026-011 — No fake completeness gate`

## One file per TASK-ID

Evidence path:

`docs/task-evidence/<TASK-ID>.md`

Example:

`docs/task-evidence/CORE-2026-002.md`

Use `TEMPLATE.md` as the starting point.

## When an evidence file is required

As soon as any checklist item under a `TASK-ID` is changed from `[ ]` to `[x]`,
the corresponding evidence file is mandatory.

This intentionally applies to partial progress as well as full completion.

## Status rules

### PARTIAL

Use when some checklist items are proven but the task is not fully complete.

- checked boxes may represent only proven items;
- unresolved boxes remain unchecked;
- evidence must say what remains;
- unrun checks remain `NOT_RUN`;
- no completion claim is allowed.

### BLOCKED

Use when a real dependency prevents completion, such as unavailable credentials,
provider sandbox, required environment, legal decision, or unresolved upstream
contract.

A blocker is not permission to fake the missing result.

### COMPLETE

Use only when:

- every checklist box in that task section is checked;
- `REALITY-2026-003: PASS`;
- `REALITY-2026-011: PASS`;
- a real implementation reference exists;
- each applicable verification category is `PASS`;
- each non-applicable category is `N/A` with a reason;
- `unproven_requirements: NONE`;
- `known_blockers: NONE`.

## Machine-readable frontmatter

Every evidence file must begin with:

```yaml
---
task_id: CORE-2026-001
status: PARTIAL
reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: "<commit/PR/ref or NONE while blocked>"
tests: NOT_RUN
e2e_staging: NOT_RUN
migration: N/A
migration_na_reason: "No persistent schema change."
observability: NOT_RUN
security_privacy: NOT_RUN
rollback_recovery: NOT_RUN
unproven_requirements: "Describe remaining proof."
known_blockers: NONE
updated_at: 2026-09-01
---
```

Allowed values for verification/gate fields:

- `PASS`
- `PARTIAL`
- `FAIL`
- `NOT_RUN`
- `N/A`

For a `COMPLETE` task, applicability fields may only be `PASS` or `N/A`.
Every `N/A` field requires `<field>_na_reason`.

Example:

```yaml
migration: N/A
migration_na_reason: "No database schema or persisted data changed."
```

## Evidence body

The report must contain these headings:

- `## Scope Implemented`
- `## Files Changed`
- `## Commands / Checks Run`
- `## Reality Gate Evaluation`
- `## Unproven / Remaining`

Useful additional sections include:

- API/contract evidence
- screenshots or staging references
- migration/backfill evidence
- observability evidence
- security/privacy review
- rollback/recovery
- provider sandbox evidence
- reconciliation evidence
- accessibility evidence

Do not paste secrets, credentials, tokens, raw customer PII, or restricted provider
payloads into evidence reports.

## What counts as evidence

Good evidence:

- commit/PR SHA or URL;
- exact test command and real output summary;
- exact build/typecheck/lint command;
- E2E/staging scenario actually executed;
- migration command/result;
- provider sandbox request/reference with secrets removed;
- trace/metric/dashboard reference;
- reconciliation result;
- rollback/failure drill result;
- accessibility/security scan plus fixes/manual verification.

Not evidence:

- “should work”;
- “code looks correct”;
- file existence;
- endpoint existence;
- a TODO test;
- mocked production response;
- fabricated screenshot/log;
- assumption that CI will pass later.

## Validator

Run:

```bash
python3 scripts/tasks/validate_task_evidence.py
```

The validator checks the master blueprint against this directory.

Important: the validator verifies evidence **structure and consistency**. It cannot
prove that a test output is truthful or that business behavior is correct. Agents
and reviewers remain responsible for verifying the actual underlying evidence.
