---
task_id: MWEB-P0-007
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: c35d6b93

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

unproven_requirements: "Live OTP provider behavior, deployed staging runtime validation, and browser-level shared-cookie refresh-race proof remain unproven."
known_blockers: NONE

locally_actionable_remaining: "Run browser-level shared-cookie refresh-race coverage and staging provider smoke; local invalid/expired OTP, rate-limit, concurrent server refresh, and cleanup paths are proven."

blocker_resolution_attempts: "Rebuilt merchant-service after detecting a stale image missing the portal context route; fixed the gateway CORS allowlist after browser preflight exposed missing merchant scope headers; ran API and browser smoke against the local Docker stack; fixed the legacy OTP handler contract after runtime testing exposed generic Authentication required copy for invalid/expired codes; rebuilt auth-service and merchant-web."
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
- `[x]` OTP-enabled registration/submit is proven through a disposable local OTP path; live provider behavior and deployed-provider scenarios remain unproven.
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
- Hardened the legacy OTP endpoints used by merchant-web: provider/storage failure returns a stable `ERR_OTP_SEND_FAILED`/503 contract, and wrong/expired/absent codes return a stable `ERR_OTP_INVALID`/401 contract without exposing authentication or infrastructure details. The web mapper reads both legacy `error` and canonical `code` fields.
- Verified the OTP-required registration continuation locally with a disposable account: the registration start returned `require_otp=true`, OTP verification returned a session-bearing response, web-session exchange succeeded, merchant submission returned `201`, and the database reflected an active user, `SUBMITTED` onboarding, three documents, and one legal profile. The disposable account, merchant, documents, legal profile, sessions, and OTP log were removed afterward.
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

    command: go test -count=1 ./... (backend/auth-service)
    result: PASS — auth handler, middleware, service, observability, and utility packages passed after the stable OTP error-contract change.

    command: docker compose build auth-service && docker compose up -d --no-deps auth-service
    result: PASS — refreshed auth image started healthy with the OTP handler change.

    command: docker compose build --build-arg VITE_API_URL=https://api.bawain.my.id/api/v1 merchant-web && docker compose up -d --no-deps merchant-web
    result: PASS — refreshed merchant-web image built with the canonical error-code mapper and returned HTTP 200 for `/masuk`.

    command: local OTP-required registration -> OTP verification -> web-session exchange -> merchant registration -> database invariant check
    result: PASS — registration returned `require_otp=true` without a bearer token; verification and session exchange succeeded; merchant registration returned `201`; the database showed an active user, `SUBMITTED` onboarding, three documents, and a legal profile. The disposable test records were deleted afterward.

    command: local feature-flag and test-data cleanup verification
    result: PASS — the disposable user, merchant, OTP log, and related session/onboarding rows were absent after cleanup; `customer_auth_otp_required=false` and `otp_provider_live=false` were restored.

    command: local OTP invalid/expired error contract
    result: PASS — with `customer_auth_otp_required=true`, disposable registration returned `require_otp=true`; wrong and manually expired codes both returned HTTP 401, `ERR_OTP_INVALID`, and the safe Indonesian message without internal-detail leakage. Test records were deleted and the flag was restored afterward.

    command: concurrent web-session refresh race
    result: PASS — two requests using the same initial cookie produced one HTTP 200 rotation and one HTTP 401 rejection; the cookie from the successful rotation remained valid for `/auth/web/me` (HTTP 200). Browser-level shared-cookie recovery remains a follow-up.

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

Evidence: Focused admin-service refresh tests passed 5/5, gateway auth-matrix and CORS policy tests passed, auth-service tests passed without cache, merchant web lint/build completed with 0 errors, and the local OTP-required registration/submit plus invalid/expired error paths passed with database invariants. Existing non-blocking lint warnings remain in unrelated pages plus the Settings initial-load effect.

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

Evidence: HttpOnly cookie session exchange, secure/SameSite production cookie settings, conditional refresh rotation, old-token rejection, logout revocation, CSRF scope alignment, no persistent bearer token storage, merchant scope CORS preflight, device revoke, same-origin logout propagation, OTP-on new-device login, trusted-device behavior, safe invalid/expired OTP responses, and targeted disposable-data cleanup were verified. Live provider behavior and deployed staging proof remain release follow-ups.

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
- Prove registration OTP through the deployed provider, plus OTP expiry/rate limit/provider-unavailable states.
- Prove same-origin refresh race through browser automation.

## Locally Actionable Remaining

- Add browser coverage for the shared-cookie refresh race; server-side concurrent rotation, logout propagation, and device revoke are now proven locally.
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
