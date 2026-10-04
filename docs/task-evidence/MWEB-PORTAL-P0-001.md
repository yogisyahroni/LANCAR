---
task_id: MWEB-PORTAL-P0-001
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: 958b4843

tests: PASS
integration: PARTIAL
e2e: NOT_RUN

migration: N/A
migration_na_reason: "The context endpoint reuses existing merchant, branch, staff, and device-session tables; no schema change was made."

observability: PARTIAL
security_privacy: PARTIAL
rollback_recovery: NOT_RUN

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: NOT_RUN
release_followups: "Run authenticated browser E2E, cross-role tenant-isolation checks, and staging smoke after deployment."

unproven_requirements: "Full shell parity, capability-aware navigation for every role, outlet switcher UX, notification/help/search, audit-event proof, deep-link/session-expiry browser flows, responsive proof, and API/browser permission E2E remain unproven."
known_blockers: NONE

locally_actionable_remaining: "Add/verify the remaining shell capabilities and execute API, browser, responsive, tenant-isolation, and expired-session verification."

blocker_resolution_attempts: NONE
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: NONE

dependency_chain_blocked: false
next_eligible_task: NONE

updated_at: 2026-10-04
---

# Evidence — MWEB-PORTAL-P0-001

## Acceptance Criteria Source

Original requirements from `task-merchant-web-growth-p0-p2-2026.md`:

- App shell responsif: header, outlet switcher, notification center, help, account menu, breadcrumb, global search, command feedback, loading/error/empty state, dan session-expiry recovery.
- `merchant_id`, `business_id`, `outlet_id`, role, permission, verification state, country/market, currency, dan timezone dimuat dari server session/token; jangan dipercaya dari query parameter.
- Menu navigasi berbasis capability: Beranda, Pesanan, Menu, Promo, Laporan, Keuangan, Staff, Integrasi, Bantuan, dan Pengaturan.
- Route guard, object-level authorization, tenant isolation, CSRF/session protection, audit event, dan deep link kembali ke halaman tujuan setelah login.
- Support desktop, tablet, dan browser mobile tanpa mengorbankan operasi order yang mendesak.

Acceptance criteria remain unproven until role and browser E2E evidence exists:

- Perorangan, owner PT, manager outlet, kasir, kitchen, finance, dan support melihat navigasi serta data yang berbeda sesuai server policy.
- User tidak dapat mengganti tenant, outlet, atau object ID untuk membaca/menulis data tenant lain.
- Semua aksi sensitif menghasilkan audit event lengkap.
- Refresh, deep link, multi-tab, expired session, dan koneksi putus mempertahankan konteks tanpa aksi ganda.
- Kontrak permission diuji melalui API dan browser E2E.

## Scope Implemented

- Added `GET /api/v1/merchant/context`, which resolves the merchant from the authenticated user or active staff assignment; it does not accept a client-supplied merchant ID.
- Returned server-owned merchant data, allowed active branches, current branch, effective role, granted permissions, capability names, and whether a device session is required.
- Added staff branch scoping and owner/staff capability separation in the merchant access service.
- Added scoped browser session bootstrap for staff. The opaque device-session token is kept in `sessionStorage`, attached to subsequent API calls, validated during context bootstrap, and recreated once when expired/revoked.
- Updated protected portal screens and login to consume the portal context instead of assuming `/merchant/profile` is available for staff users.

## Files Changed

- `backend/merchant-service/internal/domain/merchant_access.go` — portal context contract.
- `backend/merchant-service/internal/service/merchant_access_service.go` — owner/staff context resolution and capabilities.
- `backend/merchant-service/internal/handler/merchant_access_handler.go` — authenticated context endpoint and device-session validation.
- `backend/merchant-service/cmd/api/main.go` — route registration.
- `backend/merchant-service/internal/service/merchant_access_context_test.go` — capability mapping tests.
- `merchant-web/src/lib/portal-context.ts` — context and staff-session bootstrap.
- `merchant-web/src/lib/auth.ts` and `merchant-web/src/lib/api.ts` — scoped session storage and request headers.
- `merchant-web/src/lib/types.ts` — branch/context types.
- `merchant-web/src/components/ProtectedRoute.tsx`, `Layout.tsx`, `pages/Login.tsx`, `Dashboard.tsx`, `Settings.tsx`, `Staff.tsx` — server-context consumption.

## Commands / Checks Run

    command: go test ./...
    result: PASS — merchant-service packages and repository tests.

    command: npm run build
    result: PASS — merchant-web TypeScript/Vite production build.

    command: npm run lint
    result: PASS — 0 errors, 12 pre-existing warnings remain.

    command: git diff --check
    result: PASS.

## Task-Local Verification

### Tests

Status: PASS

Evidence: `go test ./...` passed, including owner/staff capability mapping tests.

### Integration

Status: PARTIAL

Evidence: Merchant-service compiles and the route is registered through the existing API gateway merchant proxy. Live gateway/database context calls have not yet been executed in this turn.

### E2E

Status: NOT_RUN

Evidence: Authenticated browser E2E for owner, PT staff roles, deep links, and expired device sessions is still required.

### Migration

Status: N/A

Evidence: Existing tables and migrations are reused; no schema change.

### Observability

Status: PARTIAL

Evidence: Existing API/service error handling remains active. A dedicated context/bootstrap metric and audit proof are not yet verified.

### Security / Privacy

Status: PARTIAL

Evidence: Merchant and branch scope are derived server-side; staff branch access uses existing database assignment and device-session authorization. Tenant-isolation and object-ID negative tests remain.

### Rollback / Recovery

Status: NOT_RUN

Evidence: Client retries context discovery after an expired/revoked staff session, but deployed rollback/recovery has not been exercised.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value: `false`

Reason: The original task can be implemented and tested locally; staging proof is a separate release gate.

### External Runtime Validation

Status: NOT_RUN

Evidence: No authenticated staging smoke was claimed.

### Release Readiness

Status: NOT_RUN

Evidence: This task remains PARTIAL and is not a production-readiness declaration.
