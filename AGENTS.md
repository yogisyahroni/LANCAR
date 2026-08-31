# LANCAR AI Agent Execution Contract

This file is the repository-level operating contract for Codex and other AI coding agents.

## Source of truth

The master implementation blueprint is:

`task-food-marketplace-parity-2026.md`

For every assigned `TASK-ID`, read:

1. the exact `TASK-ID` section;
2. its referenced dependencies and applicable cross-service contracts;
3. `PART O — GLOBAL DEFINITION OF DONE`;
4. `PART AG — BLUEPRINT → REALITY: GLOBAL MARKETPLACE EXECUTION GATES`;
5. this `AGENTS.md`;
6. `docs/task-evidence/README.md`.

The master task defines **what must exist**. This file defines **how an agent is allowed to claim progress or completion**.

## Non-negotiable execution rules

- Inspect the current repository before coding. Paths named in the master task are recommendations until verified against the current tree.
- Reuse or evolve existing ownership when semantics fit. Do not create duplicate services, tables, stores, design systems, feature-flag systems, or provider registries just because a proposed filename exists in the blueprint.
- Preserve authoritative boundaries: pricing/payment/order state/availability/settlement/provider truth remain server authoritative.
- Do not introduce fake success, production mocks, fabricated ETA/status/price/provider responses, hidden fallbacks, or placeholder implementations presented as complete.
- Do not mark a requirement complete merely because a file, endpoint, screen, migration, test file, service shell, model shell, or admin API exists.
- If a requirement says Admin GUI, Customer app, Merchant app, Courier app, or Customer Web must support an operation, a backend endpoint alone does not satisfy it.
- If a task requires a real provider/integration but credentials or sandbox access are unavailable, implement only the verifiable portion and mark the rest `PARTIAL` or `BLOCKED`; never fabricate provider proof.
- Do not claim production validation unless production validation actually occurred.
- Never fabricate command output, test results, screenshots, metrics, traces, logs, reconciliation results, migration results, provider callbacks, or user-flow evidence.
- `N/A` means genuinely not applicable and requires a written reason. `N/A` is not shorthand for “not done”.
- Prefer additive/backward-compatible changes. Breaking contracts require an explicit migration/versioning path.
- Do not rewrite unrelated behavior merely while “cleaning up” a task.
- Do not rewrite acceptance criteria or weaken the master task to make implementation easier unless the user explicitly asks to change the blueprint.

## Mandatory Reality Gates for every task

`REALITY-2026-003 — Evidence-based Definition of Done` and
`REALITY-2026-011 — No fake completeness gate`

apply to **every TASK-ID in the master blueprint**, not only tasks inside Part AG.

A task is not `COMPLETE` until both gates are `PASS`.

## Required status semantics

Use only:

- `PARTIAL` — verified progress exists, but one or more requirements/evidence items remain.
- `BLOCKED` — progress cannot continue because a real dependency is unavailable or unresolved.
- `COMPLETE` — every applicable checklist item is implemented and supported by evidence; `REALITY-2026-003` and `REALITY-2026-011` both pass.

Do not use “done”, “basically done”, “implemented”, or “production-ready” as a substitute for these states.

## Evidence is mandatory

Before checking any master-task checkbox `[x]` for a `TASK-ID`, create or update:

`docs/task-evidence/<TASK-ID>.md`

Start from:

`docs/task-evidence/TEMPLATE.md`

The evidence report must record actual implementation references and actual checks performed.

If a task is only partially implemented:

- evidence status must be `PARTIAL` or `BLOCKED`;
- only individually proven checklist items may be changed to `[x]`;
- unresolved checklist items remain `[ ]`;
- unrun tests remain `NOT_RUN`;
- unavailable production/provider proof must be stated explicitly.

If every checkbox in the task section is `[x]`, the evidence report must be `COMPLETE` and satisfy the repository evidence validator.

## Required verification behavior

After implementation, run the relevant checks that are possible in the current environment, for example:

- formatter/linter/type checker;
- unit tests;
- integration/contract tests;
- Android compile/tests;
- frontend build/tests;
- E2E/staging flow;
- migration validation;
- concurrency/replay tests;
- accessibility checks;
- security checks;
- provider sandbox contract tests;
- reconciliation checks.

Record the exact commands and outcomes in the evidence file.

If a command cannot run, write the actual reason. Do not convert an unavailable check into `PASS`.

## Completion formula

`COMPLETE` requires, where applicable:

`implementation + tests + E2E/staging + migration/backfill + observability + security/privacy + rollback/recovery + Reality Gates`

Applicability is task-specific, but omissions must be justified.

Compilation alone is not completion.

A rendered screen alone is not completion.

An endpoint alone is not completion.

A schema migration alone is not completion.

A mock E2E flow is not completion.

## No Fake Completeness examples

The following are prohibited completion claims:

- a recommended file exists but contains a stub/TODO;
- a route returns hardcoded success;
- a client still uses mock/static production truth;
- a payment flow says success without persisted authoritative payment/order state;
- an Admin GUI requirement is represented only by an API or Postman flow;
- “ML-ready” means only an empty model-service directory;
- “multi-region” means only deployment manifests with no tested failover/data semantics;
- “multi-country” means only a country selector while money/tax/compliance/config remain hardcoded;
- “provider integrated” means only an adapter skeleton with no contract/sandbox evidence;
- “accessible” means only installing axe without fixing/manual verification;
- “observability complete” means only adding log statements with no useful correlation/metric/alert path.

## Repository and branch discipline

For implementation work:

- use a feature branch and PR unless the user explicitly requests a direct branch update;
- keep changes scoped to the assigned task/batch;
- include the `TASK-ID` in the PR description and evidence file;
- do not silently mark unrelated master-task boxes complete;
- do not delete existing tests to make CI pass;
- do not weaken assertions, security controls, or validation merely to obtain green tests.

Documentation-only master-task maintenance may be performed directly on `staging` when explicitly requested by the user.

## Final agent response for a task

Report:

1. `TASK-ID`;
2. status: `PARTIAL`, `BLOCKED`, or `COMPLETE`;
3. implementation summary;
4. files changed;
5. exact verification commands run and results;
6. evidence file path;
7. Reality Gate result;
8. remaining/unproven items;
9. blockers, if any.

Never report `COMPLETE` when the evidence file or validator says otherwise.

## Mechanical gate

Run before claiming task completion:

```bash
python3 scripts/tasks/validate_task_evidence.py
```

CI also runs this validator.

If it fails, the task is not complete.
