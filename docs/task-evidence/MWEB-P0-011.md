---
task_id: MWEB-P0-011
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: WORKTREE-merchant-pricing-and-individual-onboarding

tests: PASS
integration: PASS
e2e: NOT_RUN

migration: PASS
migration_na_reason: "N/A — migration was applicable and applied to the local PostgreSQL container."

observability: PARTIAL
security_privacy: PASS
rollback_recovery: PARTIAL

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: NOT_RUN
release_followups: "Authenticated Admin maker-checker flow, Merchant Web finance browser flow, cross-app onboarding E2E, and staging CI remain to be run."

unproven_requirements: "Authenticated browser E2E for draft/approve/retire and Android submit-to-status read-after-write; CI/staging deployment proof."
known_blockers: NONE

locally_actionable_remaining: "Run the deferred authenticated browser and cross-app verification after the requested feature batch is complete."

blocker_resolution_attempts: "Checked local Docker, PostgreSQL, API gateway, Merchant Web, Admin dashboard, Android emulator, and physical-device ADB availability; rebuilt the affected images and launched the Merchant debug APK."
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: "Run disposable Admin → DB → Merchant Web lifecycle, create/approve an intro contract, create a food order at the cap boundary, and submit an individual Merchant Android registration followed by public status lookup."

dependency_chain_blocked: false
next_eligible_task: MWEB-P0-010

updated_at: 2026-10-06
---

# Evidence — MWEB-P0-011

## Acceptance Criteria Source

Original requirements are in `task-merchant-web-growth-p0-p2-2026.md` under
`MWEB-P0-011 — Tarif merchant food dan dua jalur onboarding`.

- Tarif food merchant server-authoritative: standar 15% dan intro 5% selama 90 hari atau 100 pesanan selesai.
- Kontrak bertanggal/versioned dan snapshot order lama tidak berubah.
- Admin dapat membuat draft, approve dengan maker-checker/TOTP, dan retire kontrak.
- Merchant Web menampilkan tarif aktif, tarif standar, dan potongan komisi dari statement server.
- Merchant Android menyediakan jalur perorangan saja, mencatat consent legal, dan memberi link status setelah submit; jalur perusahaan tetap berada di Portal Mitra.

## Scope Implemented

- Migration `20261006000001_merchant_intro_commission_program.sql` sets the food default to 15%, adds a concurrency-safe order-cap eligibility function, and updates the order commercial snapshot trigger. Malformed direct metadata is fail-closed.
- Merchant service exposes `GET /api/v1/merchant/commission-terms`; the repository reads the approved contract, completed food orders, cap, remaining cap, and server fallback rate from PostgreSQL.
- Merchant Web Finance displays current/standard commission and a gross-to-net statement breakdown from the server projection.
- Admin service validates program metadata and exposes role/TOTP/idempotent contract create/approve/retire endpoints. Admin dashboard now provides the contract-management screen.
- Merchant Android now uses the individual-only registration lane and shows the status-page CTA after a successful submit. Detailed consent and channel-boundary evidence is tracked in `docs/task-evidence/MWEB-P0-012.md`.

## Files Changed

- `database/migrations/20261006000001_merchant_intro_commission_program.sql` — commission eligibility and snapshot policy.
- `backend/merchant-service/internal/domain/merchant_commission.go` — read contract.
- `backend/merchant-service/internal/repository/postgres_report_repository.go` — authoritative commission read model.
- `backend/merchant-service/internal/service/report_service.go`, `backend/merchant-service/internal/handler/merchant_handler.go`, `backend/merchant-service/cmd/api/main.go` — protected endpoint wiring.
- `backend/admin-service/src/controllers/merchantCommissionContracts.controller.ts` — metadata validation and contract mutations.
- `admin-dashboard/src/pages/MerchantCommissionContracts.tsx`, `admin-dashboard/src/App.tsx`, `admin-dashboard/src/components/DashboardLayout.tsx` — Admin configuration UI.
- `merchant-web/src/lib/types.ts`, `merchant-web/src/pages/Settlements.tsx` — finance read UI.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/registration/RegistrationScreen.kt`, `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/auth/LoginScreen.kt` — individual/business registration handoff.

## Commands / Checks Run

    command: go test ./... (backend/merchant-service)
    result: PASS — merchant service packages passed.

    command: go test ./... (backend/order-service)
    result: PASS — order service packages passed after the food fallback changed to 15%.

    command: npm run build (backend/admin-service)
    result: PASS — controller TypeScript compiled.

    command: VITE_API_URL=https://api.bawain.my.id/api/v1 VITE_WS_URL=wss://api.bawain.my.id VITE_SOCKET_URL=https://api.bawain.my.id npm run build (admin-dashboard)
    result: PASS — production environment validation, TypeScript, and Vite build completed; existing large-chunk warning remains.

    command: VITE_API_URL=http://localhost:8080/api/v1 npm run build (merchant-web)
    result: PASS — local production bundle completed.

    command: .\\gradlew.bat :app:compileDebugKotlin --no-daemon (android-app-merchant)
    result: PASS — Kotlin compilation completed; existing deprecation warnings remain.

    command: .\\gradlew.bat :app:assembleDebug --no-daemon; adb -s emulator-5554 install -r; launch com.tembus.merchant
    result: PASS — debug APK installed on the available emulator and the process remained alive with no FATAL EXCEPTION after launch.

    command: docker exec tembus-db psql ... apply 20261006000001_merchant_intro_commission_program.sql
    result: PASS — migration applied; eligibility function returned true for valid intro metadata and false for malformed metadata; food default is 15%.

    command: docker compose build merchant-service merchant-web admin-service admin-dashboard
    result: PASS — affected images built.

    command: docker compose up -d --no-deps merchant-service merchant-web admin-service admin-dashboard
    result: PASS — containers recreated; Merchant Web/Admin UI returned HTTP 200 and Merchant/Admin services returned healthy.

    command: unauthenticated GET http://localhost:8080/api/v1/merchant/commission-terms and GET http://localhost:8080/api/v1/admin/finance/merchant-commission-contracts
    result: PASS — both protected endpoints rejected unauthenticated requests with HTTP 401.

    tool: browser DOM verification of http://localhost:3086/status
    result: PASS — status page rendered with email/phone fields and `Periksa Status` action.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Go, TypeScript, Vite, and Kotlin compilation/tests above passed. Existing lint warnings are recorded and not represented as zero-warning proof.

### Integration

Status: PASS

Evidence: PostgreSQL function and trigger are installed; Merchant API reads the same approved contract source; Finance UI and Admin contract UI are wired to protected routes; Android registration is built from the existing server command and opens the canonical public status route.

### E2E

Status: NOT_RUN

Evidence: No authenticated Admin/browser contract mutation or disposable cross-app Android registration was claimed in this batch. This is deliberately queued for the full verification pass after the feature scope is complete.

### Migration

Status: PASS

Evidence: The new migration was applied to the local `tembus` PostgreSQL container and verified with valid/malformed metadata probes and the 15% service default. Down/rollback was not executed; rollback remains a release follow-up.

### Observability

Status: PARTIAL

Evidence: Existing audit middleware/idempotency path covers Admin mutations and the protected Merchant endpoint. Live dashboard/alert verification was not run.

### Security / Privacy

Status: PASS

Evidence: Admin mutation routes require role, TOTP session, and idempotency key; Merchant read route requires authenticated approved merchant access; public status handoff carries no token or document data.

### Rollback / Recovery

Status: PARTIAL

Evidence: Order snapshots remain immutable and contract retirement is append-only by status; migration down and boundary order replay are queued for the verification pass.

## Status Decision

`PARTIAL` — requested implementation is wired locally and rebuilt, but authenticated cross-app E2E and staging proof remain intentionally deferred per the current delivery sequence.
