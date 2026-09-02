# LANCAR — AGENT EXECUTION CONTRACT

This file defines mandatory execution behavior for every AI agent working on the LANCAR repository.

This contract applies to:

- Codex
- Hermes
- routed AI models
- planner agents
- coding agents
- reviewer agents
- sub-agents
- autonomous agents
- future AI development tooling

These rules are mandatory unless the repository owner explicitly overrides them.

The primary objective is NOT to maximize:

- commits
- changed files
- checked boxes
- PARTIAL tasks
- BLOCKED tasks

The primary objective is:

VERIFIED PRODUCTION-READY COMPLETE.

---

# 1. OBSIDIAN SECOND BRAIN

The Obsidian vault is an additional project source of truth when the current execution environment has authorized access to it.

Vault path:

`E:/antigraviti google/SUDAH DEPLOY/vault`

## Session Start

When the vault is accessible:

1. Read:
   `01 Projects/LANCAR/00 — Index.md`

2. Read:
   `06 Hermes-Ops/Hermes Session Bridge.md`

3. Check latest notes under:
   `07 Daily Notes/`

4. Read:
   `01 Projects/LANCAR/LANCAR — Technical Decisions Log.md`

5. Use relevant current decisions as implementation context.

If the vault is unavailable:

- DO NOT fabricate its contents.
- DO NOT block ordinary engineering work merely because the vault is unavailable.
- Continue using repository sources of truth.
- Report vault unavailability only if it materially prevents a required decision.

## Session End

When the vault is accessible:

1. Write/update the relevant session summary under `07 Daily Notes/`.
2. Update the Technical Decisions Log when an important architecture/product decision was made.
3. Record recurring tooling/agent bugs under `06 Hermes-Ops/decisions/Bug Patterns.md`.
4. Save reusable workflows/skills when genuinely useful.

Do not write or expose private chain-of-thought.

For reasoning records, store only:

- concise engineering rationale
- decisions
- evidence
- alternatives considered
- conclusions

---

# 2. TOOL-FIRST POLICY

The agent MUST inspect and actively use tools available in the current environment.

Potential tools include:

- terminal / shell
- Git
- GitHub MCP
- Playwright MCP
- browser automation
- Android Studio MCP
- Android emulator
- connected Android devices
- Docker
- Docker Compose
- PostgreSQL tooling
- SQLite MCP
- CI pipelines
- repository scripts
- provider CLI
- cloud CLI
- Graphify
- authorized staging/dev environments
- observability tools
- other available MCP servers

Tool availability MUST be checked rather than assumed.

A task MUST NOT be declared BLOCKED merely because it requires a tool that may already be available.

Before declaring a blocker, ask:

1. Is there an available MCP that can perform this work?
2. Is there an emulator/device available?
3. Can the required service be started?
4. Can Docker provide the dependency?
5. Can CI provide the required environment?
6. Does the repository already contain setup automation?
7. Can the dependency be safely configured by the agent?
8. Is an approved emulator/sandbox available?
9. Does the task genuinely require owner/provider action?

If an authorized safe path exists:

USE IT.

Do not declare BLOCKED.

---

# 3. PROJECT CONVENTIONS

Primary technologies include:

- Go backend
- TypeScript / Next.js
- Kotlin Android
- PostgreSQL
- Docker
- GitHub Actions

Known project conventions must be preserved when still valid.

Examples:

- `CourierFlow.kt` remains the canonical courier state-machine implementation when applicable.
- Transaction truth must remain server-authoritative.
- Existing bounded ownership should be evolved rather than duplicated.
- Use surrounding repository conventions rather than inventing a second architecture.
- Bahasa Indonesia may be used for engineering communication.

When available and applicable, run:

`make test`

and:

`make lint`

before claiming completion.

Do not run irrelevant commands merely to produce evidence.

---

# 4. ENTERPRISE ENGINEERING PRINCIPLES

## Testing

- Use appropriate unit, integration, contract and E2E testing.
- Do not fabricate coverage.
- Do not remove tests merely to make CI green.
- Do not weaken assertions merely to achieve PASS.
- Concurrency-sensitive behavior requires concurrency-sensitive verification.
- Financial/state-machine behavior requires invariant verification.
- Mock tests do not prove real external provider behavior.

## File Integrity

- No placeholder replacement of real implementation.
- No accidental file truncation.
- No unrelated deletion.
- Preserve existing behavior unless the task intentionally changes it.
- Inspect imports, callers and contracts before major refactoring.

## Backend Architecture

Prefer clear responsibility boundaries when consistent with the existing codebase:

transport/controller
→ application/service
→ domain
→ repository/integration

Avoid thin wrappers that only create the appearance of architecture.

## PostgreSQL Integrity

When applicable:

- migration-first schema changes
- transactional correctness
- constraints
- indexes based on real access patterns
- safe backfill
- rollback/recovery planning
- no unnecessary N+1 behavior

## DevOps / CI

- Use scoped implementation branches.
- Keep commits/task scope understandable.
- Maintain reproducible builds.
- Verify actual CI results.
- Never claim CI is green without checking it.

## Observability

When applicable provide:

- structured logs
- correlation/trace IDs
- useful metrics
- meaningful error visibility
- operational alerts/recovery path
- secret/PII redaction

Logging statements alone do not prove observability readiness.

## Security

When applicable:

- least privilege
- secure authentication/session handling
- proper authorization
- parameterized database access
- secret isolation
- input validation
- rate limiting where relevant
- no credentials in source/evidence/logs

## UI/UX

Interfaces must:

- follow the LANCAR design system
- be responsive
- have deliberate state design
- follow applicable accessibility requirements
- avoid inconsistent AI-generated UI patterns
- preserve semantic token usage

---

# 5. GRAPHIFY

If `graphify-out/graph.json` exists and Graphify tooling is available, use it when useful for codebase investigation.

Examples:

`graphify query "<question>"`

`graphify path "<A>" "<B>"`

`graphify explain "<concept>"`

Use `graphify-out/wiki/index.md` for broad navigation when available.

Use `graphify-out/GRAPH_REPORT.md` for broad architecture analysis when necessary.

After meaningful code changes, update the graph when tooling supports it:

`graphify update .`

Dirty Graphify output alone is not a reason to skip Graphify.

---

# 6. MASTER BLUEPRINT

Primary implementation source of truth:

`task-food-marketplace-parity-2026.md`

Before implementing a TASK-ID, the agent MUST read:

1. The exact TASK-ID section.
2. Referenced dependencies.
3. Related cross-service contracts.
4. PART O — GLOBAL DEFINITION OF DONE.
5. PART AG — BLUEPRINT → REALITY execution gates.
6. `docs/task-evidence/README.md`.
7. Relevant previous evidence when it exists.

The blueprint describes required capabilities.

The actual repository determines the existing architecture.

Suggested file/service names in the blueprint are proposals until verified against the repository.

---

# 7. INSPECT BEFORE IMPLEMENTING

Before coding, inspect:

- repository tree
- existing implementation
- ownership boundaries
- APIs/contracts
- state machines
- database schema/migrations
- clients
- tests
- provider adapters
- configuration
- feature flags
- design system
- task evidence
- prerequisite TASK-IDs

Reuse or evolve existing implementation whenever semantics and ownership fit.

DO NOT create duplicate:

- services
- tables
- payment sources of truth
- geo/routing sources of truth
- provider registries
- config platforms
- feature flag platforms
- design systems
- campaign stores
- event models
- auth/identity systems

merely because the blueprint mentions a different suggested structure.

---

# 8. MODULAR-FIRST / NO MICROSERVICE THEATER

Do not create a new microservice merely to satisfy architecture wording.

Prefer an existing bounded service/module when ownership fits.

Extract a separate service only when justified by factors such as:

- independent scaling
- availability/failure isolation
- security/compliance boundary
- ownership boundary
- materially different deployment cadence
- significant independent complexity

Architecture existence does not equal capability completion.

---

# 9. CANONICAL TASK EXECUTION LOOP

Work one TASK-ID at a time within a dependency chain.

Required lifecycle:

READ TASK
→ INSPECT REPOSITORY
→ MAP DEPENDENCIES
→ PLAN FROM ACTUAL CODE
→ IMPLEMENT
→ RUN VERIFICATION
→ FIX FAILURES
→ UPDATE EVIDENCE
→ CHECK REMAINING REQUIREMENTS
→ RESOLVE BLOCKERS
→ REVERIFY
→ COMPLETE

The desired lifecycle is NOT:

READ
→ create some files
→ PARTIAL
→ next task

The desired lifecycle is also NOT:

READ
→ encounter difficulty
→ BLOCKED
→ stop

---

# 10. TASK STATES

Canonical task states are:

- PARTIAL
- BLOCKED
- COMPLETE

They have strict meanings.

---

# 11. PARTIAL IS NOT A STOPPING CONDITION

PARTIAL means:

- progress exists
- some requirements may already be proven
- requirements remain
- locally actionable work still exists

PARTIAL IS NOT DONE.

PARTIAL IS NOT A STOPPING CONDITION.

PARTIAL IS NOT PERMISSION TO ADVANCE TO A DEPENDENT TASK.

If a TASK-ID is PARTIAL, the agent MUST:

1. Identify every remaining requirement.
2. Identify every unproven requirement.
3. Classify remaining requirements as:
   - locally actionable
   - genuinely external/unavailable
4. Continue every locally actionable item.
5. Rerun applicable verification.
6. Update evidence.
7. Repeat until COMPLETE or genuinely BLOCKED.

If:

`locally_actionable_remaining != NONE`

the agent MUST continue the SAME TASK-ID.

---

# 12. BLOCKED IS TEMPORARY AND EXCEPTIONAL

BLOCKED IS NOT SUCCESS.

BLOCKED IS NOT THE OBJECTIVE.

BLOCKED IS NOT AN EASY EXIT.

BLOCKED may only be declared when:

1. All safe locally actionable work has been exhausted.
2. Remaining completion requires something the agent genuinely cannot obtain, create, configure or operate using authorized resources.
3. The exact blocker is documented.
4. Blocker-resolution attempts are documented.
5. Relevant available tools have been checked.
6. Exact unblock condition is documented.
7. Owner/provider action is documented when required.

The target remains:

BLOCKED
→ UNBLOCK
→ RESUME
→ VERIFY
→ COMPLETE

---

# 13. MANDATORY SELF-UNBLOCKING

Whenever a blocker appears, the agent MUST actively attempt to remove it.

Required blocker-resolution loop:

1. Identify the exact root cause.
2. Classify the blocker.
3. Inspect available tools.
4. Inspect repository/configuration.
5. Attempt safe remediation.
6. Try valid alternative paths.
7. Rerun verification.
8. Repeat while actionable options remain.

Possible blocker categories include:

- implementation defect
- missing wiring
- configuration
- dependency
- infrastructure
- test setup
- CI
- database
- migration
- provider integration
- missing credential
- external account
- product decision
- business decision
- legal decision
- architecture approval
- physical hardware

Failure of the preferred approach does NOT automatically justify BLOCKED.

Try another technically valid approach when available.

---

# 14. SELF-UNBLOCKING ACTIONS

Before BLOCKED, consider and use applicable actions such as:

- inspect repository for existing configuration
- inspect `.env.example`
- inspect setup documentation
- repair missing implementation
- repair wiring
- repair tests
- install normal project dependencies
- start available services
- start Docker
- run Docker Compose
- provision local development/test infrastructure
- use CI services
- start a local database
- fix migrations
- write missing migrations
- implement missing observability
- implement recovery behavior
- write missing contract/integration tests
- inspect runtime logs
- reproduce failures
- use available sandbox
- use emulators/test harnesses
- inspect prerequisite TASK-IDs
- use another valid implementation strategy

A failed command is not a blocker by itself.

---

# 15. INVALID BLOCKERS

The following are NOT valid blockers when the agent can solve them:

- implementation is difficult
- many files need changes
- tests fail
- code needs refactoring
- fixtures are missing
- Docker is stopped but can be started
- local DB is missing but can be provisioned
- project dependency needs installation
- migration still needs implementation
- observability still needs implementation
- rollback test still needs implementation
- CI is failing because of the agent's changes
- command failed once
- alternative approach has not been investigated
- repository has not been sufficiently inspected
- Android emulator has not been tried
- Playwright has not been tried
- available MCP has not been tried

These remain locally actionable.

Status should remain PARTIAL and work must continue.

---

# 16. GENUINE EXTERNAL BLOCKERS

Examples that MAY justify BLOCKED after local work is exhausted:

- unavailable third-party credential
- provider sandbox requiring vendor/owner approval
- production/staging permission not granted
- externally managed secret unavailable
- required provider account unavailable
- third-party outage with no valid alternate environment
- required product/business/legal decision
- architecture approval explicitly required
- genuinely unavailable physical hardware
- prerequisite TASK-ID itself genuinely externally blocked

The agent MUST distinguish:

"not configured"

from:

"cannot be configured by this agent"

The first is usually actionable.

The second may be genuinely external.

---

# 17. ANDROID / DEVICE EXECUTION CONTRACT

If Android Studio MCP and an Android emulator/device are available, the agent MUST use them when applicable.

Applicable verification may include:

- build
- install
- launch
- navigation
- UI interaction
- forms
- permission flows
- deep links
- lifecycle
- offline/reconnect
- state restoration
- runtime crash inspection
- logs
- backend/dev integration
- accessibility inspection when supported
- screenshots when legitimate evidence requires them

The agent MUST NOT declare:

"Needs Android testing"

or:

"Needs a device"

without first checking available Android tooling.

If an emulator is active, use it.

A valid external hardware blocker must be specific.

Example:

"Verification requires physical NFC hardware and no authorized NFC-capable physical device is available."

That may be valid.

Generic Android verification is not.

---

# 18. WEB / BROWSER EXECUTION CONTRACT

When Playwright/browser automation is available, use it for applicable verification.

Applicable scenarios include:

- navigation
- forms
- checkout
- dashboard flows
- authentication flows
- state transitions
- error states
- responsive behavior
- accessibility
- browser console/runtime errors

Do not declare:

"Manual browser verification required"

before attempting available browser automation.

If manual verification remains genuinely necessary, explain exactly why automation cannot prove the requirement.

---

# 19. DATABASE / INFRASTRUCTURE EXECUTION CONTRACT

Do not declare infrastructure BLOCKED merely because the environment is not currently running.

First determine whether the agent can:

- start Docker
- run Docker Compose
- start PostgreSQL
- provision a local/test DB
- apply migrations
- use repository setup scripts
- use CI-provided services
- use valid embedded/test alternatives

Only after reasonable authorized alternatives have been exhausted may infrastructure become a genuine blocker.

---

# 20. EXTERNAL PLATFORM CONFIGURATION

Use of an external platform does NOT automatically make the task BLOCKED.

Examples:

- Firebase
- Google Cloud
- AWS
- payment providers
- map providers
- notification providers
- SMS/email providers
- logistics providers
- analytics
- DNS
- CDN
- object storage
- Apple developer services
- Google developer services

The agent MUST complete every requirement that does not require owner-only access.

---

# 21. FIREBASE RULE

If real Firebase project configuration is unavailable, the agent must still complete all applicable local work.

Examples:

- SDK integration
- dependency setup
- configuration loading
- environment handling
- interface/wrapper implementation
- Firebase emulator integration where appropriate
- FCM token lifecycle
- notification handling
- retry/failure behavior
- observability
- security handling
- unit tests
- integration tests using approved local/emulator infrastructure

Missing `google-services.json` does NOT automatically justify marking the entire feature BLOCKED.

Only exact behavior that genuinely requires the real Firebase project may remain externally blocked.

---

# 22. OWNER ACTION REQUIRED CONTRACT

If owner/user intervention is genuinely required, the agent MUST provide explicit operational instructions.

The following is NOT sufficient:

"Firebase configuration required."

The following is NOT sufficient:

"Provider credentials unavailable."

Every owner-action blocker MUST contain:

## Why Owner Action Is Required

Explain exactly why the agent cannot perform the step with available authorized tools.

## What Is Missing

Identify exact:

- account
- project
- credential
- secret
- configuration
- provider capability
- permission
- business decision
- legal decision
- hardware

## What The Owner Must Do

Provide exact numbered instructions.

The owner should not need to guess.

## Where It Must Be Configured

Specify the platform, console, environment, repository path, secret manager or configuration location when known.

## Security Handling

Explicitly state:

- what is secret
- what must not be committed
- what must not be placed in evidence
- what must not be pasted in logs/screenshots

## What The Agent Needs Afterwards

Specify the minimal signal/resource needed to resume work.

## Verification After Unblock

Explain exactly what the agent will execute after the action is complete.

The blocker documentation must create a clear path to COMPLETE.

---

# 23. OWNER ACTION EXAMPLE — FIREBASE

A correct Firebase owner-action report should be specific.

Example structure:

## Why Owner Action Is Required

The Android integration is implemented locally, but real Firebase behavior cannot be verified because this execution environment does not have authorized access to the LANCAR Firebase project.

## What The Owner Must Do

1. Open Firebase Console.
2. Select the actual LANCAR Firebase project.
3. Verify/register the correct Android package name.
4. Add SHA-1/SHA-256 fingerprints if required by the Firebase feature.
5. Enable the required Firebase product.
6. Download the generated `google-services.json` when required.
7. Place it in the actual repository module path expected by the Android project.
8. Configure any owner-only project settings required by the feature.

## Security

Do not:

- commit service-account private keys
- store secrets in task evidence
- put private keys in source code
- expose credentials in screenshots
- expose credentials in logs

## After Owner Action

The agent should then:

1. inspect configuration
2. build the Android project
3. install the application using Android Studio MCP/emulator
4. launch the app
5. verify Firebase initialization
6. run the feature-specific scenario
7. inspect runtime logs
8. update evidence
9. rerun Reality Gates
10. move toward COMPLETE

---

# 24. SECRETS / CREDENTIALS

When completion requires:

- API key
- OAuth credential
- provider credential
- service account
- signing key
- certificate
- password
- private token
- secret

the agent MUST document:

- which platform it belongs to
- why it is needed
- where the owner creates/retrieves it
- where it should be configured
- expected environment/config name when known
- how the application consumes it
- how it will be verified afterward

Secrets MUST NOT be stored in:

- source code
- Git history
- task evidence
- markdown documentation
- screenshots
- logs

Prefer:

- CI secrets
- environment variables
- secret manager
- provider-authorized secure configuration

Do not require the owner to paste a sensitive secret into evidence documentation.

---

# 25. PROVIDER INTEGRATION BLOCKERS

If real provider credentials are unavailable, complete all provider behavior that does not require external access.

Where applicable this includes:

- provider capability interface
- adapter architecture
- request validation
- response validation
- canonical mapping
- raw payload preservation where permitted
- idempotency
- retry
- backoff
- timeout
- failure handling
- webhook verification logic
- polling behavior
- status mapping
- UNKNOWN handling
- observability
- security
- recovery
- contract tests using approved fixtures
- rollback behavior

Mocks/fixtures may prove local behavior only.

Mocks/fixtures MUST NOT be represented as proof of real provider behavior.

---

# 26. BLOCKER DOCUMENTATION CONTRACT

Every genuinely BLOCKED evidence document MUST include:

## External Blockers

Exact technical blocker.

## Blocker Resolution Attempts

Meaningful actions actually attempted.

## Available Tools Checked

Relevant tools/MCP/environment checked and results.

## Owner Action Required

Exact owner instructions when applicable.

## Unblock Condition

Specific condition required to resume.

## Verification After Unblock

Exact verification plan.

## Dependency Impact

Which downstream work must stop.

Generic statements such as:

"External dependency required"

are insufficient.

---

# 27. BLOCKED IS TEMPORARY

A BLOCKED TASK-ID must contain an explicit path back to execution.

Evidence should support fields such as:

- `known_blockers`
- `locally_actionable_remaining`
- `blocker_resolution_attempts`
- `unblock_condition`
- `owner_action_required`
- `owner_action_summary`
- `verification_after_unblock`
- `blocked_since`
- `retry_when`
- `dependency_chain_blocked`
- `next_eligible_task`

If:

`status: BLOCKED`

then:

`locally_actionable_remaining: NONE`

must normally be true.

If locally actionable work remains, the task should remain PARTIAL and execution should continue.

---

# 28. BLOCKER QUEUE

A genuine BLOCKED task does not automatically terminate the entire autonomous run.

When a TASK-ID becomes genuinely BLOCKED:

1. Record blocker evidence.
2. Stop that dependency chain.
3. Identify TASK-IDs that are genuinely independent.
4. Continue independent work when safe.
5. Preserve the blocked TASK-ID in a blocker queue.
6. Retry it when its unblock condition becomes available.

Do NOT falsely label downstream work independent merely to bypass a prerequisite.

Independence must be technically justified.

---

# 29. COMPLETION-SEEKING BEHAVIOR

The agent MUST optimize for:

VERIFIED COMPLETE TASKS

not:

MANY PARTIAL TASKS

and not:

MANY BLOCKED TASKS

Before moving away from a TASK-ID, ask:

"Is there anything I can still implement, configure, provision, debug, test, repair or legitimately verify using currently authorized resources?"

If YES:

CONTINUE THE SAME TASK.

If NO, ask:

"Does completion genuinely require an unavailable external credential, account, environment, approval, decision, provider capability, physical resource or prerequisite?"

If YES:

BLOCKED may be valid.

If NO:

continue root-cause analysis.

---

# 30. REALITY GATES APPLY TO EVERY TASK

The following gates apply to EVERY TASK-ID:

`REALITY-2026-003 — Evidence-based Definition of Done`

`REALITY-2026-011 — No Fake Completeness`

A task MUST NOT be COMPLETE unless:

`REALITY-2026-003 = PASS`

and:

`REALITY-2026-011 = PASS`

---

# 31. NO FAKE COMPLETENESS

The following alone do NOT prove completion:

- file exists
- class exists
- endpoint exists
- route exists
- service exists
- interface exists
- migration file exists
- screen renders
- UI works only with mock/static data
- compilation succeeds
- unit tests alone pass when broader verification is required
- Admin API exists but required Admin GUI does not
- payment UI succeeds without authoritative persisted transaction state
- provider adapter skeleton exists
- fake provider response exists
- multi-region manifests exist without failure/recovery semantics
- country selector exists while money/tax/compliance remain hardcoded
- accessibility tooling exists but violations remain
- logs exist without useful operational observability
- model/ML service shell exists without trustworthy data/evaluation

Implementation existence != verified behavior.

---

# 32. FABRICATION IS PROHIBITED

Never fabricate:

- test results
- CI results
- logs
- screenshots
- traces
- metrics
- provider responses
- provider availability
- provider capabilities
- ETA
- price
- carrier status
- payment callback
- migration result
- reconciliation
- security scan
- accessibility result
- failover test
- E2E result
- staging verification
- sandbox verification
- production verification

If something was not executed:

`NOT_RUN`

If only partly proven:

`PARTIAL`

If it failed:

`FAIL`

Inspection or assumption alone does not equal PASS.

---

# 33. TASK EVIDENCE

Evidence directory:

`docs/task-evidence/`

One TASK-ID should have one evidence document:

`docs/task-evidence/<TASK-ID>.md`

Use:

`docs/task-evidence/TEMPLATE.md`

Before changing a master checklist item from:

`[ ]`

to:

`[x]`

matching evidence MUST exist.

Only genuinely proven checklist items may be checked.

---

# 34. EVIDENCE FRONTMATTER CONTRACT

The task-evidence protocol should support the following concepts:

    task_id: TASK-2026-001
    status: PARTIAL

    reality_2026_003: PARTIAL
    reality_2026_011: PASS

    implementation_ref: NONE

    tests: NOT_RUN
    e2e_staging: NOT_RUN
    migration: N/A
    migration_na_reason: "No persistent schema change."
    observability: NOT_RUN
    security_privacy: NOT_RUN
    rollback_recovery: NOT_RUN

    unproven_requirements: "Describe remaining proof."
    known_blockers: NONE

    locally_actionable_remaining: "Describe remaining local work."

    blocker_resolution_attempts: NONE

    unblock_condition: NONE

    owner_action_required: false
    owner_action_summary: NONE

    verification_after_unblock: NONE

    dependency_chain_blocked: false
    next_eligible_task: NONE

    blocked_since: NONE
    retry_when: NONE

    updated_at: YYYY-MM-DD

The authoritative evidence format is defined by:

`docs/task-evidence/README.md`

and:

`docs/task-evidence/TEMPLATE.md`

---

# 35. PARTIAL EVIDENCE RULE

For PARTIAL:

- remaining local work must be explicit
- the task remains active
- agent continues the same TASK-ID
- dependent TASK-ID must not advance

PARTIAL may exist as a checkpoint.

PARTIAL must not become an autonomous stopping objective while actionable work remains.

---

# 36. BLOCKED EVIDENCE RULE

For BLOCKED:

- `known_blockers != NONE`
- `unblock_condition != NONE`
- `locally_actionable_remaining = NONE`
- unproven requirements must be explicit
- blocker-resolution attempts must be documented
- tools checked must be documented
- owner action must be explicit when needed
- dependency impact must be explicit
- path back to COMPLETE must be explicit

BLOCKED must not be used to avoid difficult work.

---

# 37. COMPLETE EVIDENCE RULE

For COMPLETE:

- all applicable checklist requirements proven
- `locally_actionable_remaining = NONE`
- `known_blockers = NONE`
- `unproven_requirements = NONE`
- `unblock_condition = NONE`
- `owner_action_required = false`
- `dependency_chain_blocked = false`
- `REALITY-2026-003 = PASS`
- `REALITY-2026-011 = PASS`
- applicable verification fields = PASS or justified N/A
- evidence validator = PASS

---

# 38. N/A RULE

N/A means genuinely not applicable.

N/A does NOT mean:

- not implemented
- not tested
- difficult
- unavailable
- skipped

Each N/A verification field must have a concrete reason.

Example:

`migration_na_reason: "No persistent schema or stored data changed."`

---

# 39. VERIFICATION CONTRACT

Run all verification applicable to the TASK-ID and current environment.

Examples:

- formatter
- lint
- type checking
- unit tests
- integration tests
- contract tests
- API tests
- Android tests
- Android Studio MCP verification
- emulator verification
- web E2E
- Playwright
- concurrency tests
- idempotency tests
- replay tests
- migration validation
- backfill validation
- provider sandbox
- security checks
- accessibility checks
- observability verification
- reconciliation
- rollback/recovery drills

Record:

- exact command/tool
- actual result
- important limitations

Do not merely write "tests passed".

---

# 40. FAILED VERIFICATION

When verification fails:

1. Understand the failure.
2. Identify root cause.
3. Fix the real problem.
4. Rerun verification.
5. Do not weaken requirements.
6. Do not delete the failing test merely to obtain PASS.
7. Do not mark BLOCKED if the failure remains locally actionable.

If repeated remediation fails, reassess the technical approach.

---

# 41. COMPLETION FORMULA

A TASK-ID may be COMPLETE only when applicable parts of the following are satisfied:

IMPLEMENTATION

+ REAL INTEGRATION

+ TESTS

+ BUSINESS INVARIANTS

+ AUTHORITATIVE STATE

+ APPLICABLE E2E / ENVIRONMENT PROOF

+ DATA / MIGRATION SAFETY

+ OBSERVABILITY

+ SECURITY / PRIVACY

+ ROLLBACK / RECOVERY

+ RECONCILIATION WHEN APPLICABLE

+ REALITY-2026-003 PASS

+ REALITY-2026-011 PASS

+ VALIDATOR PASS

+ NO UNPROVEN REQUIREMENT

+ NO UNRESOLVED BLOCKER

= COMPLETE

Compilation alone != COMPLETE.

UI rendering alone != COMPLETE.

Endpoint existence alone != COMPLETE.

Migration existence alone != COMPLETE.

Mock success != COMPLETE.

---

# 42. EVIDENCE VALIDATOR

Before claiming COMPLETE, run:

`python3 scripts/tasks/validate_task_evidence.py`

If the validator fails:

the TASK-ID is NOT COMPLETE.

Fix legitimate inconsistencies.

Do not weaken the validator merely to manufacture PASS.

---

# 43. DEPENDENCY ADVANCEMENT

Do not move to a dependent TASK-ID while its prerequisite is:

- PARTIAL
- BLOCKED
- unverified

After COMPLETE:

continue to the next eligible dependent TASK-ID.

After genuine BLOCKED:

continue only work that is technically proven independent.

Do not bypass dependency chains by falsely declaring tasks independent.

---

# 44. GIT / BRANCH / PR DISCIPLINE

For implementation code:

- use feature branches when appropriate
- keep TASK-ID scope understandable
- use scoped commits
- prefer PR review before staging merge
- include TASK-ID in commit/PR context
- include evidence path
- avoid unrelated rewrites
- do not silently mark unrelated tasks complete
- verify applicable CI

Do not destroy unrelated concurrent agent work.

Do not overwrite newer repository changes with stale local assumptions.

---

# 45. MULTI-AGENT / ROUTER EXECUTION

These rules apply to Codex, Hermes and routed-model environments.

Recommended pattern:

STRONG PLANNER
→ BOUNDED TASK PACKET
→ WORKER
→ DETERMINISTIC TESTS
→ EVIDENCE
→ REVIEWER
→ REALITY GATES
→ VALIDATOR
→ COMPLETE

Lower-capability models should receive bounded tasks when possible.

Worker output does not automatically authorize COMPLETE.

High-risk areas should receive stronger review.

Examples:

- payments
- ledger
- refund
- payout
- settlement
- authentication
- authorization
- security
- pricing
- marketplace economics
- concurrency
- canonical state machines
- provider financial integrations
- multi-region
- data residency
- safety
- fraud/risk

---

# 46. FINAL REPORT CONTRACT

At every valid stopping point report:

## TASK-ID

Exact current TASK-ID.

## Status

Use:

- COMPLETE

or:

- BLOCKED

Do not stop at PARTIAL while locally actionable work remains.

## Implementation Summary

What was actually implemented.

## Files Changed

Exact relevant files.

## Verification

Exact commands/tools actually executed and actual results.

## Evidence

Evidence path.

## Reality Gates

- REALITY-2026-003
- REALITY-2026-011

## Remaining Requirements

Exact unproven requirements.

## Blocker

Exact blocker if BLOCKED.

## Blocker Resolution Attempts

Everything meaningful that was tried.

## Available Tools Checked

List relevant MCP/tools/environments checked.

## Owner Action Required

If owner intervention is genuinely needed, give complete numbered steps.

## Security Handling

Explain any secret-handling requirement.

## Unblock Condition

State exactly what must become true.

## Verification After Unblock

State exactly what will be tested after the owner/provider action.

## Dependency Impact

Explain which dependent chain is stopped.

## Next Eligible TASK-ID

Use:

- next dependent task after COMPLETE
- proven-independent TASK-ID
- NONE

---

# 47. AUTONOMOUS CONTINUATION

The autonomous run must continue while safe and actionable work remains.

Do NOT stop because:

- one implementation attempt failed
- one test failed
- task is PARTIAL
- Docker needs starting
- local DB needs provisioning
- Android emulator needs to be used
- Android Studio MCP needs to be used
- Playwright needs to be used
- configuration requires normal local setup
- observability still needs implementation
- rollback testing still needs implementation

Attempt resolution.

If one task becomes genuinely BLOCKED:

- stop that dependency chain
- document how to unblock it
- continue only proven-independent tasks

The autonomous run should request owner input when a genuine external/owner/provider boundary has been reached.

---

# 48. FINAL PRINCIPLE

LANCAR is not complete because the repository looks sophisticated.

Architecture diagram != reality.

File existence != reality.

Endpoint existence != reality.

Screen rendering != reality.

Compilation != reality.

Mock success != reality.

PARTIAL count != progress.

BLOCKED count != progress.

The objective is:

REAL IMPLEMENTATION
+ VERIFIED BEHAVIOR
+ OPERATIONAL READINESS
+ HONEST EVIDENCE
= REALITY

The agent must actively seek VERIFIED COMPLETE while remaining truthful about everything that has not yet been proven.

# 49. GIT PUSH / PR / STAGING DELIVERY CONTRACT

Implementation work is not considered delivered merely because it exists in the local working tree or has been committed locally.

For every TASK-ID or tightly coupled approved task batch, the default delivery flow is:

IMPLEMENT
→ VERIFY
→ UPDATE EVIDENCE
→ RUN VALIDATOR
→ COMMIT
→ PUSH FEATURE BRANCH
→ OPEN OR UPDATE PR TO STAGING
→ WAIT FOR REQUIRED CI / EVIDENCE GATES
→ FIX FAILURES
→ MERGE TO STAGING WHEN ELIGIBLE
→ SYNC LATEST STAGING
→ CONTINUE NEXT TASK

The default integration branch is:

`staging`

---

## FEATURE BRANCH FIRST

For implementation work, DO NOT normally develop directly on `staging`.

Create or use a scoped feature branch.

Recommended naming examples:

`feat/AGG-2026-010-provider-capabilities`

`fix/CORE-2026-002-idempotency`

`task/FOOD-2026-004-checkout`

Keep branch scope limited to:

- one TASK-ID; or
- a tightly coupled batch whose shared implementation makes separation unsafe or unnecessarily duplicative.

Do not combine unrelated roadmap work into the same PR merely to reduce the number of branches.

---

## COMMIT REQUIREMENT

After implementation and applicable local verification:

1. review the diff;
2. ensure unrelated files are not included;
3. update task evidence;
4. run applicable tests;
5. run the evidence validator;
6. create a scoped commit.

Commit messages should identify the relevant work.

Examples:

`feat(aggregator): implement AGG-2026-010 provider capabilities`

`fix(core): enforce CORE-2026-002 idempotency invariants`

Do not commit:

- secrets;
- credentials;
- generated private configuration;
- unrelated local files;
- temporary debugging artifacts.

---

## PUSH REQUIREMENT

A local commit alone is NOT considered delivered work.

After the commit is locally verified, push the feature branch to the authorized Git remote when network/GitHub access is available.

Example lifecycle:

`feature branch`
→ `origin/feature branch`

Do NOT claim the implementation has been delivered to the shared repository until the push actually succeeds.

Record the actual push result when relevant.

If push fails:

- inspect the failure;
- repair authentication/network/ref problems when locally actionable;
- retry;
- do not fabricate a successful push.

A failed push does not make the implementation COMPLETE as a delivered repository change.

---

## DO NOT DIRECT-PUSH IMPLEMENTATION TO STAGING

Default rule:

DO NOT use direct implementation pushes such as:

`git push origin staging`

unless the repository owner explicitly instructs direct staging delivery for that specific change.

Instead:

1. push the feature branch;
2. create/update a Pull Request;
3. target:

   `staging`

This applies especially to:

- backend implementation;
- Android implementation;
- web implementation;
- database migrations;
- payment logic;
- state machines;
- provider integrations;
- security changes;
- infrastructure;
- high-risk refactors.

---

## PR TARGET

The default PR base branch is:

`staging`

The PR must contain enough information to review the TASK-ID.

Include:

- TASK-ID;
- implementation summary;
- evidence path;
- important files changed;
- migration impact;
- verification performed;
- test results;
- REALITY-2026-003 state;
- REALITY-2026-011 state;
- known blocker if any;
- rollback/recovery impact when applicable.

---

## CI BEFORE MERGE

After pushing/opening the PR:

1. inspect actual required CI status;
2. inspect Task Evidence Gate;
3. inspect relevant build/test workflows;
4. fix failures that are caused by the task;
5. push fixes to the same feature branch;
6. wait for checks again.

Do NOT claim:

`CI PASS`

without inspecting the actual result.

Do NOT weaken tests, validators, security rules or acceptance criteria merely to make the PR green.

---

## MERGE TO STAGING

A COMPLETE TASK-ID may be merged into `staging` when:

- required implementation is present;
- evidence requirements are satisfied;
- REALITY-2026-003 = PASS;
- REALITY-2026-011 = PASS;
- evidence validator passes;
- required CI passes;
- PR has no unresolved blocking issue;
- merge is authorized by repository policy.

After merge:

1. verify that the merge actually reached `staging`;
2. obtain the resulting staging commit/ref;
3. treat the latest remote `staging` as the new baseline.

Do not continue future work from an obsolete pre-merge branch state.

---

## SYNC BEFORE NEXT TASK

Before starting the next TASK-ID:

1. fetch the latest remote state;
2. switch/update the local `staging`;
3. verify that the previous merged work exists;
4. create the next feature branch from the latest `staging`.

Conceptual flow:

`origin/staging`
→ latest local staging
→ new feature branch
→ next TASK-ID

This prevents later TASK-IDs from being built on stale repository state.

---

## BLOCKED TASK DELIVERY

A BLOCKED task must NOT be merged into `staging` merely to make the roadmap appear active.

If useful implementation already exists:

- commit it;
- push the feature branch;
- preserve evidence;
- optionally open/update a Draft PR when repository workflow supports it;
- clearly mark the TASK-ID BLOCKED;
- document owner action and unblock condition.

Do not merge incomplete behavior that would make `staging` unsafe, misleading or internally inconsistent.

If a safe independently valuable subset is intentionally mergeable, it must have its own proven scope and must not falsely mark the full TASK-ID COMPLETE.

---

## PARTIAL TASK DELIVERY

PARTIAL remains an execution state.

Do not merge a PARTIAL TASK-ID merely because the current coding session is ending.

If locally actionable work remains:

CONTINUE WORKING.

If session/runtime limits force an interruption:

- preserve work in a feature branch;
- commit safely if appropriate;
- push the feature branch when possible;
- keep the task PARTIAL;
- do not mark checklist requirements proven without evidence;
- resume the SAME TASK-ID later.

Session interruption does not convert PARTIAL into BLOCKED.

---

## DOCUMENTATION-ONLY EXCEPTION

Small documentation-only maintenance may be delivered directly to `staging` only when:

- the repository owner explicitly requested direct staging modification; and
- no implementation/runtime behavior is changed; and
- concurrent work will not be overwritten.

Otherwise use the same feature branch + PR workflow.

---

## DELIVERY DEFINITION

These states are different:

LOCAL IMPLEMENTED
!=
LOCAL COMMITTED
!=
REMOTE PUSHED
!=
PR OPENED
!=
CI VERIFIED
!=
MERGED TO STAGING
!=
TASK COMPLETE

The agent must report the real delivery state.

Never describe local-only work as already available on `staging`.

Never describe a pushed feature branch as merged.

Never describe an open PR as deployed.

Never describe a merge as successful before verifying the resulting remote state.

# ACCEPTANCE-SCOPE PROTECTION

Task evidence must prove the existing master blueprint, not rewrite it.

The agent MUST NOT add, strengthen, or invent TASK-ID acceptance criteria merely because stronger staging, provider, deployment, production, observability, migration, rollback, or release evidence would be desirable.

Only the repository owner may intentionally change product acceptance scope.

Pending release/runtime validation that is NOT explicitly required by the original TASK-ID must be recorded as release follow-up and MUST NOT automatically convert an otherwise proven TASK-ID into BLOCKED.

TASK COMPLETE and RELEASE READY are separate states:

TASK COMPLETE
= original TASK-ID requirements proven with applicable evidence.

RELEASE READY
= required staging/provider/deployment/production gates additionally proven.

Do not confuse these states.
