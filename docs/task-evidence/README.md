# LANCAR Task Evidence Protocol

This directory contains verifiable implementation evidence for:

`task-food-marketplace-parity-2026.md`

The protocol exists to enforce:

- `REALITY-2026-003 — Evidence-based Definition of Done`
- `REALITY-2026-011 — No Fake Completeness`

The purpose of evidence is to prove the requirements that already exist in the master blueprint.

Evidence MUST NOT invent new product acceptance criteria merely to make verification stricter.

---

# 1. CORE PRINCIPLE

Task implementation completion and release/environment validation are related but different concepts.

They MUST NOT be automatically collapsed into one status.

The canonical model is:

TASK REQUIREMENTS
→ IMPLEMENT
→ TASK-LOCAL VERIFICATION
→ TASK EVIDENCE
→ COMPLETE

Then, when applicable:

COMPLETE FEATURE
→ STAGING / PROVIDER / DEPLOYMENT / PRODUCTION VALIDATION
→ RELEASE READINESS

A task MUST NOT automatically become BLOCKED merely because production, staging, provider credentials, production dashboards, deployed migrations, or live environment validation are not available.

Those external validations block TASK completion only when the original TASK-ID explicitly requires them.

---

# 2. MASTER BLUEPRINT IS THE ACCEPTANCE SOURCE

Primary master blueprint:

`task-food-marketplace-parity-2026.md`

The acceptance criteria for a TASK-ID are the checklist items that already exist under that TASK-ID.

Evidence may:

- prove a checklist item;
- leave a checklist item unproven;
- explain verification;
- document limitations;
- document release follow-up.

Evidence MUST NOT silently:

- add new checklist requirements;
- strengthen existing checklist wording;
- add staging requirements;
- add production requirements;
- add provider-live requirements;
- add migration-deployment requirements;
- add observability requirements;
- add rollback requirements

unless those requirements already follow from the original TASK-ID or the repository owner explicitly changes the blueprint.

Agent-generated evidence MUST NOT modify product scope.

---

# 3. PART O AND REALITY GATES ARE APPLICABILITY-BASED

PART O — GLOBAL DEFINITION OF DONE and REALITY-2026-003 apply to every task.

However, their verification categories are evaluated based on applicability to the TASK-ID.

`applicable` does NOT mean:

"every possible production validation category must run for every task."

Examples:

A frontend copy/layout change does not automatically require:

- database migration;
- payment reconciliation;
- provider sandbox;
- production rollback drill.

A migration task may require:

- migration up/down verification;
- data integrity verification.

It does NOT automatically require that the migration has already been deployed to the real staging or production database unless the TASK-ID explicitly says so.

A provider-integration task may require provider sandbox evidence if the TASK-ID explicitly requires real provider behavior.

Use technical judgment based on the actual requirement.

Every `N/A` must have a concrete reason.

---

# 4. ONE EVIDENCE FILE PER TASK-ID

Evidence path:

`docs/task-evidence/<TASK-ID>.md`

Example:

`docs/task-evidence/CORE-2026-002.md`

Use:

`docs/task-evidence/TEMPLATE.md`

as the starting point.

---

# 5. WHEN EVIDENCE IS REQUIRED

As soon as any checklist item under a TASK-ID changes:

`[ ] → [x]`

the corresponding evidence file is mandatory.

This applies to:

- partial progress;
- blocked tasks;
- complete tasks.

Only requirements actually proven may be checked.

---

# 6. TASK STATUS MODEL

Allowed task status values:

- `PARTIAL`
- `BLOCKED`
- `COMPLETE`

These statuses describe implementation completion of the original TASK-ID.

They do NOT automatically describe release readiness of the entire platform.

---

# 7. PARTIAL

Use `PARTIAL` when:

- some implementation/proof exists;
- one or more original TASK-ID requirements remain;
- locally actionable work remains.

PARTIAL IS NOT A STOPPING CONDITION.

If locally actionable work remains, the agent must continue working on the same TASK-ID.

For PARTIAL:

- proven requirements may be `[x]`;
- unproven requirements remain `[ ]`;
- `locally_actionable_remaining` must describe what remains;
- tests not executed remain `NOT_RUN`;
- no completion claim is allowed.

PARTIAL must not be converted to BLOCKED merely because work is difficult.

---

# 8. BLOCKED

BLOCKED is an exceptional temporary state.

Use `BLOCKED` only when:

1. an ORIGINAL TASK-ID acceptance criterion remains unproven;
2. that criterion genuinely requires an unavailable external resource, credential, environment, permission, decision, provider capability, or hardware;
3. all safe locally actionable work has been exhausted;
4. `locally_actionable_remaining: NONE`;
5. the exact blocker is documented;
6. resolution attempts are documented;
7. exact unblock condition is documented.

BLOCKED must NOT be used merely because:

- staging was not checked;
- production was not checked;
- provider credentials are absent;
- production observability was not checked;
- deployed migration was not checked;
- production rollback was not checked

unless the ORIGINAL TASK-ID explicitly requires that evidence.

---

# 9. COMPLETE

A TASK-ID may be `COMPLETE` when:

- every original applicable checklist requirement under that TASK-ID is proven;
- all applicable checklist boxes are `[x]`;
- task-local verification is sufficient for the actual requirement;
- `REALITY-2026-003: PASS`;
- `REALITY-2026-011: PASS`;
- real implementation reference exists;
- applicable task-local verification fields are `PASS` or justified `N/A`;
- `unproven_requirements: NONE`;
- `known_blockers: NONE`;
- `locally_actionable_remaining: NONE`;
- evidence validator passes.

A TASK-ID may be COMPLETE while later release/environment validation remains pending IF that validation is not part of the original TASK-ID acceptance criteria.

That pending work must be documented under release follow-up rather than turning the TASK-ID into BLOCKED.

---

# 10. TASK COMPLETION VS EXTERNAL RUNTIME VALIDATION

Use:

`task_scope_external_proof_required`

to explicitly describe whether real external/runtime proof is part of the TASK-ID itself.

Possible values:

- `true`
- `false`

Example:

If the TASK-ID explicitly says:

"Verify real provider sandbox callback"

then:

`task_scope_external_proof_required: true`

The task cannot COMPLETE until that real provider proof passes.

If the TASK-ID only asks:

"Implement webhook signature verification"

and the implementation can be legitimately proven using contract/integration tests:

`task_scope_external_proof_required: false`

Real production/provider runtime validation may still be tracked as a release follow-up without blocking task completion.

---

# 11. EXTERNAL RUNTIME VALIDATION

Field:

`external_runtime_validation`

Allowed values:

- `PASS`
- `PARTIAL`
- `FAIL`
- `NOT_RUN`
- `N/A`

This field records verification against environments such as:

- authenticated staging;
- real provider sandbox;
- service-visible staging database;
- live third-party callback;
- externally managed test infrastructure.

If:

`task_scope_external_proof_required: false`

then `external_runtime_validation: NOT_RUN` does NOT automatically prevent TASK completion.

If:

`task_scope_external_proof_required: true`

then COMPLETE requires:

`external_runtime_validation: PASS`

unless the original requirement is legitimately satisfied another explicit way.

---

# 12. RELEASE READINESS

Field:

`release_readiness`

Allowed values:

- `PASS`
- `PARTIAL`
- `FAIL`
- `NOT_RUN`
- `N/A`

Release readiness may include:

- deployed staging verification;
- production-like deployment;
- provider credential cutover;
- production dashboards/SLO;
- real deployment rollback;
- market launch drills;
- regional failover;
- production reconciliation.

Release readiness is tracked independently from ordinary feature TASK completion.

`release_readiness: PARTIAL` or `NOT_RUN` does NOT automatically turn an otherwise COMPLETE feature task into BLOCKED.

Exception:

If the TASK-ID itself is a release/readiness task, such as an explicit launch gate, release readiness becomes part of that task's acceptance criteria.

---

# 13. E2E RULE

Task evidence uses:

`e2e`

not:

`e2e_staging`

because E2E and staging are separate concepts.

E2E may be legitimately executed using:

- local environment;
- CI environment;
- emulator;
- test containers;
- controlled integration environment;
- authenticated staging

depending on the requirement.

A valid local/CI E2E is real evidence of the behavior it actually proves.

Do not call it staging evidence if it was not run on staging.

---

# 14. MIGRATION RULE

Migration evidence proves migration correctness appropriate to the task.

Examples that can legitimately produce:

`migration: PASS`

include:

- migration up executed successfully in CI/test PostgreSQL;
- migration down executed successfully;
- required constraints/triggers verified;
- schema behavior tested;
- rollback path verified in an appropriate test environment.

A migration does NOT need to be deployed to the actual staging or production database merely for the implementation TASK-ID to become COMPLETE unless the original TASK-ID requires deployment proof.

Actual deployment is tracked under:

- `external_runtime_validation`;
- `release_readiness`;
- dedicated release/SRE/launch tasks.

Never claim actual staging deployment if only CI migration verification was executed.

---

# 15. OBSERVABILITY RULE

Observability verification should match task scope.

Examples of task-local observability proof:

- structured event/log exists;
- correlation ID propagated;
- metric emitted;
- failure state instrumented;
- unit/integration test verifies instrumentation;
- Prometheus/OpenTelemetry configuration validates.

A feature task does NOT automatically require a production dashboard screenshot or live production alert firing.

Live deployed observability may be tracked as release validation.

If the original TASK-ID explicitly requires dashboards, alert behavior, or deployed SLO evidence, those become task requirements.

---

# 16. ROLLBACK / RECOVERY RULE

Rollback/recovery evidence must match task scope.

Examples:

- DB migration down path tested;
- feature flag rollback tested;
- state recovery test passes;
- transaction compensation path tested;
- retry/recovery contract verified.

A normal feature task does not automatically require a real production rollback drill.

Production/staging rollback drills belong to release/readiness tasks unless explicitly required by the TASK-ID.

---

# 17. PROVIDER RULE

Provider integration must never fabricate external behavior.

Mocks and fixtures may prove:

- request construction;
- response parsing;
- canonical mapping;
- capability routing;
- retries;
- timeout behavior;
- signature verification;
- failure behavior.

Mocks/fixtures do NOT prove:

- real provider availability;
- real provider credentials;
- actual SLA;
- actual callback behavior;
- actual carrier semantics.

If original acceptance criteria explicitly require real provider sandbox behavior, external provider access is required for COMPLETE.

Otherwise, real provider validation may be tracked separately as release follow-up.

---

# 18. OWNER ACTION

Owner action is required only for genuine external boundaries.

When owner action is required, evidence must explain:

- why the agent cannot perform it;
- what exact action is required;
- where it must be performed;
- what must remain secret;
- what condition unblocks the work;
- what verification will run afterward.

Do not use vague wording such as:

"Need Firebase."

or:

"Need staging."

Provide actionable instructions.

---

# 19. REQUIRED FRONTMATTER

Every evidence file must contain fields equivalent to:

    ---
    task_id: CORE-2026-001
    status: PARTIAL

    reality_2026_003: PARTIAL
    reality_2026_011: PASS

    implementation_ref: NONE

    tests: NOT_RUN
    integration: NOT_RUN
    e2e: NOT_RUN
    migration: N/A
    migration_na_reason: "No persistent schema or data change."
    observability: NOT_RUN
    security_privacy: NOT_RUN
    rollback_recovery: NOT_RUN

    task_scope_external_proof_required: false
    external_runtime_validation: NOT_RUN
    release_readiness: NOT_RUN
    release_followups: "Describe release/environment follow-up or NONE."

    unproven_requirements: "Describe original TASK-ID requirements not yet proven."
    known_blockers: NONE

    locally_actionable_remaining: "Describe remaining work or NONE."
    blocker_resolution_attempts: NONE
    unblock_condition: NONE

    owner_action_required: false
    owner_action_summary: NONE
    verification_after_unblock: NONE

    dependency_chain_blocked: false
    next_eligible_task: NONE

    updated_at: YYYY-MM-DD
    ---

Allowed verification values:

- `PASS`
- `PARTIAL`
- `FAIL`
- `NOT_RUN`
- `N/A`

Every `N/A` field requires a corresponding reason where applicable.

---

# 20. REQUIRED BODY SECTIONS

Every evidence report must contain:

- `## Acceptance Criteria Source`
- `## Scope Implemented`
- `## Files Changed`
- `## Commands / Checks Run`
- `## Task-Local Verification`
- `## External Runtime / Release Validation`
- `## Locally Actionable Remaining`
- `## External Blockers`
- `## Owner Action Required`
- `## Reality Gate Evaluation`
- `## Unproven / Remaining`
- `## Next Eligible Task`

---

# 21. ACCEPTANCE CRITERIA SOURCE SECTION

Every evidence file must quote or summarize the ORIGINAL checklist requirements being evaluated.

This section exists to prevent evidence from inventing new acceptance criteria.

The evidence must clearly distinguish:

ORIGINAL TASK REQUIREMENT

from:

RELEASE FOLLOW-UP

Never move a release follow-up into the master TASK-ID checklist without explicit owner approval.

---

# 22. WHAT COUNTS AS EVIDENCE

Good task evidence includes:

- real commit/PR reference;
- exact test command and result;
- exact integration/contract test;
- real emulator/device verification;
- real browser E2E;
- migration up/down result;
- concurrency test;
- idempotency/replay test;
- security/accessibility result;
- actual runtime behavior.

Good release evidence may include:

- authenticated staging run;
- real provider sandbox reference;
- deployed migration result;
- production-like trace;
- dashboard/SLO;
- reconciliation;
- rollback/failure drill.

Do not confuse the two.

---

# 23. WHAT IS NOT EVIDENCE

Not evidence:

- "should work";
- "looks correct";
- file existence;
- endpoint existence;
- TODO test;
- fabricated production result;
- fake provider response presented as real;
- assumption that staging will work;
- assumption that CI will pass;
- assumption that provider behavior matches fixtures.

---

# 24. MASTER CHECKLIST UPDATE

Evidence proves the existing master checklist.

The agent may:

`[ ] → [x]`

when a requirement is proven.

The agent MUST NOT:

- add a new acceptance checkbox merely because evidence would be stronger;
- rewrite a checkbox to require staging;
- rewrite a checkbox to require production;
- rewrite a checkbox to require provider-live behavior

unless the owner explicitly requests a blueprint change.

For PARTIAL:

check only proven items.

For BLOCKED:

keep proven items checked and blocked original items unchecked.

For COMPLETE:

all applicable original checklist items must be checked.

---

# 25. RELEASE FOLLOW-UP MUST NOT DISAPPEAR

Separating release readiness from feature completion does NOT mean ignoring release work.

Any pending release/environment validation must be recorded in:

`release_followups`

and/or the appropriate dedicated:

- QA task;
- SRE task;
- security task;
- REALITY task;
- market launch task;
- provider onboarding task;
- `GLOB-2026-014` or equivalent launch gate.

The platform must still pass release gates before production launch.

---

# 26. VALIDATOR

Run:

`python3 scripts/tasks/validate_task_evidence.py`

The validator must verify:

- evidence exists for checked requirements;
- status consistency;
- original checklist consistency;
- PARTIAL semantics;
- BLOCKED semantics;
- COMPLETE semantics;
- external proof applicability;
- N/A reasons;
- Reality Gates;
- no blockers/unproven requirements for COMPLETE.

The validator verifies evidence structure and consistency.

It cannot prove that evidence is truthful.

Agents and reviewers remain responsible for validating the underlying facts.

---

# 27. FINAL DECISION MODEL

Use this decision tree:

Does original TASK-ID work remain locally actionable?

YES
→ PARTIAL
→ KEEP WORKING

NO
↓

Are all original TASK-ID acceptance criteria proven?

YES
→ COMPLETE

NO
↓

Does an unproven ORIGINAL acceptance criterion genuinely require unavailable external access/resource?

YES
→ BLOCKED

NO
→ PARTIAL
→ continue investigation/implementation

External release verification that is NOT an original acceptance criterion:

→ RELEASE FOLLOW-UP

not:

→ BLOCKED

---

# 28. FINAL PRINCIPLE

Evidence protects reality.

Evidence must prevent fake completion without making normal engineering impossible.

The correct goal is:

ORIGINAL REQUIREMENT
+ REAL IMPLEMENTATION
+ APPLICABLE VERIFICATION
+ HONEST EVIDENCE
= TASK COMPLETE

Then:

TASK COMPLETE
+ REQUIRED EXTERNAL VALIDATION
+ RELEASE GATES
= RELEASE READY

Do not confuse these two levels.
