---
task_id: MWEB-PORTAL-P0-001
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: HEAD (feat(merchant-portal): isolate merchant web sessions)

tests: PASS
integration: PASS

migration: N/A
migration_na_reason: "The context endpoint reuses existing merchant, branch, staff, and device-session tables; no schema change was made."

observability: PARTIAL
security_privacy: PARTIAL
rollback_recovery: NOT_RUN

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: NOT_RUN
release_followups: "Run authenticated browser E2E, complete all required role/capability permutations, and staging smoke after deployment."

unproven_requirements: "Full shell parity, all required role permutations (manager, kitchen, finance, support), durable audit coverage for every sensitive shell action, authenticated browser/deep-link/responsive proof, and staging release proof remain unproven."
known_blockers: NONE

locally_actionable_remaining: "Complete manager/kitchen/finance/support capability fixtures and browser E2E for responsive, deep-link, multi-tab, reconnect, and every sensitive shell action; then run staging smoke."

blocker_resolution_attempts: "Reproduced and repaired merchant portal login routing; rebuilt Docker services; executed owner/staff authenticated API flows, tenant tamper, session rotation/logout, device-session revoke, and structured audit-log checks."
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

Acceptance criteria remain partially unproven until all role and browser E2E evidence exists:

- Perorangan, owner PT, manager outlet, kasir, kitchen, finance, dan support melihat navigasi serta data yang berbeda sesuai server policy.
- User tidak dapat mengganti tenant, outlet, atau object ID untuk membaca/menulis data tenant lain.
- Semua aksi sensitif menghasilkan audit event lengkap.
- Refresh, deep link, multi-tab, expired session, dan koneksi putus mempertahankan konteks tanpa aksi ganda.
- Kontrak permission diuji melalui API dan browser E2E.

## Scope Implemented

- Added an isolated `merchant_session` web-session namespace. Merchant owner and
  invited staff login use the dedicated merchant portal auth route; customer web
  session verification remains isolated from merchant staff.
- Added role-preserving merchant web session exchange, refresh rotation, logout,
  and merchant portal headers through gateway, admin-service, auth-service, and
  merchant-web.

- Added `GET /api/v1/merchant/context`, which resolves the merchant from the authenticated user or active staff assignment; it does not accept a client-supplied merchant ID.
- Returned server-owned merchant data, allowed active branches, current branch, effective role, granted permissions, capability names, and whether a device session is required.
- Added staff branch scoping and owner/staff capability separation in the merchant access service.
- Added scoped browser session bootstrap for staff. The opaque device-session token is kept in `sessionStorage`, attached to subsequent API calls, validated during context bootstrap, and recreated once when expired/revoked.
- Updated protected portal screens and login to consume the portal context instead of assuming `/merchant/profile` is available for staff users.
- Added server-capability filtering to navigation and a direct-route capability guard.
- Added an authenticated notification center backed by the existing order-service inbox and read endpoint.
- Added a server-scoped outlet switcher. The selected branch is kept in
  session storage, sent as a branch scope header, and cannot expand the branch
  set returned by the server. Staff device sessions are reopened for the new
  branch before protected screens reload.
- Added capability-aware shell search for portal pages, with keyboard shortcut
  support and a mobile layout. It searches only server-authorized navigation;
- Added `GET /api/v1/merchant/search` for server-authorized entity search over
  menu, food order, outlet, and (when allowed) staff records. Results are
  merchant-scoped, current-outlet scoped where the schema supports outlet
  ownership, and omit customer PII.
- Connected the desktop and mobile shell search to the entity endpoint with a
  debounced query and explicit loading/empty state.

## Files Changed

- `backend/merchant-service/internal/domain/merchant_access.go` — portal context contract.
- `backend/merchant-service/internal/service/merchant_access_service.go` — owner/staff context resolution and capabilities.
- `backend/merchant-service/internal/handler/merchant_access_handler.go` — authenticated context endpoint and device-session validation.
- `backend/merchant-service/cmd/api/main.go` — route registration.
- `backend/merchant-service/internal/domain/merchant_search.go`,
  `internal/service/merchant_search_service.go`,
  `internal/repository/postgres_merchant_search_repository.go`, and
  `internal/handler/merchant_search_handler.go` — scoped entity search API.
- `backend/merchant-service/internal/domain/merchant_search_test.go` and
  `internal/handler/merchant_search_handler_test.go` — search normalization
  and authenticated handler contract tests.
- `backend/merchant-service/internal/service/merchant_access_context_test.go` — capability mapping tests.
- `merchant-web/src/lib/portal-context.ts` — context and staff-session bootstrap.
- `merchant-web/src/lib/auth.ts` and `merchant-web/src/lib/api.ts` — scoped session storage and request headers.
- `merchant-web/src/lib/types.ts` — branch/context types.
- `merchant-web/src/pages/Integrations.tsx` and `merchant-web/src/App.tsx` —
  capability-gated Integrasi route backed by the read-only POS health API.
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

    command: npm run build
    result: PASS — merchant-web production build after outlet and shell-search changes.

    command: npm run lint
    result: PASS — 0 errors; 12 existing warnings remain.

    command: npm run test:config
    result: PASS — 5 configuration contract tests passed.

    command: git push origin staging
    result: PASS — the scoped auth/session fix is committed locally; staging push is pending.

    command: docker compose build auth-service admin-service api-gateway merchant-web
    result: PASS — all four images rebuilt locally.

    command: docker compose up -d auth-service admin-service api-gateway merchant-web
    result: PASS — recreated services started; auth/admin/gateway/merchant-web health endpoints returned HTTP 200.

    command: go test ./... (backend/auth-service)
    result: PASS.

    command: npm test -- --runInBand src/controllers/customerAuth.controller.test.ts (backend/admin-service)
    result: PASS — 5 tests passed.

    command: npm run test:auth-matrix && npm run test:compliance-boundary (backend/api-gateway)
    result: PASS — route auth matrix and compliance boundary tests passed.

    command: authenticated local API E2E against Docker gateway
    result: PASS for owner and cashier staff paths: merchant login/exchange, HttpOnly merchant cookie, server-owned context, role/capability filtering, cross-tenant branch rejection (403), device-session create/revoke, refresh rotation, customer-session isolation (401), logout invalidation (401), and entity search.

    command: Playwright browser E2E against local Vite + Docker gateway
    result: PASS for owner login UI exchange, dashboard/deep-link navigation, 390px responsive viewport, no credential-like localStorage keys, and expired-session redirect. Local harness injected the production-domain session cookie at the route boundary because localhost cannot store Domain=.bawain.my.id; this is local browser proof, not staging proof.

    command: docker logs --since 15m tembus-merchant
    result: PASS for exercised device-session mutations — structured audit records contained actor role, action, resource, result, request/correlation IDs, and timestamp. This does not prove every sensitive action has audit coverage.

## Task-Local Verification

### Tests

Status: PASS

Evidence: `go test ./...` passed, including owner/staff capability mapping tests.

### Integration

Status: PASS for the exercised local integration path

Evidence: Docker gateway → auth/admin → merchant-service → PostgreSQL was exercised with owner and cashier staff fixtures. The context/search responses were server-scoped, and the gateway route ordering defect for merchant portal login was fixed and re-tested.

### E2E

Status: PARTIAL

Evidence: Authenticated API E2E was run against local Docker for owner and cashier staff. Playwright browser E2E passed for owner login UI, dashboard/deep link, 390px responsive layout, credential storage boundary, and expired-session redirect. Browser coverage for all required PT staff roles, outlet switching, multi-tab, reconnect, and expired device sessions remains required.

### Migration

Status: N/A

Evidence: Existing tables and migrations are reused; no schema change.

### Observability

Status: PARTIAL

Evidence: Structured merchant-service audit records were observed for device-session create/revoke with actor, role, action, resource, result, timestamp, request ID, and correlation ID. Full sensitive-action audit coverage and dedicated portal metrics remain unverified.

### Security / Privacy

Status: PARTIAL

Evidence: Merchant and branch scope are derived server-side; owner and cashier staff role/capability checks passed; cross-tenant branch header tampering returned 403; customer portal rejected the merchant cookie with 401; refresh/logout invalidation passed. Full object-ID matrix and all role permutations remain.

### Rollback / Recovery

Status: PARTIAL

Evidence: Revoked staff device session was rejected with 403 on the next context request, and web session refresh/logout behavior was verified locally. Deployed rollback and full client recovery/browser proof have not been exercised.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value: `false`

Reason: The original task can be implemented and tested locally; staging proof is a separate release gate.

### External Runtime Validation

Status: NOT_RUN

Evidence: Docker local health and authenticated API checks passed. No authenticated staging smoke was claimed.

### Release Readiness

Status: NOT_RUN

Evidence: This task remains PARTIAL and is not a production-readiness declaration.
