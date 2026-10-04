---
task_id: MWEB-PORTAL-P0-002
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: 9859a0ff

tests: PASS
integration: PARTIAL
e2e: NOT_RUN

migration: PARTIAL
migration_na_reason: "N/A — three persistent schema/event changes were introduced."

observability: PARTIAL
security_privacy: PASS
rollback_recovery: PARTIAL

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: NOT_RUN
release_followups: "Authenticated staging smoke, cross-app event propagation, and release gates remain required before production rollout."

unproven_requirements: "Authenticated browser/cross-app E2E; live consumer/cache propagation; payout-held alert coverage beyond the finance statement window; complete finance scope for a selected outlet; migration down/recovery drill."
known_blockers: NONE

locally_actionable_remaining: "Continue the same task with authenticated browser and cross-app verification, then close remaining finance-window and recovery gaps before marking COMPLETE."

blocker_resolution_attempts: "Rebuilt merchant-service, order-service, and merchant-web; applied the three new migration up paths to the Docker PostgreSQL instance after the goose image registry denied access; verified schema, triggers, service health, unauthenticated route denial, and executed the expanded order-count SQL directly against the active Docker PostgreSQL instance."
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: NONE

dependency_chain_blocked: true
next_eligible_task: NONE

updated_at: 2026-10-04
---

# Evidence — MWEB-PORTAL-P0-002

## Acceptance Criteria Source

Original requirements from `task-merchant-web-growth-p0-p2-2026.md`:

- Data beranda dapat ditelusuri ke endpoint/database/event yang sama dengan halaman detail; tidak ada angka mock atau copy yang menyatakan real-time tanpa freshness timestamp.
- Toggle buka/jeda/mode sibuk/terima otomatis memiliki optimistic state yang aman, rollback saat gagal, retry, idempotency, dan notifikasi ke channel yang relevan.
- Perubahan jam operasi dan status outlet langsung tercermin pada Customer, Courier, Merchant Android, dan Admin sesuai cache invalidation/event contract.
- Dashboard multi-outlet menunjukkan agregasi dan outlet detail secara jelas; tidak mencampur currency, timezone, settlement window, atau role scope.

## Scope Implemented

- Added a server-authoritative `GET /api/v1/merchant/dashboard` read model. It resolves the tenant and selected outlet from the authenticated merchant portal context, returns one `data_as_of` timestamp, and keeps unavailable sales/finance values nullable instead of converting failures into zeroes.
- Added outlet-scoped order counts and recent orders when the selected branch has an authoritative `orders.branch_id`; aggregate mode is explicitly labeled when data is still at business level.
- Added menu-derived food-order branch ownership, same-outlet cart enforcement, a safe legacy backfill, and a deferred database trigger that rejects cross-outlet food orders.
- Added dashboard controls for open/close, pause/resume, busy mode, and auto-accept. The controls optimistically update, restore the previous state on failure, can be retried by the operator, and use server-side readiness checks for auto-accept.
- Made open/close, pause/resume, busy, and auto-accept persistence idempotent when the requested state is already current.
- Added server-side readiness checks for outlet state, available/moderated menu, registered merchant-device notification token, and notification preference before auto-accept can be enabled.
- Added database-backed dashboard alerts for unverified bank account, unavailable auto-accept readiness, sold-out menu, expired food documents, POS/integration health, and unavailable dashboard sources.
- Added authoritative operating-hours and special-closure data to the dashboard read model, plus alerts for provider incidents, persisted quality degradation, payout holding, and finance reconciliation exceptions.
- Expanded order buckets for needs-action, waiting-courier, in-progress, cancelled, refund/dispute, SLA overdue, and POS sync errors; all are calculated from server-owned order/finance/integration tables.
- Added a read-only latest-quality-score repository path so dashboard refreshes do not create a new scorecard snapshot.
- Added outbox event contracts for auto-accept changes and expanded operating-state consumer metadata for Customer/Courier/Merchant Android/Merchant Web/Admin consumers.
- Added settlement-level payout holding totals and the next eligible payout timestamp to the finance read model, so the payout alert is not inferred from the dashboard's limited entry window.
- Made self-service open/close, pause/resume, and busy mutations persist the authenticated actor and expose a safe display name for the portal; technical reason codes and raw actor UUIDs are no longer rendered as merchant-facing copy.

## Files Changed

- `backend/merchant-service/internal/domain/dashboard.go` — dashboard read-model and readiness contracts.
- `backend/merchant-service/internal/service/dashboard_service.go` — authoritative dashboard composition, branch scope, readiness, and database-backed alerts.
- `backend/merchant-service/internal/handler/merchant_handler.go` and `backend/merchant-service/cmd/api/main.go` — authenticated dashboard route.
- `backend/merchant-service/internal/repository/postgres_merchant_repository.go` — readiness query and idempotent operating-state mutations.
- `backend/merchant-service/internal/service/merchant_service.go` and `backend/merchant-service/internal/domain/merchant.go` — actor-aware state mutation contract with compatibility fallback for existing repository doubles.
- `backend/merchant-service/internal/repository/postgres_report_repository.go` and `backend/merchant-service/internal/domain/report.go` — authoritative held-payout and next-payout aggregate fields.
- `backend/merchant-service/internal/repository/postgres_merchant_order_repository.go` and `backend/merchant-service/internal/domain/merchant_order.go` — outlet-scoped order queries.
- `backend/merchant-service/internal/domain/merchant_quality.go` and `backend/merchant-service/internal/repository/merchant_quality_repository.go` — persisted quality read model for dashboard alerts.
- `backend/order-service/internal/service/order_food.go`, `internal/domain/order.go`, and `internal/repository/postgres_repository.go` — authoritative single-outlet food-order branch assignment.
- `merchant-web/src/pages/Dashboard.tsx` and `merchant-web/src/lib/types.ts` — server dashboard rendering and safe operating controls.
- `database/migrations/20261004000001_merchant_auto_accept_events.sql` — auto-accept outbox event trigger.
- `database/migrations/20261004000002_food_order_branch_scope.sql` — order branch ownership, legacy backfill, constraint trigger, and index.
- `database/migrations/20261004000003_merchant_operating_state_consumers.sql` — operating-state event consumer contract.

## Commands / Checks Run

    command: $env:GOWORK='off'; go test ./...
    location: backend/merchant-service
    result: PASS — all merchant-service packages passed.

    command: $env:GOWORK='off'; go test ./...
    location: backend/order-service
    result: PASS — all order-service packages passed.

    command: npm run lint
    location: merchant-web
    result: PASS — 0 errors; 11 warnings remain, including existing React effect/style warnings.

    command: npm run test:config
    location: merchant-web
    result: PASS — 5 build-configuration contract tests passed.

    command: VITE_API_URL=http://localhost:8080/api/v1 npm run build
    location: merchant-web
    result: PASS — TypeScript and Vite production build completed.

    command: docker compose build merchant-service order-service merchant-web
    result: PASS — all three affected images rebuilt from the current working tree.

    command: docker compose up -d --no-deps merchant-service order-service merchant-web
    result: PASS — all three containers recreated and reported healthy.

    command: Invoke-WebRequest http://127.0.0.1:3086/
    result: PASS — Merchant Web returned HTTP 200 from the rebuilt container.

    command: Invoke-WebRequest http://127.0.0.1:8080/api/v1/merchant/dashboard without session
    result: PASS — route returned HTTP 401 with `ERR_ROUTE_AUTH_REQUIRED`; unauthenticated access is fail-closed.

    command: docker exec tembus-db psql ... schema/trigger existence checks
    result: PASS — `orders.branch_id`, `trg_sync_food_order_branch`, and `emit_merchant_operating_state_change` exist in the Docker PostgreSQL instance. The new goose image was unavailable from the configured registry, so the migration Up SQL was applied through the existing PostgreSQL image and version rows were recorded after verification.

    command: docker logs --tail 80 tembus-merchant and docker logs --tail 60 tembus-order
    result: PASS — database connection and service startup were successful; no startup error was observed.

    command: expanded operational order-count SQL executed with docker exec tembus-db psql
    result: PASS — 13 server-side order/exception buckets executed against the active schema and returned one row for a real merchant scope.

    command: docker compose build merchant-service merchant-web; docker compose up -d --no-deps merchant-service merchant-web
    result: PASS — current commit `9859a0ff` rebuilt both images; both containers reported healthy; Merchant Web and merchant-service health endpoints returned HTTP 200.

    command: docker exec tembus-db psql ... actor attribution projection
    result: PASS — the active schema returned the canonical operating state and nullable actor/name projection without exposing a fabricated identity; existing system-managed rows remained null as expected.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Merchant-service and order-service package tests passed after the dashboard, branch ownership, readiness, idempotency, order-bucket, operating-hours, and quality-read-model changes.

### Integration

Status: PARTIAL

Evidence: Docker services connected to the shared PostgreSQL instance and the schema/trigger contract was verified. Authenticated mutation and event-consumer integration were not exercised in this run.

### E2E

Status: NOT_RUN

Evidence: No authenticated browser or Customer → Merchant Web → Courier cross-app flow was executed in this run. The unauthenticated boundary was verified with an HTTP probe only.

### Migration

Status: PARTIAL

Evidence: Up-path schema, trigger, function, index, and migration-version presence were verified in `tembus-db`. Down migration and recovery drill were not run against the active Docker database.

### Observability

Status: PARTIAL

Evidence: Dashboard responses include `data_as_of`, warnings, readiness check time, operating-hours data, persisted quality status, settlement-derived payout fields, and alert codes; operating-state/auto-accept outbox event wiring is present. Live event delivery, product consumer lag, and alert routing were not verified.

### Security / Privacy

Status: PASS

Evidence: Dashboard is mounted behind the audited merchant route chain, resolves merchant/outlet scope from the authenticated context, validates selected branches server-side, and rejects unauthenticated access with HTTP 401. No customer phone/address data was added to the dashboard read model.

### Rollback / Recovery

Status: PARTIAL

Evidence: Migration down SQL and optimistic UI rollback paths are present. A live database down/up drill, duplicate-click replay, and reconnect recovery were not run.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value:

`false`

Reason:

The original P0-002 acceptance is feature/task-local; authenticated staging and cross-app verification are required before release but are recorded as release follow-up rather than claimed as task proof here.

### External Runtime Validation

Status:

NOT_RUN

Evidence:

No authenticated staging validation was performed.

### Release Readiness

Status:

NOT_RUN

Evidence:

The portal remains unsuitable for a production-complete claim until the unproven requirements above are executed and recorded.

## Unproven Requirements

- Authenticated browser E2E for owner, manager, cashier, and finance roles, including retry/duplicate-click behavior.
- Cross-app propagation to Customer, Courier, Merchant Android, and Admin through consumed outbox/cache contracts.
- Live consumer/cache propagation to Customer, Courier, Merchant Android, Merchant Web, and Admin through the published event contract.
- Outlet-level financial/settlement scope; branch order scope is available, while finance remains explicitly business-level.
- Migration down/recovery and live replay/observability verification.

This task remains active and must not advance to dependent portal tasks until these requirements are proven or the original scope is explicitly revised.
