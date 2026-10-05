---
task_id: MWEB-PORTAL-P0-005
status: PARTIAL
reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: WORKTREE-2026-10-05-catalog-outlet-overrides
tests: PASS
integration: PASS
e2e: NOT_RUN
migration: PASS
migration_na_reason: NONE
observability: NOT_RUN
security_privacy: PARTIAL
rollback_recovery: PARTIAL
task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Staging/browser/device proof and cross-app outlet projection remain deferred until the feature batch is complete."
unproven_requirements: "Customer-facing promo calculation/stacking, holiday/tax/payout business profile, bulk action preview/rollback, and customer/courier cross-app outlet proof. Provider/live staging and authenticated multi-outlet browser qualification remain unproven."
known_blockers: NONE
locally_actionable_remaining: "Implement customer-facing promo calculation/stacking, holiday/tax/payout profile, bulk action preview/rollback, and authenticated tenant/outlet isolation E2E."
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
- Enforced selected-branch scope in the menu repository for list/count/read, create/import, update, availability, inventory, delete, images, schedules, and variants. Unscoped owner aggregation remains explicit for existing aggregate paths; the portal branch context is applied server-side.
- Added `merchant_menu_item_outlet_overrides` as a separate, database-guarded overlay for outlet price, availability, and promo association. NULL values inherit the canonical catalog; cross-tenant menu/branch/promo links are rejected by a database trigger.
- Added durable idempotency request records, optimistic version checks, append-only audit events, merchant API endpoints, and Merchant Web controls for the selected outlet.
- Updated order-service checkout/discovery reads and stock reservation checks to use the effective outlet price/availability without changing the canonical menu row.

## Files Changed

- `merchant-web/src/pages/Outlets.tsx` — outlet CRUD/lifecycle UI backed by branch APIs.
- `merchant-web/src/App.tsx` — authenticated outlet route.
- `merchant-web/src/components/Layout.tsx` — capability-gated outlet navigation.
- `database/migrations/20261005000013_merchant_menu_item_outlet_overrides.sql` — outlet override, idempotency, ownership constraints, and trigger.
- `backend/merchant-service/internal/domain/menu_outlet_override.go` — capability contract.
- `backend/merchant-service/internal/repository/postgres_menu_outlet_override_repository.go` — transactional upsert/list, idempotency, and audit.
- `backend/merchant-service/internal/service/merchant_service.go` and `backend/merchant-service/internal/handler/merchant_handler.go` — scope authorization and API.
- `backend/order-service/internal/repository/food_repository.go` — effective outlet projection in checkout/discovery and reservation guard.
- `merchant-web/src/pages/Menu.tsx` and `merchant-web/src/lib/types.ts` — selected-outlet override UI and types.
- `backend/order-service/internal/repository/merchant_discovery_checkout_release_gate_integration_test.go` — database-backed effective override assertion.
- `TASKS.md` — current implementation and remaining requirements.

## Commands / Checks Run

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (merchant-web)
    result: PASS — TypeScript and Vite production build completed.

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; existing non-blocking React effect/type warnings remain.

    command: docker compose up -d --build merchant-service merchant-web
    result: PASS — refreshed local containers started healthy.

    command: goose -dir database/migrations postgres "postgres://postgres:1234@localhost:6432/tembus_session?sslmode=disable" up
    result: PASS — applied 20261005000013_merchant_menu_item_outlet_overrides.sql.

    command: go test ./internal/... (backend/merchant-service)
    result: PASS — domain, handler, repository, service, and override validation tests passed.

    command: TEMBUS_MERCHANT_LIFECYCLE_TEST_DATABASE_URL=local TEMBUS_MERCHANT_LIFECYCLE_TEST_MERCHANT_ID=e3d09c2e-2eea-4021-954b-1f60a56e91a1 go test ./internal/repository -run TestMerchantDiscoveryCheckoutReleaseGateIntegration -count=1 -v (backend/order-service)
    result: PASS — checkout reads effective outlet price/availability and then restores the fixture.

    command: go build ./... (backend/merchant-service and backend/order-service)
    result: PASS — both services compiled after the effective outlet read-path changes.

    command: VITE_API_URL=https://api.bawain.my.id/api/v1 VITE_WS_URL=wss://api.bawain.my.id VITE_SOCKET_URL=https://api.bawain.my.id npm run build (merchant-web)
    result: PASS — TypeScript and Vite production build completed.

    command: docker compose up -d --build --no-deps merchant-service order-service merchant-web; GET http://localhost:8085/health; GET http://localhost:3086/
    result: PASS — rebuilt local containers healthy; merchant health HTTP 200 and Merchant Web HTTP 200.

    command: unauthenticated GET/invalid-user PUT /api/v1/merchant/menu/outlet-overrides
    result: PASS — endpoint rejects missing/invalid gateway identity (401/400).

    command: authenticated local GET + PUT + repeated PUT + versioned clear /api/v1/merchant/menu/outlet-overrides
    result: PASS — selected owner outlet returned database-backed rows; first PUT returned 200, repeated idempotency key returned 200 with Idempotent-Replay=true, and versioned clear returned 200.

    command: SQL transaction against local PostgreSQL
    result: PASS — database trigger/effective projection returned override price 77777 and availability false, then rolled back.

    command: authenticated GET /api/v1/merchant/branches/{merchant_id} and GET /api/v1/merchant/staff/{merchant_id}
    result: PASS — local Docker API returned server-owned branch and staff-scope data for the seeded merchant.

    command: git diff --check
    result: PASS — no whitespace errors in the catalog/outlet implementation.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Merchant Web TypeScript/Vite build and merchant/order Go tests passed; order-service integration coverage reads the effective outlet override from PostgreSQL.

### Integration

Status: PASS

Evidence: PostgreSQL migration and SQL trigger projection passed locally; rebuilt merchant/order services started healthy. Repository queries apply selected outlet scope and order checkout uses the effective override. Authenticated cross-branch negative tests are not yet run.

### E2E

Status: NOT_RUN

Evidence: Authenticated browser switching, tenant isolation, customer outlet discovery, and courier pickup projection remain deferred.

### Migration

Status: PASS

Evidence: Migration `20261005000013_merchant_menu_item_outlet_overrides.sql` applied successfully to the local PostgreSQL database; ownership trigger and rollback transaction were checked.

### Security / Privacy

Status: PARTIAL

Evidence: Server-side owner/staff branch authorization is reused; full manual request authorization matrix and export/cache isolation remain unproven.

### Rollback / Recovery

Status: PARTIAL

Evidence: Outlet status updates are server-authoritative and reject unsafe deactivation when active orders exist; bulk rollback and recovery proof remain.

## External Runtime / Release Validation

Status: NOT_RUN — local Docker only; staging and production are intentionally deferred.

## Reality Gate Evaluation

- `REALITY-2026-003`: PARTIAL — portal outlet management, separate outlet override persistence, and effective checkout reads are implemented and locally integrated, but business profile, bulk, and cross-app criteria remain.
- `REALITY-2026-011`: PASS — no staging or cross-app result is claimed.

## Unproven / Remaining

Customer-facing promo calculation/stacking, business profile holiday/tax/payout configuration, bulk preview/rollback, authenticated cross-outlet authorization matrix, and customer/courier cross-app tenant-isolation proof. Local compilation/container health does not prove staging readiness.
