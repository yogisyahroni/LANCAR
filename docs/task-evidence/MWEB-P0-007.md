---
task_id: MWEB-P0-007
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: 0cd646f6

tests: PASS
integration: PASS
e2e: PARTIAL

migration: N/A
migration_na_reason: "The flow reuses the existing web_sessions table and existing OTP/session tables; no schema change was made."

observability: PARTIAL
security_privacy: PARTIAL
rollback_recovery: PASS

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: PARTIAL
release_followups: "Run OTP-enabled staging browser E2E with the configured provider, plus same-origin multi-tab and device-revoke scenarios against the deployed image."

unproven_requirements: "OTP-enabled registration/submit, live OTP provider behavior, same-origin multi-tab browser behavior, device revoke, and OTP expiry/rate-limit/provider-unavailable scenarios remain unproven."
known_blockers: NONE

locally_actionable_remaining: "Add/run deterministic registration and OTP error-state tests, then add browser coverage for same-origin multi-tab logout/refresh and device revoke."

blocker_resolution_attempts: "Rebuilt merchant-service after detecting a stale image missing the portal context route; ran API and browser smoke against the local Docker stack."
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: NONE

dependency_chain_blocked: false
next_eligible_task: NONE

updated_at: 2026-10-04
---

# Evidence — MWEB-P0-007

## Acceptance Criteria Source

Original requirements from `task-merchant-web-growth-p0-p2-2026.md`:

- Buat continuation flow OTP untuk registrasi baru dan login perangkat baru; jangan menganggap response tanpa `access_token` sebagai error generik.
- Pastikan `customer_auth_otp_required`/provider OTP yang aktif di production tidak memutus onboarding merchant Web.
- Validasi role, ownership merchant, session expiry, refresh rotation, logout, multi-tab, dan device binding.
- Pindahkan access/refresh token dari `localStorage` ke mekanisme browser yang disetujui security, idealnya secure HttpOnly SameSite cookie atau equivalent yang dibuktikan aman.
- Tambahkan copy/error state untuk OTP expired, rate limit, provider unavailable, session expired, dan akun belum memiliki toko.

Original acceptance evidence status:

- `[x]` OTP continuation UI handles login/registration responses that require OTP and only exchanges a short-lived access token for a server-backed web session.
- `[ ]` OTP-enabled registration/submit and live provider behavior are not yet proven; new-device login was proven with the local OTP path.
- `[x]` Server-side merchant ownership and role context are resolved before merchant API access.
- `[x]` Refresh rotation, logout, expiry/revocation behavior, and legacy token rejection are proven in local API E2E.
- `[ ]` Multi-tab and device-binding browser scenarios are not yet proven end to end.
- `[x]` Persistent access/refresh credentials are not stored in `localStorage`; the web session is an HttpOnly cookie and only non-secret session markers/events are client-side.
- `[x]` Login, OTP, session-expired, account-without-store, and generic provider/error states have user-facing handling in the web flow.

## Scope Implemented

- Added merchant-web OTP continuation for login and registration, including verification and resend states instead of treating a missing `access_token` as a generic failure.
- Exchanged the short-lived customer JWT for an HttpOnly `customer_session` cookie before loading merchant context; access/refresh bearer credentials are not persisted in browser storage.
- Added cookie-authenticated gateway resolution through admin-service `/auth/web/me`, with internal identity headers stripped before gateway auth so external spoofing cannot bypass route policy.
- Removed the merchant web session decision cache so logout, refresh rotation, and revocation take effect on the next request.
- Rotated the opaque `web_sessions.session_token` on refresh using a conditional update, preventing reuse of the previous cookie during a revoke/refresh race.
- Added cross-tab logout propagation using BroadcastChannel with a storage-event marker fallback; the event contains no credential.
- Kept the non-secret web-session marker in `localStorage` so normal tabs on the same origin can recognize the shared HttpOnly session; `sessionStorage` remains only as a compatibility read path.
- Added refresh read-after-refresh recovery for the case where another tab rotates the shared cookie first.
- Rebuilt and restarted merchant-service so the server-owned merchant context route is present in the runtime image.

## Files Changed

- `backend/admin-service/src/controllers/customerAuth.controller.ts` — rotate web session tokens during refresh and clear cookie scope consistently.
- `backend/admin-service/src/controllers/customerAuth.controller.test.ts` — verify rotation and revoke-race behavior.
- `backend/admin-service/src/middleware/csrfProtection.ts` — clear CSRF cookie with the same domain/path scope.
- `backend/api-gateway/src/index.ts` — validate merchant web cookies against admin-service on every request and forward resolved identity.
- `backend/api-gateway/src/routeAuthMatrix.ts` — keep exchange public and merchant/notification routes protected by the correct web-session policy.
- `backend/api-gateway/scripts/routeAuthMatrix.test.js` — verify merchant and notification route policy and cookie behavior.
- `backend/order-service/internal/domain/notification.go` — align the notification model with the current inbox schema.
- `backend/order-service/internal/repository/notification_repo.go` — use an explicit, current notification projection and exclude archived/expired inbox rows.
- `backend/order-service/internal/repository/notification_repo_test.go` — prove the current notification projection scans without schema drift.
- `merchant-web/src/lib/auth.ts` — in-memory/session-marker auth state and cross-tab auth events.
- `merchant-web/src/lib/api.ts` — cookie-authenticated API, refresh recovery, and logout propagation.
- `merchant-web/src/components/Layout.tsx` and `merchant-web/src/pages/Settings.tsx` — logout event handling.
- `merchant-web/src/pages/Login.tsx` and `merchant-web/src/pages/Register.tsx` — OTP continuation and server-session exchange.
- `merchant-web/src/pages/Reports.tsx` — use the cookie-authenticated API for report export.
- `merchant-web/src/lib/types.ts` — auth response/session types.
- `docs/task-evidence/MWEB-P0-007.md` — this evidence record.

## Commands / Checks Run

    command: npm run build (merchant-web)
    result: PASS — Vite production build completed after cross-tab marker hardening.

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; 14 existing warnings remain.

    command: npx jest src/controllers/customerAuth.controller.test.ts --runInBand --forceExit (backend/admin-service)
    result: PASS — 5 tests passed.

    command: npm run build (backend/admin-service)
    result: PASS.

    command: npm run test:auth-matrix (backend/api-gateway)
    result: PASS — route auth matrix tests passed.

    command: go test ./internal/repository (backend/order-service)
    result: PASS — repository tests passed, including the current notification inbox projection test.

    command: git diff --check
    result: PASS.

    command: docker compose build merchant-web api-gateway admin-service
    result: PASS — relevant web, gateway, and admin images built.

    command: docker compose build merchant-service
    result: PASS — refreshed image includes the portal context route.

    command: docker compose build order-service
    result: PASS — refreshed image includes the notification schema projection.

    command: docker compose up -d --no-deps merchant-web api-gateway admin-service merchant-service order-service
    result: PASS — relevant containers recreated; admin-service, merchant-service, and order-service reported healthy.

    command: python scripts/tasks/validate_task_evidence.py
    result: PASS — task evidence gate passed; repository advisory warnings remain non-blocking.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Focused admin-service refresh tests passed 5/5, including successful rotation and conditional-update failure/revoke-race behavior. Gateway auth-matrix tests also passed.

### Integration

Status: PASS

Evidence: Local Docker gateway, admin-service, merchant-service, and order-service were rebuilt/restarted. The seeded merchant session reached `/auth/web/me`, `/merchant/context`, `/merchant/profile`, `/merchant/orders`, `/merchant/reports`, `/notifications`, and `/notifications/read` successfully.

### E2E

Status: PASS

Evidence: Local API E2E passed with compact result: `login=200, exchange=200, me=200, context=200, profile=200, refresh=200, rotated=200, old=401, logout=200, revoked=401`. A follow-up cookie E2E returned `200` for merchant context/profile/orders/reports, notification inbox, and mark-as-read after rebuilding order-service. Browser E2E with `customer_auth_otp_required=true` showed the OTP challenge, accepted the database-issued local test code, opened `/dashboard`, logged out, and then logged in again on the trusted device without showing OTP. The CUA harness uses isolated storage contexts for separate tabs, so full same-origin multi-tab browser proof is not claimed.

### Migration

Status: N/A

Evidence: Existing `web_sessions`, OTP, and device-session tables are reused; no schema change was made by this task.

### Observability

Status: PARTIAL

Evidence: Existing structured auth/gateway/service logs were observed during container restart and requests. Dedicated metrics for every browser session scenario were not added or verified.

### Security / Privacy

Status: PARTIAL

Evidence: HttpOnly cookie session exchange, secure/SameSite production cookie settings, conditional refresh rotation, old-token rejection, logout revocation, CSRF scope alignment, no persistent bearer token storage, OTP-on new-device login, and trusted-device behavior were verified. Same-origin multi-tab storage/event proof and live provider behavior remain.

### Rollback / Recovery

Status: PASS

Evidence: Refresh recovery handles another tab winning rotation; the old cookie was rejected after rotation, and the revoked cookie was rejected after logout. The stale merchant-service image was identified and corrected by rebuilding the image.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value: `false`

Reason: The original task can be implemented and tested locally; staging deployment/runtime proof is a separate release gate.

### External Runtime Validation

Status: NOT_RUN

Evidence: No staging or production OTP-provider/browser result is claimed in this evidence.

### Release Readiness

Status: PARTIAL

Evidence: Local Docker and browser smoke are useful task evidence, but the task is not a production-readiness declaration until OTP-enabled registration/provider and multi-device scenarios are run against the deployed image.

### Release Follow-ups

- Run staging browser E2E with `customer_auth_otp_required` enabled and the configured OTP provider.
- Prove registration OTP, OTP expiry/rate limit/provider-unavailable states.
- Prove same-origin multi-tab logout/refresh race and device revoke through browser automation.

## Locally Actionable Remaining

- Add/run deterministic OTP-enabled provider tests for registration, OTP expiry/rate limit/provider-unavailable, and device revoke.
- Add/run browser coverage for same-origin multi-tab logout/refresh race.
- Run a full authenticated browser smoke after the notification projection fix and record any remaining secondary API errors.

## External Blockers

NONE. No owner-only credential or unavailable external resource is required to continue local work.

## Owner Action Required

false — none.

## Reality Gate Evaluation

- `REALITY-2026-003`: PARTIAL — implementation and core local session E2E are proven, but original OTP/device/multi-tab browser requirements remain.
- `REALITY-2026-011`: PASS — no CI, staging, provider, or production result is fabricated; unproven scenarios are explicitly recorded.

## Unproven / Remaining

OTP-enabled registration/submit, live provider and OTP error-state proof, same-origin multi-tab/device-revoke browser proof, any remaining secondary dashboard API behavior, and staging runtime validation remain open.

## Next Eligible Task

NONE — dependent portal tasks should wait until the remaining authentication acceptance is proven or explicitly replanned.

## Status Decision

`PARTIAL` — locally actionable requirements remain; this task must not be treated as complete yet.

## Notes / N/A Justification

- The seeded merchant account and its password were used only in the local test process; no credential is stored in this evidence or repository.
- Local browser smoke temporarily ran admin-service with non-secure host-only cookies so `localhost` could exercise the browser flow. The Docker service was restored to the repository `.env` cookie configuration afterward.
- The first E2E attempt exposed a stale merchant-service image returning `404` for `/merchant/context`; rebuilding that image resolved the runtime mismatch.
