---
task_id: MWEB-PORTAL-P0-006
status: PARTIAL
reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: WORKTREE-2026-10-05
tests: PASS
integration: PASS
e2e: NOT_RUN
migration: N/A
migration_na_reason: "Existing merchant_staff, permission mask, branch assignment, and device session schema is reused."
observability: PARTIAL
security_privacy: PARTIAL
rollback_recovery: PARTIAL
task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Invite acceptance, MFA/step-up, audit viewer/export, and staging authorization matrix remain deferred."
unproven_requirements: "Invite token acceptance/expiry/rate-limit E2E, MFA/step-up, session/device lifecycle proof, audit viewer/export, separation of duties, and complete API authorization matrix."
known_blockers: NONE
locally_actionable_remaining: "Add invite lifecycle UI/verification, audit viewer/export, and focused authorization tests for every staff capability and branch scope."
blocker_resolution_attempts: NONE
unblock_condition: NONE
owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: "Run owner/manager/staff browser and API authorization matrix with cross-outlet assertions."
dependency_chain_blocked: false
next_eligible_task: NONE
updated_at: 2026-10-05
---

# Evidence — MWEB-PORTAL-P0-006

## Acceptance Criteria Source

- Staff invitation, acceptance, revoke, recovery/session controls, and role/permission scope are server-authoritative.
- Roles and capabilities are scoped by business/outlet and sensitive operations follow separation of duties.
- Manual requests without permission are rejected and sensitive changes remain auditable.

## Scope Implemented

- Expanded the corporate-only Staff page to show and edit role, permission bitmask, and assigned outlets.
- New invitations require at least one active outlet and send the selected branch scope to the existing server-side invite endpoint.
- Staff changes persist role/permissions and branch assignments through separate authorized API commands; revoke/activate remains server-side.
- Individual merchants remain blocked from staff management by both capability filtering and page guard.

## Files Changed

- `merchant-web/src/pages/Staff.tsx` — invite, role, permission, outlet assignment, revoke/activate UI.
- `merchant-web/src/lib/types.ts` — staff permission and branch-scope response fields.
- `TASKS.md` — current implementation and remaining requirements.

## Commands / Checks Run

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (merchant-web)
    result: PASS — TypeScript and Vite production build completed.

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; non-blocking existing effect warnings remain.

    command: authenticated GET /api/v1/merchant/staff/{merchant_id}
    result: PASS — local Docker API returned real staff roles, permission masks, and branch_ids.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Merchant Web build/lint and local staff API response passed.

### Integration

Status: PASS

Evidence: UI calls existing server-side invite/update/branch-assignment endpoints; local API exposes the fields needed for the UI.

### E2E

Status: NOT_RUN

Evidence: Invite acceptance, revoked-session rejection, cross-outlet authorization, and manual unauthorized request tests remain.

### Security / Privacy

Status: PARTIAL

Evidence: Corporate-only, owner/manager server guards, permission validation, and branch ownership checks exist; full capability matrix, token expiry/rate-limit, MFA, and audit evidence remain.

### Rollback / Recovery

Status: PARTIAL

Evidence: Role/status/branch updates are reversible server commands; invite replay, permission rollback audit, and session recovery are not yet proven.

## External Runtime / Release Validation

Status: NOT_RUN — local Docker only; staging and production are deferred.

## Reality Gate Evaluation

- `REALITY-2026-003`: PARTIAL — staff UI and server wiring exist, but original identity/audit/security criteria remain.
- `REALITY-2026-011`: PASS — unproven authorization and staging scenarios are explicitly recorded.

## Unproven / Remaining

Invite acceptance lifecycle, MFA/step-up, audit viewer/export, separation of duties, and complete authorization matrix.
