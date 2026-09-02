---
task_id: REPLACE-WITH-TASK-ID
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: NONE

tests: NOT_RUN
integration: NOT_RUN
e2e: NOT_RUN

migration: N/A
migration_na_reason: "No persistent schema or stored data change."

observability: NOT_RUN
security_privacy: NOT_RUN
rollback_recovery: NOT_RUN

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: NOT_RUN
release_followups: "NONE"

unproven_requirements: "List ORIGINAL TASK-ID requirements not yet proven."
known_blockers: NONE

locally_actionable_remaining: "Describe remaining local work."

blocker_resolution_attempts: NONE
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: NONE

dependency_chain_blocked: false
next_eligible_task: NONE

updated_at: YYYY-MM-DD
---

# Evidence — REPLACE-WITH-TASK-ID

## Acceptance Criteria Source

Copy or summarize ONLY the original acceptance criteria from:

`task-food-marketplace-parity-2026.md`

Example:

- `[ ] Original requirement 1`
- `[ ] Original requirement 2`
- `[ ] Original requirement 3`

Do NOT add stronger acceptance criteria here.

Do NOT convert release/staging/production follow-up into a new TASK-ID requirement.

Clearly separate original task requirements from release follow-up.

---

## Scope Implemented

Describe exactly what was implemented.

Do not describe planned work as implemented.

Do not claim provider/staging/production behavior that was not actually observed.

---

## Files Changed

List relevant files and why they changed.

Example:

- `path/to/file` — implementation.
- `path/to/test` — verification.
- `task-food-marketplace-parity-2026.md` — checked only requirements actually proven.

---

## Commands / Checks Run

Record exact commands/tools actually executed and the actual result.

Example:

    command: go test ./...
    result: PASS

    command: npm test
    result: PASS

    tool: Android Studio MCP + emulator
    result: PASS — describe actual flow verified

If a check was not run:

keep the matching frontmatter field as:

`NOT_RUN`

Do not convert static inspection into PASS.

---

## Task-Local Verification

Describe verification that proves the original TASK-ID requirements.

### Tests

Status:

Evidence:

### Integration

Status:

Evidence:

### E2E

Status:

Evidence:

E2E may run in:

- local environment;
- CI;
- emulator;
- test container;
- staging

depending on task applicability.

Do not claim staging if it was not staging.

### Migration

Status:

Evidence:

A migration may be PASS based on legitimate up/down/constraint verification in an appropriate test/CI database.

Deployed staging/production application belongs under External Runtime / Release Validation unless the original TASK-ID explicitly requires it.

### Observability

Status:

Evidence:

Task-local instrumentation may satisfy this field when appropriate.

Live production dashboards are release/runtime evidence unless explicitly required by the task.

### Security / Privacy

Status:

Evidence:

### Rollback / Recovery

Status:

Evidence:

Task-local rollback/recovery tests may satisfy this field.

A production rollback drill is not automatically required for every feature task.

---

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value:

`true` or `false`

Reason:

Explain why.

### External Runtime Validation

Status:

Evidence:

Examples:

- authenticated staging;
- provider sandbox;
- service-visible staging DB;
- real third-party callback.

If not run, say so honestly.

If:

`task_scope_external_proof_required: false`

then pending external runtime validation does NOT automatically make the TASK-ID BLOCKED.

### Release Readiness

Status:

Evidence:

Possible follow-up:

- deployed staging verification;
- real provider credential cutover;
- production-like observability;
- launch rollback drill;
- market readiness;
- production reconciliation.

Pending release readiness should be recorded without inventing a new TASK-ID acceptance criterion.

### Release Follow-ups

List release/environment validations that remain.

If none:

`NONE`

These follow-ups should later be attached to the correct QA/SRE/REALITY/launch/provider task.

---

## Locally Actionable Remaining

List every ORIGINAL TASK-ID requirement or verification step that the agent can still perform.

If work remains:

do NOT stop at PARTIAL.

Continue the same TASK-ID.

If none:

`NONE`

---

## Blocker Resolution Attempts

Document meaningful attempts to remove a genuine blocker.

Include tools checked when relevant:

- terminal;
- Docker;
- CI;
- Android Studio MCP;
- Android emulator;
- Playwright;
- database tooling;
- GitHub tooling;
- provider sandbox;
- repository scripts.

If no blocker:

`NONE`

---

## External Blockers

Only list blockers that prevent an ORIGINAL TASK-ID acceptance criterion.

Do NOT list ordinary release follow-up as a task blocker.

If none:

`NONE`

---

## Owner Action Required

If:

`owner_action_required: false`

write:

`NONE`

If:

`owner_action_required: true`

provide all sections below.

### Why Owner Action Is Required

Explain why the agent cannot perform the action using authorized tools.

### Exact Action Required

Provide numbered steps.

1. Step 1.
2. Step 2.
3. Step 3.

### Where To Configure It

Specify platform/environment/location.

### Security Handling

State what must NOT be:

- committed;
- placed in task evidence;
- placed in logs;
- exposed in screenshots;
- pasted into public communication.

### What The Agent Needs Afterwards

Describe the minimum signal/resource needed to resume.

---

## Unblock Condition

Describe the exact condition that changes BLOCKED back to actionable.

If no task blocker:

`NONE`

---

## Verification After Unblock

Describe exact tests/tools/scenarios that will be executed after genuine external unblock.

If none:

`NONE`

---

## Dependency Impact

State whether dependent TASK-IDs are actually blocked.

Do not classify a downstream task as blocked merely because release validation is pending.

If dependency chain is not blocked:

`false`

If it is blocked:

explain the exact technical dependency.

---

## Reality Gate Evaluation

### REALITY-2026-003 — Evidence-based Definition of Done

Status:

`PASS`, `PARTIAL`, `FAIL`, or `NOT_RUN`

Evaluate based on evidence APPLICABLE to the original TASK-ID.

Do not require every possible release/production category for every feature task.

Evidence:

- implementation:
- tests:
- integration:
- E2E:
- migration:
- observability:
- security/privacy:
- rollback/recovery:
- external proof if explicitly required:

### REALITY-2026-011 — No Fake Completeness

Status:

`PASS`, `PARTIAL`, `FAIL`, or `NOT_RUN`

Confirm:

- no stub/TODO is presented as complete;
- no fake transaction success remains;
- no mock is presented as real provider evidence;
- no production/staging evidence is fabricated;
- authoritative server truth is used where required;
- required GUI/app flow is actually wired;
- master acceptance criteria were not silently rewritten to manufacture completion or blockage.

---

## Unproven / Remaining

List ONLY original TASK-ID requirements that remain unproven.

Do not mix ordinary release follow-up into this section unless external runtime proof is explicitly part of the original task.

If everything in the original TASK-ID is proven:

`NONE`

---

## Next Eligible Task

For PARTIAL with locally actionable work:

`CURRENT TASK — continue working`

For BLOCKED:

state a proven-independent task or:

`NONE`

For COMPLETE:

state the next dependency-valid TASK-ID.

---

## Status Decision

Use this decision tree:

Original task work still locally actionable?

YES:

`status: PARTIAL`

and continue working.

NO:

Are all original TASK-ID acceptance criteria proven?

YES:

`status: COMPLETE`

NO:

Does an original acceptance criterion genuinely require unavailable external proof/resource?

YES:

`status: BLOCKED`

NO:

`status: PARTIAL`

and continue investigation.

Pending release validation that is NOT an original acceptance criterion does not convert the task to BLOCKED.

---

## Notes / N/A Justification

For every verification field marked `N/A`, explain the actual technical reason.

N/A means:

genuinely not applicable.

N/A does NOT mean:

- not yet implemented;
- not yet tested;
- inconvenient;
- externally unavailable.