---
task_id: MWEB-PORTAL-P0-002
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: 7c5747a3

tests: PASS
integration: PARTIAL
e2e: PARTIAL

migration: PASS
migration_na_reason: "N/A — three persistent schema/event changes were introduced."

observability: PARTIAL
security_privacy: PASS
rollback_recovery: PARTIAL

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: NOT_RUN
release_followups: "Authenticated staging smoke, cross-app event propagation, and release gates remain required before production rollout."

unproven_requirements: "Live device/runtime fan-out and cache invalidation across Customer, Courier, Merchant Android and Admin clients in a deployed environment; product policy for business-level payout allocation in an outlet view."
known_blockers: NONE

locally_actionable_remaining: "Continue the same task with authenticated device/runtime and deployed cross-app event verification, replay/duplicate/stale/reconnect checks, and role/recovery verification across remaining consumers; then resolve the finance policy gap before marking COMPLETE."

blocker_resolution_attempts: "Rebuilt merchant-service, order-service, and merchant-web; applied the three new migration up paths to the Docker PostgreSQL instance after the goose image registry denied access; verified schema, triggers, service health, unauthenticated route denial, and executed the expanded order-count SQL directly against the active Docker PostgreSQL instance; then ran the three migration Down paths in reverse and Up paths forward on a schema-only disposable PostgreSQL database and removed that database after validation."
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: NONE

dependency_chain_blocked: false
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
- Added authoritative branch-scoped sales and finance repository capabilities. Sales metrics filter `orders.branch_id`; statement entries, reconciliation exceptions, and held settlements are filtered through their order relation. Business-level withdrawals are excluded rather than assigned to an arbitrary outlet, and the response exposes `scope_level`, `branch_id`, and a merchant-facing scope note.
- Updated the dashboard UI to label outlet summaries correctly and explain that business-level payouts are not allocated to an outlet; the previous copy that incorrectly claimed outlet summaries followed the business level was removed.
- Added an admin RabbitMQ consumer for `merchant.operating_state.changed` with a durable queue, DLQ, bounded prefetch, invalid-contract rejection, duplicate suppression, retry on delivery failure, and structured delivery metrics.
- Extended the authenticated Socket.IO handshake to accept the HttpOnly `merchant_session` cookie for merchant owners/staff and join only the server-resolved merchant room.
- Added Merchant Web Socket.IO invalidation with authoritative dashboard refetch; the event payload is never treated as the source of truth and the existing 30-second poll remains the recovery fallback.
- Added Merchant Android canonical outlet-profile decoding and a bounded 30-second foreground refresh fallback so a status changed by Merchant Web/Admin is not hidden behind stale profile state; the API remains authoritative and order polling is unchanged.
- Added a verified-role `merchant_availability` Socket.IO room for Customer and Courier clients. The room receives a public, minimal operating-state invalidation payload; clients still refetch authoritative API/database state and do not trust the event as a source of truth.
- Added Customer Socket.IO dedupe and recommendation invalidation/refetch handling, plus Courier dashboard-scoped socket lifetime and order resync signaling for merchant availability changes.
- Enabled RabbitMQ outbox publishing and the operating-state consumer in the local Compose runtime, and passed the socket URL into the Merchant Web build.
- Kept the local socket build argument empty by default so the browser derives the socket origin from the configured API origin; this avoids baking `localhost` into an image accessed through a tunnel/domain.

## Files Changed

- `backend/merchant-service/internal/domain/dashboard.go` — dashboard read-model and readiness contracts.
- `backend/merchant-service/internal/service/dashboard_service.go` — authoritative dashboard composition, branch scope, readiness, and database-backed alerts.
- `backend/merchant-service/internal/handler/merchant_handler.go` and `backend/merchant-service/cmd/api/main.go` — authenticated dashboard route.
- `backend/merchant-service/internal/repository/postgres_merchant_repository.go` — readiness query and idempotent operating-state mutations.
- `backend/merchant-service/internal/service/merchant_service.go` and `backend/merchant-service/internal/domain/merchant.go` — actor-aware state mutation contract with compatibility fallback for existing repository doubles.
- `backend/merchant-service/internal/repository/postgres_report_repository.go` and `backend/merchant-service/internal/domain/report.go` — authoritative held-payout and next-payout aggregate fields.
- `backend/merchant-service/internal/repository/postgres_report_repository.go` and `backend/merchant-service/internal/domain/report.go` — branch-scoped sales/finance capabilities and explicit finance scope metadata.
- `backend/merchant-service/internal/repository/postgres_merchant_order_repository.go` and `backend/merchant-service/internal/domain/merchant_order.go` — outlet-scoped order queries.
- `backend/merchant-service/internal/domain/merchant_quality.go` and `backend/merchant-service/internal/repository/merchant_quality_repository.go` — persisted quality read model for dashboard alerts.
- `backend/order-service/internal/service/order_food.go`, `internal/domain/order.go`, and `internal/repository/postgres_repository.go` — authoritative single-outlet food-order branch assignment.
- `merchant-web/src/pages/Dashboard.tsx` and `merchant-web/src/lib/types.ts` — server dashboard rendering and safe operating controls.
- `backend/merchant-service/internal/service/dashboard_service_test.go` — unit proof for authoritative aggregate/finance data, outlet scope isolation, and fail-closed auto-accept readiness.
- `backend/merchant-service/internal/repository/merchant_finance_statement_integration_test.go` — opt-in read-only PostgreSQL proof for branch sales/finance attribution and no cross-branch statement leakage.
- `scripts/e2e/merchant-web-onboarding-local.ps1` — authenticated onboarding harness now verifies the dashboard read model after Admin approval.
- `database/migrations/20261004000001_merchant_auto_accept_events.sql` — auto-accept outbox event trigger.
- `database/migrations/20261004000002_food_order_branch_scope.sql` — order branch ownership, legacy backfill, constraint trigger, and index.
- `database/migrations/20261004000003_merchant_operating_state_consumers.sql` — operating-state event consumer contract.
- `backend/admin-service/src/workers/merchant-operating-state-consumer.ts` — durable RabbitMQ consumer, DLQ, retry, dedupe, room fan-out, and metrics.
- `backend/admin-service/src/workers/merchant-operating-state-consumer.test.ts` — canonical/legacy envelope, rejection, public-payload allowlist, and room fan-out contract tests.
- `backend/admin-service/src/realtimeRooms.ts` — shared availability room contract.
- `backend/admin-service/src/websocket.ts` — merchant session-cookie authentication and scoped room join.
- `merchant-web/src/lib/realtime.ts` — authenticated Socket.IO invalidation client.
- `merchant-web/src/pages/Dashboard.tsx` — authoritative dashboard refetch on operating-state event.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/data/model/MerchantModels.kt` — canonical operating-state fields retained alongside legacy `is_open`.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/HomeViewModel.kt` and `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/StitchOrdersDashboardScreen.kt` — bounded authoritative profile refresh fallback.
- `android-app-merchant/app/src/test/java/com/tembus/merchant/data/model/MerchantOperatingStateContractTest.kt` — Android profile contract proof.
- `android-app-customer/app/src/main/java/com/tembus/customer/data/model/MerchantOperatingStateEvent.kt` and `android-app-customer/app/src/main/java/com/tembus/customer/util/SocketManager.kt` — typed availability invalidation event and duplicate/stale suppression.
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/main/DashboardViewModel.kt` — authoritative recommendation removal/refetch on merchant availability changes.
- `android-app/app/src/main/java/com/tembus/courier/data/model/MerchantOperatingStateEvent.kt` — typed courier availability event contract.
- `android-app/app/src/main/java/com/tembus/courier/util/SocketManager.kt`, `android-app/app/src/main/java/com/tembus/courier/util/OrderSyncSignalBus.kt`, `android-app/app/src/main/java/com/tembus/courier/ui/screens/CourierRealtimeViewModel.kt`, and `android-app/app/src/main/java/com/tembus/courier/ui/screens/MainScreenRuntime.kt` — dashboard-scoped socket lifetime, duplicate/stale suppression, and authoritative courier resync signal.
- `merchant-web/Dockerfile` and `docker-compose.yml` — socket build configuration and local outbox/consumer runtime defaults.
- `backend/merchant-service/internal/service/merchant_access_service.go` — guarantees an empty branch collection serializes as `[]` for older merchants without a backfilled outlet.
- `merchant-web/src/components/Layout.tsx` and `merchant-web/src/lib/portal-context.ts` — defensive collection handling for legacy/null portal payloads.
- `scripts/e2e/merchant-web-dashboard-browser.mjs` — disposable browser E2E covering Admin approval, Customer discovery open/closed projection, Admin open/closed projection, Merchant Web login, dashboard freshness, external status mutation, Socket.IO-triggered refetch, optimistic-toggle rollback, retry, and concurrent-toggle idempotency.

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

    command: scripts/e2e/merchant-web-onboarding-local.ps1 -ApiBaseUrl https://api.bawain.my.id/api/v1 -WebOrigin https://merchant.bawain.my.id
    result: PASS — disposable HTTPS lifecycle completed through Admin → database → Merchant Web; authenticated dashboard returned a fresh timestamp, matching merchant scope, order fields, and auto-accept readiness fields. Admin credential was loaded in-memory from the local runtime configuration and is not recorded here.

    command: go test ./internal/repository -run TestMerchantBranchScopedReportsIntegration -count=1 -v
    location: backend/merchant-service
    result: PASS — read-only integration against the host-published PostgreSQL fixture proved branch sales/finance repository capability, scope metadata, and that every returned finance entry resolves to the selected order branch. Connection credentials were loaded in-memory and are not recorded here.

    command: docker compose build merchant-service merchant-web; docker compose up -d --no-deps merchant-service merchant-web; Invoke-WebRequest http://127.0.0.1:3086/; Invoke-WebRequest http://127.0.0.1:8080/health
    result: PASS — affected images built successfully, containers reported healthy, Merchant Web returned HTTP 200, and gateway health returned HTTP 200.

    command: npm test -- --runInBand
    location: backend/admin-service
    result: PASS — 139 test suites and 669 tests passed. Jest reported an existing force-exit warning for leaked worker teardown after the successful run.

    command: npm test -- --runInBand src/workers/merchant-operating-state-consumer.test.ts
    location: backend/admin-service
    result: PASS — canonical envelope allowlisting, legacy payload compatibility, invalid-contract rejection, verified availability-room fan-out, and public-payload field isolation passed (6 tests).

    command: npm run build
    location: backend/admin-service
    result: PASS — TypeScript production build completed.

    command: docker compose build admin-service; docker compose up -d --no-deps admin-service; docker compose ps admin-service; docker logs --since 30s tembus-admin
    result: PASS — admin-service image rebuilt from `7c5747a3`, container reported healthy, Socket.IO/Redis initialized, and the merchant operating-state consumer started on the durable queue without startup errors.

    command: .\\gradlew.bat :app:testDebugUnitTest --no-daemon
    location: android-app-customer
    result: PASS — Customer Android unit tests passed after adding typed merchant-availability event handling and dashboard recommendation invalidation; existing deprecation warnings remain.

    command: .\\gradlew.bat :app:testDebugUnitTest --no-daemon
    location: android-app
    result: PASS — Courier Android unit tests passed after adding typed merchant-availability event handling, dashboard-scoped socket lifetime, and resync signaling; existing deprecation warnings remain.

    command: docker compose config --quiet; docker compose build admin-service merchant-web; docker compose up -d rabbitmq admin-service merchant-web
    result: PASS — Compose configuration validated; both affected images rebuilt; admin, Merchant Web, RabbitMQ, PostgreSQL dependencies reported healthy.

    command: docker exec tembus-rabbitmq rabbitmqctl list_queues/list_bindings; rabbitmqadmin publish merchant.operating_state.changed; docker logs --since 30s tembus-admin
    result: PASS — durable admin queue and DLQ were bound to `tembus.events`; a valid synthetic event was acknowledged by the consumer and emitted `merchant_operating_state_event_emitted`. An invalid synthetic contract was rejected into the DLQ. No application state was mutated by this broker-only proof.

    command: docker compose config --quiet; docker compose build merchant-web; docker compose up -d --no-deps merchant-web; Invoke-WebRequest http://127.0.0.1:3086/
    result: PASS — socket-origin fallback configuration rebuilt successfully; Merchant Web container reported healthy and returned HTTP 200.

    command: disposable PostgreSQL schema-only clone; apply Down for 20261004000003, 20261004000002, 20261004000001; apply Up for 20261004000001, 20261004000002, 20261004000003; validate schema/functions/triggers; drop disposable database
    result: PASS — reverse rollback and forward recovery completed on an isolated database; `orders.branch_id`, auto-accept function, branch-sync function, and operating-state consumer set were restored. The disposable database was removed; the active database was not used for the destructive drill.

    command: docker compose build merchant-service merchant-web; docker compose up -d --no-deps merchant-service api-gateway admin-service merchant-web; node scripts/e2e/merchant-web-dashboard-browser.mjs
    result: PASS — disposable local flow completed Admin approval → canonical merchant open/closed mutation → Customer food discovery exposure/removal → Admin detail projection → Merchant Web login → dashboard render → external operating-state mutation → Socket.IO-triggered dashboard refetch. Customer discovery exposed the disposable merchant only while open, Admin reported the same canonical state in both directions, browser reported no page errors, and one authoritative dashboard refetch was observed. Disposable owner and customer probe users were deleted. The local image was built with loopback CSP sources only for the explicit local build and the Docker stack was restored afterward.

    command: node --check scripts/e2e/merchant-web-dashboard-browser.mjs; local Docker harness with VITE_API_URL=http://127.0.0.1:8080/api/v1, VITE_SOCKET_URL='', FORCE_SECURE_COOKIES=false, COOKIE_DOMAIN=''; docker compose build merchant-service merchant-web; docker compose up -d --no-deps --force-recreate merchant-service api-gateway admin-service merchant-web; node scripts/e2e/merchant-web-dashboard-browser.mjs
    result: PASS — the dedicated local Docker harness completed the disposable flow plus browser role/session checks for owner, manager, cashier, kitchen, and finance. Manager changed the outlet state through an active branch/device session; cashier, kitchen, and finance received server-side authorization failures. The same run proved forced-503 optimistic rollback, successful retry, and two concurrent same-intent toggle requests. The authoritative operating-state version delta was 1 and the `merchant.operating_state.changed` outbox-event delta was 1; browser `page_errors=[]`, `dashboard_refetch_count=3`, and checks passed: `manager_scope_and_operating_authorization`, `cashier_scope_and_operating_authorization`, `kitchen_scope_and_operating_authorization`, `finance_scope_and_operating_authorization`, `optimistic_toggle_rollback`, `toggle_retry`, `concurrent_toggle_idempotency`. The local harness image/environment was temporary and the normal Docker stack was restored afterward; this is local Docker evidence, not staging runtime proof.

    command: .\\gradlew.bat :app:testDebugUnitTest --no-daemon
    location: android-app-merchant
    result: PASS — Merchant Android unit tests passed, including canonical operating-state JSON contract coverage; existing deprecation warnings remain.

    command: .\\gradlew.bat :app:assembleDebug --no-daemon
    location: android-app-merchant
    result: PASS — Merchant Android debug APK assembled from the current working tree. `adb devices` returned no connected device, so installation/runtime propagation was not claimed.

## Task-Local Verification

### Tests

Status: PASS

Evidence: `go test ./internal/service -run 'TestGetDashboard_' -count=1 -v` passed the three dashboard read-model scenarios; the merchant-service and order-service package tests also passed after the dashboard, branch ownership, readiness, idempotency, order-bucket, operating-hours, and quality-read-model changes.

### Integration

Status: PARTIAL

Evidence: Docker services connected to the shared PostgreSQL instance and the schema/trigger contract was verified. The read-only branch sales/finance integration test passed against a real PostgreSQL fixture. The rebuilt admin runtime consumed a broker event through the durable queue and DLQ contract. The authenticated local browser flow proved Customer discovery and Admin detail read the same canonical open/closed state as Merchant Web, proved the Merchant Web dashboard refetch after an external status mutation, and exercised owner/manager/cashier/kitchen/finance portal authorization from real disposable users and branch/device sessions. The consumer unit contract now proves verified availability-room fan-out with a public field allowlist; Customer and Courier Android compile/unit tests prove their typed invalidation and authoritative refresh/resync wiring. Deployed runtime fan-out and physical Android device/runtime behavior remain unproven.

### E2E

Status: PARTIAL

Evidence: The HTTPS disposable harness completed registration → document upload → Admin reject/resubmit/approve → ACTIVE status → authenticated `GET /merchant/dashboard` → suspend → SUSPENDED status. Sanitized dashboard proof: `data_as_of_present=true`, `merchant_scope_matches=true`, `scope_level=merchant_aggregate`, `order_fields_present=true`, `auto_accept_present=true`, `alert_count=1`. The local Playwright/Chrome harness additionally completed Admin approval → canonical open state → Customer discovery present → Admin detail open → canonical closed state → Customer discovery absent → Admin detail closed → Merchant Web owner login → dashboard render → disposable manager/cashier/kitchen/finance login and branch/device context resolution → manager operating-state mutation → non-manager server-side rejection → external operating-state mutation → Socket.IO-triggered dashboard refetch with `page_errors=[]` and `dashboard_refetch_count=3`; it also proved optimistic rollback after a forced 503, successful retry, and concurrent-toggle idempotency with version/event delta `1/1`. Outlet-scoped sales/finance API attribution passed against local PostgreSQL. Customer and Courier Android unit/build proof passed for the new availability invalidation wiring, but no Android device was connected for install/runtime verification; deployed cross-app event/cache propagation remains unproven.

### Migration

Status: PASS

Evidence: Up-path schema, trigger, function, index, and migration-version presence were verified in `tembus-db`. A schema-only PostgreSQL clone completed Down reverse-order and Up forward-order for all three dashboard migrations, followed by explicit validation of `orders.branch_id`, auto-accept function, branch-sync function, and operating-state consumer metadata. The isolated database was removed after the drill; no destructive operation was run against the active database.

### Observability

Status: PARTIAL

Evidence: Dashboard responses include `data_as_of`, warnings, readiness check time, operating-hours data, persisted quality status, settlement-derived payout fields, and alert codes. The live local consumer emitted the structured `merchant_operating_state_event_emitted` metric after consuming a valid event and routed invalid input to DLQ. Production dashboards, product-consumer lag, and alert routing remain release follow-up.

### Security / Privacy

Status: PASS

Evidence: Dashboard is mounted behind the audited merchant route chain, resolves merchant/outlet scope from the authenticated context, validates selected branches server-side, and rejects unauthenticated access with HTTP 401. No customer phone/address data was added to the dashboard read model.

### Rollback / Recovery

Status: PARTIAL

Evidence: Migration down SQL and optimistic UI rollback paths are present. The local browser harness proved rollback after a failed toggle, retry after recovery, and duplicate-click idempotency at the database version/outbox-event boundary. A live database down/up drill and reconnect recovery were not run.

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

- Full authenticated capability E2E for owner, manager, cashier, kitchen, and finance beyond the dashboard/operating-state checks already proven.
- Deployed/live operating-state event fan-out and cache invalidation to Customer, Courier, Merchant Android, Merchant Web, and Admin; local room/payload/unit wiring and direct Customer/Admin authoritative reads are proven, but device/runtime/reconnect behavior is not.
- Business-level withdrawal/payout allocation into a selected outlet is intentionally not performed; Finance/Product must define an auditable allocation policy before that capability is added.
- Live replay/observability verification and browser/cross-app event propagation.

## Locally Actionable Remaining

- Execute authenticated browser E2E for owner, manager, cashier, and finance roles, including duplicate-click, retry, refresh, and reconnect behavior.
- Prove Customer, Courier, Merchant Android, Merchant Web, and Admin consumers refresh their authoritative views from the same operating-state event contract in a deployed environment, including Android device/runtime, replay, duplicate, stale, and reconnect behavior.
- Resolve the product decision for how business-level withdrawals/payouts are allocated, or keep them explicitly business-scoped and excluded from outlet totals.

## External Blockers

NONE. The remaining work is locally actionable in the repository/runtime; staging release validation is tracked separately.

## Owner Action Required

NONE.

## Reality Gate Evaluation

- `REALITY-2026-003`: PARTIAL — implementation and local runtime evidence exist, but authenticated cross-app E2E and the finance allocation policy are not proven.
- `REALITY-2026-011`: PASS — no mock or fabricated production result is being used; broker-only evidence is explicitly labeled as local and synthetic.

## Next Eligible Task

NONE — dependent portal tasks remain held until this task's remaining local requirements are proven or the original scope is explicitly revised.

This task remains active and must not advance to dependent portal tasks until these requirements are proven or the original scope is explicitly revised.
