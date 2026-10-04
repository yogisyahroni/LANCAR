---
task_id: MWEB-P0-007
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: 4af99409

tests: PASS
integration: PASS
e2e: PASS

migration: N/A
migration_na_reason: "The flow reuses the existing web_sessions table and existing OTP/session tables; no schema change was made."

observability: PARTIAL
security_privacy: PASS
rollback_recovery: PASS

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: PARTIAL
release_followups: "Run OTP-enabled staging browser E2E with the configured provider, including registration, expiry/rate-limit, and provider-unavailable states."

unproven_requirements: "OTP-enabled registration/submit, live OTP provider behavior, and OTP expiry/rate-limit/provider-unavailable scenarios remain unproven."
known_blockers: NONE

locally_actionable_remaining: "Add/run deterministic registration and OTP error-state tests; staging provider verification remains a release follow-up."

blocker_resolution_attempts: "Rebuilt merchant-service after detecting a stale image missing the portal context route; fixed the gateway CORS allowlist after browser preflight exposed missing merchant scope headers; ran API and browser smoke against the local Docker stack."
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
- `[x]` Same-origin multi-tab logout propagation and device revoke are proven locally; staging provider behavior remains a release follow-up.
- `[x]` Persistent access/refresh credentials are not stored in `localStorage`; the web session is an HttpOnly cookie and only non-secret session markers/events are client-side.
- `[x]` Login, OTP, session-expired, account-without-store, and generic provider/error states have user-facing handling in the web flow.

## Scope Implemented

- Added merchant-web OTP continuation for login and registration, including verification and resend states instead of treating a missing `access_token` as a generic failure.
- Exchanged the short-lived customer JWT for an HttpOnly `customer_session` cookie before loading merchant context; access/refresh bearer credentials are not persisted in browser storage.
- Added cookie-authenticated gateway resolution through admin-service `/auth/web/me`, with internal identity headers stripped before gateway auth so external spoofing cannot bypass route policy.
- Removed the merchant web session decision cache so logout, refresh rotation, and revocation take effect on the next request.
- Rotated the opaque `web_sessions.session_token` on refresh using a conditional update, preventing reuse of the previous cookie during a revoke/refresh race.
- Added cross-tab logout propagation using BroadcastChannel with a storage-event marker fallback; the event contains no credential.
- Added a merchant Settings panel that lists active web sessions, identifies the current device, refreshes the list, and revokes all other sessions through the existing server endpoint.
- Added the merchant session and branch scope headers to the gateway's public browser CORS allowlist, with a contract test, so outlet-scoped portal requests pass preflight without weakening internal-header protections.
- Mapped OTP rate-limit, send-failure, and invalid/expired-code responses to user-facing Indonesian copy; registration now uses the shared safe error mapper instead of rendering internal error codes.
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
- `merchant-web/src/components/Layout.tsx` — logout event handling.
- `merchant-web/src/pages/Login.tsx` and `merchant-web/src/pages/Register.tsx` — OTP continuation and server-session exchange.
- `merchant-web/src/pages/Settings.tsx` — logout event handling plus display and revoke merchant web sessions.
- `merchant-web/src/lib/api.ts` and `merchant-web/src/pages/Register.tsx` — safe OTP error copy across login/registration flows.
- `backend/api-gateway/src/corsPolicy.ts` and `backend/api-gateway/scripts/corsPolicy.test.js` — allow merchant scope headers in browser preflight while keeping internal identity headers private.
- `merchant-web/src/pages/Reports.tsx` — use the cookie-authenticated API for report export.
- `merchant-web/src/lib/types.ts` — auth response/session types.
- `docs/task-evidence/MWEB-P0-007.md` — this evidence record.

## Commands / Checks Run

    command: npm run build (merchant-web)
    result: PASS — Vite production build completed after cross-tab marker hardening.

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; 11 non-blocking warnings remain, with the previous Register `any` warnings removed.

    command: npx jest src/controllers/customerAuth.controller.test.ts --runInBand --forceExit (backend/admin-service)
    result: PASS — 5 tests passed.

    command: npm run build (backend/admin-service)
    result: PASS.

    command: npm run test:auth-matrix (backend/api-gateway)
    result: PASS — route auth matrix tests passed.

    command: npm run test:cors (backend/api-gateway)
    result: PASS — gateway build and CORS policy contract passed, including merchant scope headers.

    command: go test ./internal/repository (backend/order-service)
    result: PASS — repository tests passed, including the current notification inbox projection test.

    command: go test ./internal/middleware (backend/auth-service)
    result: PASS — authentication abuse protection and OTP rate-limit tests passed.

    command: git diff --check
    result: PASS.

    command: docker compose build --build-arg VITE_API_URL=https://api.bawain.my.id/api/v1 merchant-web
    result: PASS — deployment-configured merchant web image built.

    command: docker compose build api-gateway
    result: PASS — gateway image rebuilt with the merchant CORS policy.

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

Evidence: Focused admin-service refresh tests passed 5/5, gateway auth-matrix and CORS policy tests passed, and merchant web lint/build completed with 0 errors. Existing non-blocking lint warnings remain in unrelated pages plus the Settings initial-load effect.

### Integration

Status: PASS

Evidence: Local Docker gateway, admin-service, merchant-service, and order-service were rebuilt/restarted. The seeded merchant session reached the existing portal routes; gateway preflight for `http://localhost:3004` with `x-merchant-branch-id` returned 204 and included the header in `Access-Control-Allow-Headers`.

### E2E

Status: PASS

Evidence: Local session E2E created two web sessions (`login=200`, `exchange=200` for both), listed sessions with `200`, revoked other sessions with `200`, rejected the second session's `/auth/web/me` with `401`, and left one current session. Browser automation against the local merchant web/API showed the Settings session panel, current-device badge, successful “Keluarkan perangkat lain” action, and no console errors. A same-origin two-page browser context also proved logout in one page redirected the other page to `/masuk`.

### Migration

Status: N/A

Evidence: Existing `web_sessions`, OTP, and device-session tables are reused; no schema change was made by this task.

### Observability

Status: PARTIAL

Evidence: Existing structured auth/gateway/service logs were observed during container restart and requests. Dedicated metrics for every browser session scenario were not added or verified.

### Security / Privacy

Status: PASS

Evidence: HttpOnly cookie session exchange, secure/SameSite production cookie settings, conditional refresh rotation, old-token rejection, logout revocation, CSRF scope alignment, no persistent bearer token storage, merchant scope CORS preflight, device revoke, same-origin logout propagation, OTP-on new-device login, and trusted-device behavior were verified. Live provider behavior and OTP error-state coverage remain release follow-ups.

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
- Prove same-origin refresh race through browser automation and run the configured OTP provider scenarios.

## Locally Actionable Remaining

- Add/run deterministic OTP-enabled provider/error-state tests for registration, OTP expiry, rate limit, and provider-unavailable paths.
- Add browser coverage for the same-origin refresh race; logout propagation and device revoke are now proven locally.
- Run staging browser smoke with the configured OTP provider.

## External Blockers

NONE. No owner-only credential or unavailable external resource is required to continue local work.

## Owner Action Required

false — none.

## Reality Gate Evaluation

- `REALITY-2026-003`: PARTIAL — implementation, session security, device revoke, and local browser flows are proven, but OTP provider/error-state requirements remain.
- `REALITY-2026-011`: PASS — no CI, staging, provider, or production result is fabricated; unproven scenarios are explicitly recorded.

## Unproven / Remaining

OTP-enabled registration/submit, live provider and OTP error-state proof, same-origin refresh-race proof, and staging runtime validation remain open.

## Next Eligible Task

NONE — dependent portal tasks should wait until the remaining authentication acceptance is proven or explicitly replanned.

## Status Decision

`PARTIAL` — locally actionable requirements remain; this task must not be treated as complete yet.

## Notes / N/A Justification

- The seeded merchant account and its password were used only in the local test process; no credential is stored in this evidence or repository.
- Local browser smoke temporarily ran admin-service with non-secure host-only cookies so `localhost` could exercise the browser flow. The Docker service was restored to the repository `.env` cookie configuration afterward.
- The first E2E attempt exposed a stale merchant-service image returning `404` for `/merchant/context`; rebuilding that image resolved the runtime mismatch.
