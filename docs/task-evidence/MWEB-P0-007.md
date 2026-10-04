---
task_id: MWEB-P0-007
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: bc7b0dc6

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
release_followups: "Run OTP-enabled staging browser E2E and verify trusted-device, new-device, multi-tab, and device-revoke behavior against the deployed image."

unproven_requirements: "OTP-enabled registration and new-device login were not executed with a live OTP provider; trusted-device/new-device, multi-tab, and device-binding browser scenarios remain unproven."
known_blockers: NONE

locally_actionable_remaining: "Run an OTP-enabled local/provider test scenario and add browser coverage for multi-tab logout, trusted-device login, new-device OTP, and device revoke."

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
- `[ ]` OTP-enabled registration and first login on a new device are not yet proven with a live OTP provider.
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
- Added refresh read-after-refresh recovery for the case where another tab rotates the shared cookie first.
- Rebuilt and restarted merchant-service so the server-owned merchant context route is present in the runtime image.

## Files Changed

- `backend/admin-service/src/controllers/customerAuth.controller.ts` — rotate web session tokens during refresh and clear cookie scope consistently.
- `backend/admin-service/src/controllers/customerAuth.controller.test.ts` — verify rotation and revoke-race behavior.
- `backend/admin-service/src/middleware/csrfProtection.ts` — clear CSRF cookie with the same domain/path scope.
- `backend/api-gateway/src/index.ts` — validate merchant web cookies against admin-service on every request and forward resolved identity.
- `backend/api-gateway/src/routeAuthMatrix.ts` — keep exchange public and merchant routes protected by web-session policy.
- `backend/api-gateway/scripts/routeAuthMatrix.test.js` — verify merchant route policy and cookie behavior.
- `merchant-web/src/lib/auth.ts` — in-memory/session-marker auth state and cross-tab auth events.
- `merchant-web/src/lib/api.ts` — cookie-authenticated API, refresh recovery, and logout propagation.
- `merchant-web/src/components/Layout.tsx` and `merchant-web/src/pages/Settings.tsx` — logout event handling.
- `merchant-web/src/pages/Login.tsx` and `merchant-web/src/pages/Register.tsx` — OTP continuation and server-session exchange.
- `merchant-web/src/pages/Reports.tsx` — use the cookie-authenticated API for report export.
- `merchant-web/src/lib/types.ts` — auth response/session types.
- `docs/task-evidence/MWEB-P0-007.md` — this evidence record.

## Commands / Checks Run

    command: npm run build (merchant-web)
    result: PASS — Vite production build completed.

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; 14 existing warnings remain.

    command: npx jest src/controllers/customerAuth.controller.test.ts --runInBand --forceExit (backend/admin-service)
    result: PASS — 5 tests passed.

    command: npm run build (backend/admin-service)
    result: PASS.

    command: npm run test:auth-matrix (backend/api-gateway)
    result: PASS — route auth matrix tests passed.

    command: git diff --check
    result: PASS.

    command: docker compose build merchant-web api-gateway admin-service
    result: PASS — relevant web, gateway, and admin images built.

    command: docker compose build merchant-service
    result: PASS — refreshed image includes the portal context route.

    command: docker compose up -d --no-deps merchant-web api-gateway admin-service merchant-service
    result: PASS — containers recreated; admin-service and merchant-service reported healthy.

    command: python scripts/tasks/validate_task_evidence.py
    result: PASS — task evidence gate passed; existing repository warnings remain advisory.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Focused admin-service refresh tests passed 5/5, including successful rotation and conditional-update failure/revoke-race behavior. Gateway auth-matrix tests also passed.

### Integration

Status: PASS

Evidence: Local Docker gateway, admin-service, and merchant-service were rebuilt/restarted. The seeded merchant session reached `/auth/web/me`, `/merchant/context`, and `/merchant/profile` successfully.

### E2E

Status: PARTIAL

Evidence: Local API E2E passed with compact result: `login=200, exchange=200, me=200, context=200, profile=200, refresh=200, rotated=200, old=401, logout=200, revoked=401`. Browser smoke through the local Vite app also logged the seeded merchant into `/dashboard`, rendered the authenticated shell, and returned to `/masuk` after logout. Secondary dashboard requests showed existing `Network Error` notifications, so this is not claimed as full portal browser E2E. OTP-on, multi-tab, trusted-device, and new-device scenarios remain unproven.

### Migration

Status: N/A

Evidence: Existing `web_sessions`, OTP, and device-session tables are reused; no schema change was made by this task.

### Observability

Status: PARTIAL

Evidence: Existing structured auth/gateway/service logs were observed during container restart and requests. Dedicated metrics for every browser session scenario were not added or verified.

### Security / Privacy

Status: PARTIAL

Evidence: HttpOnly cookie session exchange, secure/SameSite production cookie settings, conditional refresh rotation, old-token rejection, logout revocation, CSRF scope alignment, and no persistent bearer token storage were verified. Full OTP-provider, device-binding, and multi-tab security proof remains.

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

Evidence: Local Docker and browser smoke are useful task evidence, but the task is not a production-readiness declaration until OTP-enabled and multi-device scenarios are run against the deployed image.

### Release Follow-ups

- Run staging browser E2E with `customer_auth_otp_required` enabled and the configured OTP provider.
- Prove registration OTP, new-device OTP, trusted-device login, OTP expiry/rate limit/provider-unavailable states.
- Prove multi-tab logout/refresh race and device revoke through browser automation.

## Locally Actionable Remaining

- Add/run deterministic OTP-enabled provider tests for registration and new-device login.
- Add/run browser coverage for trusted-device, new-device OTP, multi-tab logout/refresh, and device revoke.
- Investigate the dashboard secondary `Network Error` notifications before treating the portal as fully browser-green.

## External Blockers

NONE. No owner-only credential or unavailable external resource is required to continue local work.

## Owner Action Required

false — none.

## Reality Gate Evaluation

- `REALITY-2026-003`: PARTIAL — implementation and core local session E2E are proven, but original OTP/device/multi-tab browser requirements remain.
- `REALITY-2026-011`: PASS — no CI, staging, provider, or production result is fabricated; unproven scenarios are explicitly recorded.

## Unproven / Remaining

OTP-enabled runtime flow, trusted-device/new-device browser proof, multi-tab/device-binding browser proof, full secondary dashboard API behavior, and staging runtime validation remain open.

## Next Eligible Task

NONE — dependent portal tasks should wait until the remaining authentication acceptance is proven or explicitly replanned.

## Status Decision

`PARTIAL` — locally actionable requirements remain; this task must not be treated as complete yet.

## Notes / N/A Justification

- The seeded merchant account and its password were used only in the local test process; no credential is stored in this evidence or repository.
- Local browser smoke temporarily ran admin-service with non-secure host-only cookies so `localhost` could exercise the browser flow. The Docker service was restored to the repository `.env` cookie configuration afterward.
- The first E2E attempt exposed a stale merchant-service image returning `404` for `/merchant/context`; rebuilding that image resolved the runtime mismatch.
