---
task_id: MWEB-PORTAL-P0-001
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: 7f82e0cc (merchant-portal shell, session resilience, and capability-safe dashboard)

tests: PASS
integration: PASS

migration: N/A
migration_na_reason: "The context endpoint reuses existing merchant, branch, staff, and device-session tables; no schema change was made."

observability: PARTIAL
security_privacy: PARTIAL
rollback_recovery: PARTIAL

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: NOT_RUN
release_followups: "Complete remaining shell route/deep-link/responsive permutations, durable audit coverage for every sensitive shell action, and staging smoke after deployment."

unproven_requirements: "Full shell parity, durable audit coverage for every sensitive shell action, authenticated browser proof for every role's responsive permutation, support/admin browser permutations, and staging release proof remain unproven. The merchant-to-Admin Support case intake, Admin case detail, timeline, and status transition are proven locally through API and browser evidence."
known_blockers: NONE

locally_actionable_remaining: "Cover every sensitive mutation audit, remaining role-specific responsive/support/admin browser permutations, and staging smoke."

blocker_resolution_attempts: "Reproduced and repaired merchant portal login routing, the order-service merchant_session boundary for notifications, shared support-case auth/CSRF handling, duplicate device-session bootstrap, cross-tab logout delivery, capability-unsafe report loading, structured error rendering, inactive outlet switching, and durable merchant mutation audit persistence; rebuilt Docker admin-service and merchant-service; executed owner/staff authenticated API flows, merchant-to-support intake, Admin case list/detail/status transition, tenant tamper, session rotation/logout, device-session revoke, browser role matrix, multi-tab logout, degraded network recovery state, outlet switching, and success/failure audit-log checks."
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
- Removed `manage_staff` from the server capability projection for merchant
  perorangan, so the shell cannot advertise corporate-only staff management.
- Added service-level role matrix coverage for owner perusahaan, owner
  perorangan, manager, cashier, kitchen, marketing, and finance permissions.
- Added an authenticated notification center backed by the existing order-service inbox and read endpoint.
- Fixed shared support-case intake so a database-backed `merchant_session` can
  create a case without being misclassified as a customer session; Admin
  Support Console retains its separate admin-session and role boundary.
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
- Added an online/offline/degraded connection banner. Network failures do not
  automatically replay commands or clear the current shell context; recovery
  is explicit after the browser reports connectivity again.
- Locked the support boundary at the merchant-session exchange: Admin/support
  roles are rejected before a database lookup or cookie creation. Support
  access remains an Admin Support Console, case-scoped, redacted, read-only
  workflow rather than a Merchant Web role or general impersonation path.
- Extended the order-service web-session verifier to accept the dedicated
  `merchant_session` cookie used by the portal notification inbox, while still
  resolving the user and role from the database-backed `web_sessions` row.

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
- `backend/admin-service/src/controllers/customerAuth.controller.test.ts` — negative merchant-session exchange coverage for Admin/support roles.
- `backend/admin-service/src/middlewares.ts` — shared support intake accepts and validates merchant web sessions without weakening customer-only session checks.
- `backend/admin-service/src/middleware/csrfProtection.ts` — merchant web sessions participate in the shared cookie-CSRF protection boundary.
- `backend/admin-service/src/supportCasesContract.test.ts` — support route contract covers merchant-session and CSRF wiring.
- `backend/order-service/internal/middleware/auth_middleware.go` — accept the database-backed `merchant_session` cookie for order-owned portal routes.
- `backend/order-service/internal/middleware/auth_middleware_test.go` — regression coverage for valid and invalid merchant portal sessions.
- `merchant-web/src/lib/portal-context.ts` — context and staff-session bootstrap.
- `merchant-web/src/lib/auth.ts` and `merchant-web/src/lib/api.ts` — scoped session storage, cross-tab auth events, request headers, and safe error text normalization.
- `merchant-web/src/pages/Dashboard.tsx` — capability-gated report loading for non-finance operational roles.
- `merchant-web/src/components/Layout.tsx` — active-outlet-only switching and branch scope selection.
- `merchant-web/src/lib/types.ts` — branch/context types.
- `merchant-web/src/pages/Integrations.tsx` and `merchant-web/src/App.tsx` —
  capability-gated Integrasi route backed by the read-only POS health API.
- `backend/merchant-service/internal/middleware/audit.go` — durable,
  tenant/outlet-aware mutation audit recorder backed by the canonical
  append-only `audit_logs` table.
- `backend/merchant-service/internal/middleware/base_middleware.go` and
  `backend/merchant-service/internal/middleware/base_middleware_test.go` —
  success/failure mutation audit middleware and unit coverage.
- `backend/merchant-service/cmd/api/main.go` — wires the audit recorder into
  every merchant-service route chain.
- `merchant-web/src/components/ProtectedRoute.tsx`, `Layout.tsx`, `pages/Login.tsx`, `Dashboard.tsx`, `Settings.tsx`, `Staff.tsx` — server-context consumption.
- `merchant-web/src/lib/network.ts` — shell network-failure event boundary.

## Commands / Checks Run

    command: go test ./...
    result: PASS — merchant-service packages and repository tests.

    command: go test ./... (backend/merchant-service after individual-owner capability guard)
    result: PASS — owner perusahaan, owner perorangan, manager, cashier, kitchen, marketing, and finance capability matrix tests passed.

    command: docker compose build merchant-service merchant-web && docker compose up -d merchant-service merchant-web
    result: PASS — affected images rebuilt; merchant-service and merchant-web health endpoints returned HTTP 200.

    command: npm run build (merchant-web, VITE_API_URL=http://localhost:8080/api/v1)
    result: PASS — explicit local API configuration; network resilience banner included in the production bundle.

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

    command: npm run build (merchant-web, VITE_API_URL=http://localhost:8080/api/v1)
    result: PASS — TypeScript/Vite production build completed after session,
    error-boundary, and capability-gated dashboard changes.

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; 11 pre-existing warnings remain.

    command: Playwright authenticated browser E2E against local Vite + Docker gateway
    result: PASS — owner, manager, cashier, kitchen, and finance rendered the
    dashboard with role-specific navigation and no console errors; staff created
    exactly one device session per tab while owner created none; cross-tab logout
    redirected the second tab to `/masuk`; an aborted notification request showed
    the degraded connection banner while preserving the dashboard and recovery
    action; random branch scope tampering returned 403.

    command: reversible authenticated mutation audit E2E plus docker logs --since 2m tembus-merchant
    result: PASS — owner toggle-open mutation and restoration both returned 200;
    structured `audit_trail` records contained actor ID, actor role, action,
    resource, result status, timestamp, request ID, and correlation ID. The log
    path is not evidence of durable audit storage for every sensitive action.

    command: Playwright manager device-session recovery E2E with local fixture revocation
    result: PASS — after the active manager device session was revoked in the
    local PostgreSQL fixture, reload created exactly one replacement session and
    preserved the dashboard at `/dashboard`.

    command: Playwright authenticated portal route and capability-guard smoke
    result: PASS — owner opened `/dashboard`, `/pesanan`, `/menu`, `/promo`,
    `/laporan`, `/settlement`, `/staff`, `/integrasi`, and `/pengaturan` with
    no browser console errors or API failures; kitchen received the explicit
    capability-denied state for `/promo`, `/laporan`, `/settlement`, and
    `/staff` without probing forbidden APIs.

    command: Playwright outlet-switch smoke with temporary local branch fixture
    result: PASS — inactive test branches were hidden, one active branch option
    was displayed, selection changed the server scope stored in session storage,
    and returning to the MAIN branch restored the original scope. Test branches
    were deactivated after verification.

    command: docker compose build merchant-web && docker compose up -d merchant-web
    result: PASS — rebuilt the local Merchant Web image after the active-branch
    guard and served HTTP 200 from `http://localhost:3086/`.

    command: go test ./... (backend/merchant-service after durable audit wiring)
    result: PASS — all merchant-service packages passed, including middleware
    coverage for successful mutations, failed mutations with an HTTP reason,
    and no audit for read requests.

    command: docker compose up -d --build merchant-service && direct local
    authenticated mutation probe plus PostgreSQL audit query
    result: PASS — toggle-open success and restoration returned 200; malformed
    mutation returned 400; each produced a durable `audit_logs` row. The
    payload contained effective role, tenant/business ID, outlet ID, object ID,
    result, failure reason, correlation ID, request ID, and status. Owner scope
    was resolved from the supplied outlet rather than an arbitrary duplicate
    merchant owned by the same local fixture user; a manager staff fixture also
    persisted effective role `manager`.

    command: git push origin staging
    result: PASS — the previous merchant portal auth/session implementation is synchronized to origin/staging; this follow-up is recorded in the next scoped commit.

    command: docker compose build auth-service admin-service api-gateway merchant-web
    result: PASS — all four images rebuilt locally.

    command: docker compose up -d auth-service admin-service api-gateway merchant-web
    result: PASS — recreated services started; auth/admin/gateway/merchant-web health endpoints returned HTTP 200.

    command: go test ./... (backend/auth-service)
    result: PASS.

    command: npm test -- --runInBand src/controllers/customerAuth.controller.test.ts (backend/admin-service)
    result: PASS — 12 tests passed, including rejection of all configured Admin/support roles before database access or merchant cookie creation.

    command: npm test -- --runInBand (backend/admin-service)
    result: PASS — 138 test suites and 664 tests passed.

    command: go test ./... (backend/order-service)
    result: PASS — all order-service packages passed, including merchant_session authentication regression tests.

    command: docker compose up -d --build order-service
    result: PASS — order-service image rebuilt and container recreated successfully.

    command: npm test -- --runInBand src/supportCasesContract.test.ts && npm run build (backend/admin-service)
    result: PASS — support route contract 2/2 tests passed and TypeScript build completed after merchant-session support intake fix.

    command: docker compose up -d --build admin-service
    result: PASS — admin-service image rebuilt and container recreated successfully.

    command: local authenticated API E2E for merchant notification inbox
    result: PASS — merchant login 200, web-session exchange 200, and GET /api/v1/notifications?limit=8 returned 200 with database-backed inbox data.

    command: local authenticated API E2E for merchant support intake and Admin Support Console
    result: PASS — merchant login/exchange 200, POST /api/v1/support/cases 200, Admin list 200 containing the created case, Admin status transition 200, detail 200, and append-only event count increased to 2.

    command: Playwright browser E2E against live local Admin Support Console and Docker gateway
    result: PASS — `/cases` loaded with authenticated admin session, a database-backed case opened in the detail dialog, Timeline and Authoritative references were visible, and the manual status gate changed to `pending_internal` through a successful PATCH.

    command: npm run test:auth-matrix && npm run test:compliance-boundary (backend/api-gateway)
    result: PASS — route auth matrix and compliance boundary tests passed.

    command: authenticated local API E2E against Docker gateway
    result: PASS for owner and cashier staff paths: merchant login/exchange, HttpOnly merchant cookie, server-owned context, role/capability filtering, cross-tenant branch rejection (403), device-session create/revoke, refresh rotation, customer-session isolation (401), logout invalidation (401), and entity search.

    command: Playwright browser E2E against local Vite + Docker gateway
    result: PASS for owner login UI exchange, dashboard/deep-link navigation, 390px responsive viewport, no credential-like localStorage keys, and expired-session redirect. Local harness injected the production-domain session cookie at the route boundary because localhost cannot store Domain=.bawain.my.id; this is local browser proof, not staging proof.

    command: Playwright authenticated role/capability matrix against local Vite + Docker gateway
    result: PASS — owner, manager, cashier, kitchen, and finance reached the dashboard; each rendered server-projected navigation and notification GET returned 200. No console errors were observed in the notification smoke path.

    command: docker logs --since 15m tembus-merchant
    result: PASS for exercised device-session mutations — structured audit records contained actor role, action, resource, result, request/correlation IDs, and timestamp. This does not prove every sensitive action has audit coverage.

## Task-Local Verification

### Tests

Status: PASS

Evidence: `go test ./...` passed, including the owner/staff capability matrix and
the corporate-only `manage_staff` guard for individual merchants.

### Integration

Status: PASS for the exercised local integration path

Evidence: Docker gateway → auth/admin → merchant-service/order-service → PostgreSQL was exercised with owner and staff fixtures. The context/search/notification responses were server-scoped, and the gateway/order-service authentication boundaries were fixed and re-tested.

### E2E

Status: PARTIAL

Evidence: Authenticated API E2E was run against local Docker for owner and staff. Playwright browser E2E passed for owner login UI, dashboard/deep link, 390px responsive layout, credential storage boundary, expired-session redirect, owner/manager/cashier/kitchen/finance capability matrix, exactly-once staff device-session bootstrap, multi-tab logout propagation, degraded network recovery state, revoked device-session recovery, random branch tamper rejection, owner route smoke, kitchen capability-denied routes, outlet switching, and the live Admin Support Console case detail/status flow. Browser coverage for every role's responsive permutation and all required support/admin role permutations remains required.

### Migration

Status: N/A

Evidence: Existing tables and migrations are reused; no schema change.

### Observability

Status: PARTIAL

Evidence: Durable merchant mutation audit records were verified in the local
`audit_logs` table for owner success/restoration, owner failure, and manager
failure. The generic route middleware records authenticated POST/PUT/PATCH/
DELETE outcomes without request bodies, and resolves tenant/outlet/object scope
server-side. Full semantic coverage for every sensitive action and dedicated
portal metrics remain unverified.

### Security / Privacy

Status: PARTIAL

Evidence: Merchant and branch scope are derived server-side; owner and cashier staff role/capability checks passed; configured Admin/support roles are rejected before merchant-session creation; merchant support intake validates the dedicated merchant session and cookie-CSRF boundary; cross-tenant branch header tampering returned 403; customer portal rejected the merchant cookie with 401; refresh/logout invalidation passed. Full object-ID matrix and all browser role permutations remain.

### Rollback / Recovery

Status: PARTIAL

Evidence: Revoked staff device session was rejected with 403 on the next context request, and a browser reload recreated the scoped device session while preserving `/dashboard`. Web session refresh/logout behavior was verified locally. Deployed rollback and production recovery have not been exercised.

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
