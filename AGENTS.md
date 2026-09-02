# LANCAR — AGENT EXECUTION CONTRACT

This file is the mandatory root execution contract for every AI agent working on LANCAR, including Codex, Hermes, routed models, planners, workers, reviewers, sub-agents, and future autonomous tooling.

The repository owner may explicitly override this contract. Otherwise these rules are mandatory.

Primary objective:

VERIFIED COMPLETE IMPLEMENTATION
+ HONEST EVIDENCE
+ SAFE STAGING INTEGRATION

Do not optimize for commit count, checked boxes, PARTIAL count, BLOCKED count, or PR count.

---

# 1. SOURCES OF TRUTH

Primary product/implementation blueprint:

`task-food-marketplace-parity-2026.md`

Before implementing a TASK-ID, read the applicable:

1. exact TASK-ID;
2. prerequisite/dependency TASK-IDs;
3. related contracts;
4. PART O — GLOBAL DEFINITION OF DONE;
5. PART AG — BLUEPRINT → REALITY execution gates;
6. `docs/task-evidence/README.md`;
7. existing evidence for the TASK-ID when present.

The blueprint defines required capability. The actual repository defines current architecture.

Do not create duplicate services, tables, payment truth, routing truth, provider registries, feature-flag systems, auth systems, event models, or design systems merely because a suggested blueprint structure differs from the existing implementation.

---

# 2. OPTIONAL OBSIDIAN CONTEXT

When authorized and accessible, the Obsidian vault may be used as additional project context:

`E:/antigraviti google/SUDAH DEPLOY/vault`

Useful sources include:

- `01 Projects/LANCAR/00 — Index.md`
- `06 Hermes-Ops/Hermes Session Bridge.md`
- latest `07 Daily Notes/`
- `01 Projects/LANCAR/LANCAR — Technical Decisions Log.md`

If unavailable, do not fabricate its contents and do not block ordinary engineering work merely because the vault is unavailable.

Do not expose private chain-of-thought. Record only concise rationale, decisions, evidence, alternatives, and conclusions.

---

# 3. TOOL-FIRST EXECUTION

Inspect and use authorized tools available in the current environment before declaring work unavailable.

Examples:

- terminal / Git
- GitHub tooling
- Docker / Docker Compose
- PostgreSQL tooling
- CI
- Playwright/browser automation
- Android Studio MCP
- Android emulator/device
- provider/cloud CLI
- Graphify
- repository scripts
- authorized staging/dev environments

A TASK-ID must not become BLOCKED merely because a tool, service, database, emulator, or dependency has not yet been started or configured when the agent can safely do so.

"not configured" != "cannot be configured by this agent"

---

# 4. INSPECT BEFORE IMPLEMENTING

Before coding, inspect the relevant:

- repository tree;
- existing implementation;
- service/module ownership;
- APIs and contracts;
- state machines;
- migrations/schema;
- clients;
- tests;
- provider adapters;
- feature flags/configuration;
- evidence;
- prerequisite TASK-IDs.

Reuse and evolve existing ownership when semantics fit.

Prefer modular evolution over microservice theater.

---

# 5. CANONICAL TASK LOOP

Required execution loop:

READ TASK
→ INSPECT REAL CODE
→ MAP DEPENDENCIES
→ IMPLEMENT
→ VERIFY
→ FIX FAILURES
→ UPDATE EVIDENCE
→ CHECK REMAINING REQUIREMENTS
→ SELF-UNBLOCK
→ REVERIFY
→ COMPLETE OR GENUINELY BLOCKED

Do not stop because implementation is difficult, tests fail, CI fails, Docker is stopped, a fixture is missing, a migration is incomplete, or a different implementation approach is required.

---

# 6. TASK STATES

Canonical states:

- PARTIAL
- BLOCKED
- COMPLETE

## PARTIAL

PARTIAL means locally actionable task work remains.

PARTIAL IS NOT A STOPPING CONDITION.

If:

`locally_actionable_remaining != NONE`

continue the SAME TASK-ID.

Do not advance a dependent TASK-ID merely because some implementation exists.

## BLOCKED

BLOCKED is temporary and exceptional.

BLOCKED is valid only when:

- all safe locally actionable work is exhausted;
- the remaining ORIGINAL task requirement genuinely needs an unavailable external resource/permission/decision;
- exact blocker-resolution attempts are recorded;
- relevant available tools were checked;
- exact unblock condition is known;
- owner/provider action is explicit when required.

One blocked dependency chain does not automatically block proven-independent work.

## COMPLETE

COMPLETE requires all applicable ORIGINAL TASK-ID requirements proven with honest evidence and:

- `locally_actionable_remaining = NONE`
- `known_blockers = NONE`
- `unproven_requirements = NONE`
- REALITY-2026-003 = PASS
- REALITY-2026-011 = PASS
- task evidence validator = PASS

---

# 7. ACCEPTANCE-SCOPE PROTECTION

Task evidence must prove the existing master blueprint, not rewrite it.

The agent MUST NOT add, strengthen, weaken, or invent TASK-ID acceptance criteria merely because stronger staging, provider, deployment, production, observability, migration, rollback, or release evidence would be desirable.

Only the repository owner may intentionally change product acceptance scope.

TASK COMPLETE and RELEASE READY are separate states.

TASK COMPLETE
= original TASK-ID requirements proven with applicable evidence.

RELEASE READY
= required staging/provider/deployment/production release gates additionally proven.

Pending release/runtime validation that is NOT explicitly required by the original TASK-ID must be recorded as release follow-up and must not automatically convert an otherwise proven TASK-ID into BLOCKED.

Do not let task evidence create new product acceptance criteria.

---

# 8. REALITY GATES / NO FAKE COMPLETENESS

The following apply to every TASK-ID:

`REALITY-2026-003 — Evidence-based Definition of Done`

`REALITY-2026-011 — No Fake Completeness`

No fake completeness.

The following alone do not prove completion:

- file/class/service exists;
- endpoint exists;
- migration file exists;
- screen renders;
- compilation succeeds;
- unit tests alone pass when broader proof applies;
- mock/static UI works;
- provider skeleton exists;
- logs exist;
- manifests exist;
- hardcoded fake price/ETA/status exists.

Never fabricate tests, CI, logs, screenshots, traces, metrics, provider behavior, ETA, pricing, carrier state, payment callbacks, migration results, reconciliation, security results, E2E, staging, sandbox, or production verification.

If not executed: `NOT_RUN`.

If partly proven: `PARTIAL`.

If failed: `FAIL`.

---

# 9. TASK EVIDENCE

Evidence directory:

`docs/task-evidence/`

Use one evidence document per TASK-ID when required:

`docs/task-evidence/<TASK-ID>.md`

Use the current protocol in:

- `docs/task-evidence/README.md`
- `docs/task-evidence/TEMPLATE.md`

Only genuinely proven master checklist items may change from `[ ]` to `[x]`.

Before claiming COMPLETE run:

`python3 scripts/tasks/validate_task_evidence.py`

If the validator fails, the TASK-ID is not COMPLETE.

Do not weaken the validator merely to manufacture PASS.

---

# 10. VERIFICATION

Run verification applicable to the real task scope, for example:

- formatter/lint/typecheck;
- unit/integration/contract tests;
- migration UP/DOWN and data safety;
- idempotency/concurrency/replay tests;
- Android build/install/runtime using Android Studio MCP/emulator when applicable;
- Playwright/browser E2E when applicable;
- provider sandbox when actually required and available;
- security/privacy checks;
- observability checks;
- reconciliation;
- rollback/recovery drills.

Record actual commands/tools and actual results.

Mocks/fixtures may prove local contract behavior but never real provider availability, callbacks, or SLA.

When verification fails:

UNDERSTAND ROOT CAUSE
→ FIX REAL PROBLEM
→ RERUN

Do not delete/relax tests, security checks, validators, or acceptance criteria merely to obtain green CI.

---

# 11. SECURITY / SECRETS

Use least privilege and preserve secure boundaries.

Secrets, credentials, service-account keys, signing keys, passwords, tokens, and private certificates must not be committed, logged, screenshotted, or stored in task evidence.

Use authorized secrets/environment configuration.

CodeQL, Trivy, Gitleaks, govulncheck, gosec, dependency scans, and equivalent findings are actionable engineering work when relevant.

Do not suppress or disable a security finding merely to make CI green. A false positive may only be suppressed with documented technical justification.

---

# 12. OWNER ACTION REQUIRED

When genuine owner action is required, provide:

1. why the agent cannot perform it;
2. exactly what account/credential/permission/config/decision is missing;
3. exact numbered owner steps;
4. where it must be configured;
5. what is secret and must not be exposed;
6. minimal signal needed to resume;
7. exact verification that will run after unblock.

Generic statements such as "provider credentials required" are insufficient.

---

# 13. MULTI-AGENT / WEAK-MODEL AUTHORITY

Worker agents are implementation executors, not final project authorities unless explicitly assigned reviewer authority.

Workers may:

- implement bounded task packets;
- add/repair tests;
- run authorized tools;
- report actual results;
- prepare evidence;
- report candidate blockers.

Workers MUST NOT independently:

- rewrite master acceptance criteria;
- add new TASK-ID requirements;
- weaken requirements;
- declare a task permanently BLOCKED while actionable work remains;
- mark final COMPLETE without deterministic/reviewer validation;
- make high-blast-radius architecture decisions without assigned authority;
- merge high-risk code based only on their own judgment.

High-risk areas require stronger review, including payment, ledger, refund, payout, settlement, authentication, authorization, security, money/pricing, concurrency, canonical state machines, financial reconciliation, fraud/risk, provider financial integrations, and multi-region/data-residency work.

Recommended pattern:

STRONG PLANNER
→ BOUNDED TASK PACKET
→ WORKER
→ DETERMINISTIC TESTS
→ EVIDENCE
→ REVIEWER
→ REALITY GATES
→ VALIDATOR
→ DELIVERY

---

# 14. PR-LESS STAGING DELIVERY — OWNER-AUTHORIZED DEFAULT

This section supersedes all older repository instructions that required routine Pull Requests into `staging`.

Default development integration branch:

`staging`

Routine TASK-ID development MUST NOT create a Pull Request merely as an administrative step before staging integration.

The normal autonomous lifecycle is:

LATEST `origin/staging`
→ CREATE/USE SCOPED WORKER BRANCH
→ IMPLEMENT
→ LOCAL VERIFICATION
→ UPDATE EVIDENCE/CHECKLIST
→ REALITY GATES
→ TASK EVIDENCE VALIDATOR
→ COMMIT
→ PUSH WORKER BRANCH
→ MONITOR BRANCH-PUSH CI
→ SELF-FIX UNTIL GREEN
→ FETCH LATEST `origin/staging`
→ RECONCILE CONCURRENT CHANGES
→ RERUN AFFECTED VERIFICATION
→ INTEGRATE DIRECTLY INTO `staging`
→ MONITOR STAGING CI
→ SELF-FIX STAGING FAILURES
→ VERIFY REMOTE STAGING
→ CONTINUE NEXT ELIGIBLE TASK

No routine PR to staging.

## Worker branch naming

Use CI-recognized prefixes such as:

- `feat/**`
- `fix/**`
- `chore/**`
- `hotfix/**`
- `agent/**`
- `recovery/**`

Keep one TASK-ID or one tightly coupled implementation batch per branch.

## Before integration

Before updating `staging`:

1. all locally applicable tests/build/lint/typecheck pass;
2. migration verification passes when applicable;
3. Android/browser verification is performed when applicable;
4. evidence/checklist are truthful;
5. `python3 scripts/tasks/validate_task_evidence.py` passes when applicable;
6. branch-push CI is inspected and green;
7. no secrets/unrelated changes are included;
8. latest `origin/staging` is fetched immediately before integration.

## Concurrent-agent safety

Never assume local staging is current.

Immediately before integration:

- fetch latest `origin/staging`;
- compare/reconcile worker work with latest staging;
- preserve valid concurrent work;
- resolve conflicts;
- rerun affected verification.

Never overwrite newer staging state with a stale branch.

Force push to `staging` is prohibited unless the repository owner explicitly authorizes repository recovery.

Do not use:

`git push --force origin staging`

or:

`git push --force-with-lease origin staging`

for ordinary delivery.

## Integration semantics

If the verified worker branch is a clean descendant of current staging, a normal fast-forward/direct staging update is allowed.

If staging advanced meanwhile, reconcile first and rerun affected gates before integrating.

Do not knowingly land red locally-actionable implementation onto shared staging.

## After staging update

The agent MUST monitor actual GitHub Actions when GitHub tooling is available.

If CI fails:

1. inspect workflow/job/logs;
2. identify root cause;
3. fix every locally actionable issue;
4. rerun applicable verification;
5. commit/push correction;
6. resynchronize latest staging;
7. continue until latest staging CI is green or a genuine external blocker exists.

The owner should not be asked to diagnose routine CI failures.

LATEST STAGING CI = GREEN is the normal end state of a delivery cycle.

## Delivery states remain distinct

LOCAL IMPLEMENTED
!= LOCAL COMMITTED
!= WORKER BRANCH PUSHED
!= BRANCH CI GREEN
!= INTEGRATED TO STAGING
!= STAGING CI GREEN
!= PRODUCTION RELEASE

Report the real state.

---

# 15. PULL REQUESTS ARE RESERVED FOR REAL REVIEW VALUE

Pull Requests are primarily reserved for:

- controlled `staging → main` release/promotion;
- explicit owner-requested human review;
- exceptional high-risk architectural review when human review is intentionally required;
- a repository policy that technically mandates a PR.

Do not create routine PRs to staging.

Do not create a production/main PR for every TASK-ID.

Promotion from `staging` to `main` is a deliberate release event and may require release readiness, security, migration, rollback, and owner approval.

Direct autonomous development pushes to `main` are prohibited unless the repository owner explicitly authorizes a specific recovery/release action.

---

# 16. BLOCKED / PARTIAL DELIVERY

Do not merge unsafe half-implemented behavior merely because a task becomes BLOCKED.

A genuinely blocked task may preserve safe work on its worker branch. Only an internally consistent, tested, non-misleading subset may be integrated when that subset has independently proven value and does not falsely mark the full TASK-ID COMPLETE.

PARTIAL remains active work. Do not integrate misleading partial behavior simply because a session is ending.

Session interruption does not convert PARTIAL into BLOCKED.

---

# 17. ANDROID / WEB TOOL CONTRACT

When Android Studio MCP/emulator is available and Android verification applies, use it before claiming device/runtime verification is unavailable.

When Playwright/browser automation is available and web verification applies, use it before claiming manual browser verification is required.

A genuine hardware/manual blocker must state exactly why available automation cannot prove the requirement.

---

# 18. GRAPHIFY

If `graphify-out/graph.json` and Graphify tooling are available, use them when useful for investigation.

Examples:

`graphify query "<question>"`

`graphify path "<A>" "<B>"`

`graphify explain "<concept>"`

After meaningful changes, run `graphify update .` when applicable and supported.

Dirty Graphify output alone is not a reason to skip useful analysis.

---

# 19. FINAL REPORT

At a valid stopping point report truthfully:

- TASK-ID;
- COMPLETE or genuinely BLOCKED status;
- implementation summary;
- relevant files changed;
- verification actually run and results;
- evidence path;
- REALITY-2026-003 / REALITY-2026-011 state;
- remaining requirements;
- blocker-resolution attempts if blocked;
- owner action if genuinely required;
- unblock condition;
- dependency impact;
- next eligible TASK-ID;
- real Git delivery state and latest staging CI state.

Do not stop at PARTIAL while locally actionable work remains.

---

# 20. FINAL PRINCIPLE

Architecture diagram != reality.

File existence != reality.

Endpoint existence != reality.

Compilation != reality.

Mock success != reality.

PR existence != delivery.

PARTIAL count != progress.

BLOCKED count != progress.

The objective is:

ORIGINAL REQUIREMENT
+ REAL IMPLEMENTATION
+ APPLICABLE VERIFICATION
+ HONEST EVIDENCE
+ SAFE STAGING DELIVERY
= VERIFIED TASK COMPLETION

Then, separately:

REQUIRED RELEASE / PROVIDER / DEPLOYMENT / PRODUCTION GATES
= RELEASE READY
