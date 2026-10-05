---
task_id: MWEB-PORTAL-P0-005
status: PARTIAL
reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: WORKTREE-2026-10-05
tests: PASS
integration: PASS
e2e: NOT_RUN
migration: N/A
migration_na_reason: "Outlet schema, branch scope, and staff branch access already existed; this batch added portal UI wiring without schema changes."
observability: NOT_RUN
security_privacy: PARTIAL
rollback_recovery: PARTIAL
task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Staging/browser/device proof and cross-app outlet projection remain deferred until the feature batch is complete."
unproven_requirements: "Central catalog/outlet override, holiday/tax/payout profile, bulk action preview/rollback, and customer/courier cross-app outlet proof."
known_blockers: NONE
locally_actionable_remaining: "Implement outlet-specific catalog/price/availability override and business profile fields; add tenant isolation and outlet switching E2E."
blocker_resolution_attempts: NONE
unblock_condition: NONE
owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: "Run authenticated multi-outlet browser and cross-app scenarios."
dependency_chain_blocked: false
next_eligible_task: NONE
updated_at: 2026-10-05
---

# Evidence — MWEB-PORTAL-P0-005

## Acceptance Criteria Source

- Business profile, legal entity, brand, outlet address/contact, timezone/currency, operating hours, tax identity, payout account, and verification state remain server-owned.
- Owner/authorized staff can switch outlet and every query, export, cache, notification, and audit operation remains tenant/outlet scoped.
- Central catalog and outlet-specific overrides support preview, confirmation, partial failure reporting, retry, and rollback.
- Outlet lifecycle has explicit status and reason/approval semantics.

## Scope Implemented

- Added the authenticated `/outlet` Merchant Web page for owner outlet creation, name/address edits, active/inactive lifecycle, and a guard that prevents disabling the final active outlet.
- Added the Outlet navigation entry for owner capability `manage_branch`.
- Reused the server-authoritative branch context and `X-Merchant-Branch-ID` request scope already used by the portal shell.

## Files Changed

- `merchant-web/src/pages/Outlets.tsx` — outlet CRUD/lifecycle UI backed by branch APIs.
- `merchant-web/src/App.tsx` — authenticated outlet route.
- `merchant-web/src/components/Layout.tsx` — capability-gated outlet navigation.
- `TASKS.md` — current implementation and remaining requirements.

## Commands / Checks Run

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (merchant-web)
    result: PASS — TypeScript and Vite production build completed.

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; existing non-blocking React effect/type warnings remain.

    command: docker compose up -d --build merchant-service merchant-web
    result: PASS — refreshed local containers started healthy.

    command: authenticated GET /api/v1/merchant/branches/{merchant_id} and GET /api/v1/merchant/staff/{merchant_id}
    result: PASS — local Docker API returned server-owned branch and staff-scope data for the seeded merchant.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Merchant Web TypeScript/Vite build and lint completed without errors.

### Integration

Status: PASS

Evidence: The rebuilt local merchant-service returned real branch records and the existing portal context supplies the selected outlet scope.

### E2E

Status: NOT_RUN

Evidence: Authenticated browser switching, tenant isolation, customer outlet discovery, and courier pickup projection remain deferred.

### Migration

Status: N/A

Evidence: This slice reuses existing branch tables and does not change persistent schema.

### Security / Privacy

Status: PARTIAL

Evidence: Server-side owner/staff branch authorization is reused; full manual request authorization matrix and export/cache isolation remain unproven.

### Rollback / Recovery

Status: PARTIAL

Evidence: Outlet status updates are server-authoritative and reject unsafe deactivation when active orders exist; bulk rollback and recovery proof remain.

## External Runtime / Release Validation

Status: NOT_RUN — local Docker only; staging and production are intentionally deferred.

## Reality Gate Evaluation

- `REALITY-2026-003`: PARTIAL — portal outlet management is implemented and locally integrated, but original override and cross-app criteria remain.
- `REALITY-2026-011`: PASS — no staging or cross-app result is claimed.

## Unproven / Remaining

Central catalog/outlet override, business profile fields, outlet-specific financial/tax configuration, bulk operations, and authenticated cross-app tenant-isolation proof.
