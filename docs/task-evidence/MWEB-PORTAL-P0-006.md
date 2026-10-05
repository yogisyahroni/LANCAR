---
task_id: MWEB-PORTAL-P0-006
status: PARTIAL
reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: WORKTREE-2026-10-05
tests: PASS
integration: PASS
e2e: NOT_RUN
migration: PASS
migration_na_reason: NONE
observability: PARTIAL
security_privacy: PARTIAL
rollback_recovery: PARTIAL
task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Invite acceptance runtime/E2E, TOTP session proof, separation-of-duties runtime proof, and staging authorization matrix remain deferred."
unproven_requirements: "Invite acceptance runtime/E2E, TOTP session/device proof, separation-of-duties runtime proof, and complete API authorization matrix."
known_blockers: NONE
locally_actionable_remaining: "Run full authenticated owner/manager/staff and cross-outlet matrix; keep any failure on the same task until fixed."
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
- Added an append-only merchant audit scope column and index; new mutation events persist the resolved merchant tenant server-side.
- Added `GET /merchant/audit-logs` with owner/manager authorization, outlet scoping, redacted response fields, and CSV export.
- Added the Portal `Riwayat aktivitas` page, limited to the corporate staff-management capability.
- Added a seven-day invite expiry, persisted invite contact metadata, acceptance-attempt tracking, and atomic row-locked acceptance with a five-attempt/15-minute guard.

## Files Changed

- `merchant-web/src/pages/Staff.tsx` — invite, role, permission, outlet assignment, revoke/activate UI.
- `merchant-web/src/pages/Audit.tsx` — tenant/outlet-scoped activity timeline and CSV export.
- `merchant-web/src/lib/types.ts` — staff permission and branch-scope response fields.
- `backend/merchant-service/internal/domain/audit.go` — redacted audit contract.
- `backend/merchant-service/internal/repository/postgres_merchant_audit_repository.go` — tenant/outlet-scoped query.
- `backend/merchant-service/internal/handler/merchant_audit_handler.go` — authorization, pagination, and CSV response.
- `database/migrations/20261005000004_merchant_audit_scope.sql` — merchant scope/index for audit rows.
- `database/migrations/20261005000005_merchant_staff_invite_hardening.sql` — invite expiry, attempts, and acceptance metadata.
- `backend/merchant-service/internal/middleware/audit.go` — persist resolved merchant scope on new events.
- `TASKS.md` — current implementation and remaining requirements.

## Commands / Checks Run

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (merchant-web)
    result: PASS — TypeScript and Vite production build completed.

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; non-blocking existing effect warnings remain.

    command: goose -dir database/migrations postgres "postgres://postgres:1234@localhost:6432/tembus_session?sslmode=disable" up
    result: PASS — migration 20261005000004_merchant_audit_scope.sql applied to the local PgBouncer database.

    command: goose -dir database/migrations postgres "postgres://postgres:1234@localhost:6432/tembus_session?sslmode=disable" up
    result: PASS — migration 20261005000005_merchant_staff_invite_hardening.sql applied to the local PgBouncer database.

    command: go test ./... (backend/merchant-service)
    result: PASS — merchant service packages, handlers, repositories, middleware, and API route contract compiled and passed.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Merchant Web build/lint and local staff API response passed.

### Integration

Status: PASS

Evidence: UI calls existing server-side invite/update/branch-assignment endpoints and the new scoped audit endpoint; local migration and service tests passed.

### E2E

Status: NOT_RUN

Evidence: Invite acceptance, revoked-session rejection, cross-outlet authorization, audit export runtime, and manual unauthorized request tests remain; the atomic acceptance path is covered by compile/service integration wiring but not yet exercised in staging.

### Security / Privacy

Status: PARTIAL

Evidence: Corporate-only, owner/manager server guards, permission validation, branch ownership checks, redacted tenant/outlet-scoped audit reads, server-side invite expiry/rate limiting, gateway-propagated TOTP step-up guards, and a focused endpoint permission matrix exist; authenticated runtime/MFA session proof remains.

### Rollback / Recovery

Status: PARTIAL

Evidence: Role/status/branch updates and audit export are server commands; invite replay, permission rollback recovery, and session recovery are not yet proven.

## External Runtime / Release Validation

Status: NOT_RUN — local Docker only; staging and production are deferred.

## Reality Gate Evaluation

- `REALITY-2026-003`: PARTIAL — staff UI and tenant-scoped audit wiring exist, but invite hardening and runtime authorization proof remain.
- `REALITY-2026-011`: PASS — unproven authorization and staging scenarios are explicitly recorded.

## Unproven / Remaining

Invite acceptance proof, TOTP session/device runtime proof, separation of duties, cross-outlet runtime proof, and full staging authorization matrix.
