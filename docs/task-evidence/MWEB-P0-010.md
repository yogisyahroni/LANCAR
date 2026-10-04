---
task_id: MWEB-P0-010
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: PENDING_COMMIT

tests: PASS
integration: PASS
e2e: PASS

migration: N/A
migration_na_reason: "Release-gate implementation changes build, container, workflow, and presentation configuration; no database schema or stored onboarding data is changed."

observability: PARTIAL
security_privacy: PASS
rollback_recovery: NOT_RUN

task_scope_external_proof_required: true
external_runtime_validation: PARTIAL

release_readiness: PARTIAL
release_followups: "Run the pushed staging workflow, verify deployed staging headers/API origin/CORS/TLS and rollback the previous merchant-web image without changing onboarding data. Production sign-off must be recorded separately from this local evidence."

unproven_requirements: "CI result, deployed staging validation, live CORS/TLS verification, error-monitoring wiring, and image rollback/data-preservation proof are not yet observed."
known_blockers: NONE

locally_actionable_remaining: "Push to staging and inspect the resulting CI/release evidence; complete remote runtime and rollback checks after the workflow publishes the image."

blocker_resolution_attempts: "Added fail-closed build validation, explicit environment API contracts, container health and smoke checks, security headers, SBOM/security workflow coverage, production image publication/signing/deployment wiring, and Chromium accessibility smoke coverage."
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: "Run the staging workflow, inspect the published merchant-web image, execute browser/headers/API-origin checks against deployed staging, and exercise rollback to the previous image while checking onboarding data invariants."

dependency_chain_blocked: false
next_eligible_task: MWEB-P1-006

updated_at: 2026-10-04
---

# Evidence — MWEB-P0-010

## Acceptance Criteria Source

Original requirements from `task-merchant-web-growth-p0-p2-2026.md`:

- [x] Build staging/production tidak mungkin menghasilkan bundle yang memanggil localhost.
- [ ] CI lulus build, lint, typecheck, security/container scan, browser E2E, accessibility, dan Docker smoke test.
- [ ] Rollback ke image sebelumnya teruji tanpa merusak data onboarding.
- [ ] Public production readiness sign-off memiliki evidence terpisah dari health check tunnel lokal.

## Scope Implemented

- Merchant Web build now requires an explicit `VITE_API_URL`; release builds require HTTPS, reject loopback hosts, and require an exact `MERCHANT_EXPECTED_API_URL` match.
- Local Docker development keeps its explicit localhost API URL through `MERCHANT_BUILD_ENV=local`; staging and production compose/workflows provide their official API origins explicitly.
- Nginx now emits HSTS, CSP, frame protection, nosniff, referrer policy, and permissions policy headers. Hashed assets receive immutable cache headers, and the image has an HTTP health check.
- Staging and production workflows build, scan, smoke-test, publish, sign, verify, pull, and roll out the Merchant Web image. The merchant-web matrix also runs Chromium accessibility checks against the built container.
- The landing page and login shell were repaired for the accessibility violations found by the new gate; the local accessibility run now reports zero violations on `/`, `/masuk`, `/daftar`, and `/status`.

## Files Changed

- `.github/workflows/pr-quality.yml` — supplies an explicit CI API contract for compatibility builds.
- `.github/workflows/staging.yml` — passes staging API build arguments and adds merchant-web Docker/accessibility smoke gates.
- `.github/workflows/production.yml` — adds merchant-web production build, scan, sign/verify, pull, smoke, and rollout coverage.
- `docker-compose.yml` and `docker-compose.prod.yml` — separate explicit local versus production build configuration.
- `merchant-web/Dockerfile`, `merchant-web/nginx.conf`, `merchant-web/security-headers.conf` — fail-closed build, health check, security headers, and immutable assets.
- `merchant-web/scripts/validate-build-config.mjs` and `merchant-web/scripts/validate-build-config.test.mjs` — build contract and regression tests.
- `merchant-web/src/lib/api.ts` — removes the production localhost fallback.
- `merchant-web/src/index.css` and `merchant-web/src/pages/Login.tsx` — accessibility contrast and semantic landmark fixes.
- `scripts/e2e/merchant-web-docker-smoke.mjs` and `scripts/e2e/merchant-web-a11y.mjs` — container route/header/bundle and browser accessibility checks.

## Commands / Checks Run

    command: npm run test:config (merchant-web)
    result: PASS — 5 build-configuration tests passed.

    command: npm run lint (merchant-web)
    result: PASS — exit code 0; 11 pre-existing warnings remain, with no lint errors.

    command: MERCHANT_BUILD_ENV=staging MERCHANT_EXPECTED_API_URL=https://api.tembus.id/api/v1 VITE_API_URL=https://api.tembus.id/api/v1 npm run build
    result: PASS — staging build completed with the official staging API origin.

    command: MERCHANT_BUILD_ENV=production MERCHANT_EXPECTED_API_URL=https://api.bawain.my.id/api/v1 VITE_API_URL=https://api.bawain.my.id/api/v1 npm run build
    result: PASS — production build completed with the official production API origin.

    command: npm audit --omit=dev --audit-level=high (merchant-web)
    result: PASS — 0 vulnerabilities reported.

    command: actionlint; git diff --check
    result: PASS — no workflow or whitespace errors.

    command: docker compose -f docker-compose.prod.yml config --quiet (with non-secret validation placeholders)
    result: PASS — production compose interpolation/syntax validated; real secrets were not loaded.

    command: docker build --pull --build-arg MERCHANT_BUILD_ENV=staging --build-arg MERCHANT_EXPECTED_API_URL=https://api.tembus.id/api/v1 --build-arg VITE_API_URL=https://api.tembus.id/api/v1 -t tembus-local/merchant-web:mweb-p0-010 merchant-web
    result: PASS — staging-like image built.

    command: docker build --pull --build-arg MERCHANT_BUILD_ENV=production --build-arg MERCHANT_EXPECTED_API_URL=https://api.bawain.my.id/api/v1 --build-arg VITE_API_URL=https://api.bawain.my.id/api/v1 -t tembus-local/merchant-web:mweb-p0-010-prod merchant-web
    result: PASS — production-like image built.

    command: node scripts/e2e/merchant-web-docker-smoke.mjs http://127.0.0.1:4173
    result: PASS — local staging-like container health, SPA routes, required security headers, asset cache, and bundle API-origin checks passed.

    command: node scripts/e2e/merchant-web-a11y.mjs http://127.0.0.1:4173
    result: PASS — Chromium/axe found 0 violations on `/`, `/masuk`, `/daftar`, and `/status`.

    command: node scripts/e2e/merchant-web-docker-smoke.mjs http://127.0.0.1:4174
    result: PASS — local production-like container health, SPA routes, required security headers, asset cache, and bundle API-origin checks passed.

    command: HEAD https://merchant.bawain.my.id/{/,/masuk,/daftar,/status,/dashboard}
    result: PARTIAL — all routes returned HTTP 200 through Cloudflare, but the currently deployed public response did not expose the new HSTS/CSP headers; this is deployment evidence, not local image evidence.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Build configuration tests, production/staging TypeScript builds, lint, audit, actionlint, and diff checks above.

### Integration

Status: PASS

Evidence: Both local staging-like and production-like images built with explicit official API origins and failed closed when release configuration was missing/invalid.

### E2E

Status: PASS locally; NOT_RUN in remote CI

Evidence: Docker smoke and Chromium/axe checks passed against the local built image. The post-push GitHub Actions result remains to be observed.

### Migration

Status: N/A

Evidence: No persistent schema or onboarding data mutation is part of this release-gate change.

### Observability

Status: PARTIAL

Evidence: Container health check and release smoke visibility are implemented. Live error-monitoring destination and alert/escalation proof remain unobserved.

### Security / Privacy

Status: PASS locally; external deployment NOT_RUN

Evidence: Release URL guard, CSP/HSTS/frame/nosniff/referrer/permissions headers, npm audit, and local bundle/header smoke checks passed. Trivy is wired in CI but the local host does not have the Trivy binary.

### Rollback / Recovery

Status: NOT_RUN

Evidence: Production workflow now carries the image through signed publication and rolling update, but a previous-image rollback with onboarding-data invariants has not been executed in this session.

## External Runtime / Release Validation

Status: PARTIAL

- Public route reachability was observed for all required routes, but the public site still lacks the new response headers, proving that the current deployed image has not yet been replaced by this local build.
- Staging deployment, real CORS/API-origin verification, TLS inspection, rollback, and production sign-off remain separate from this local proof and must be captured after the pushed workflow runs.

## Remaining Requirements

- Observe the staging CI workflow after this commit and record its actual result.
- Verify deployed staging headers, asset cache, API origin, CORS, TLS, SPA fallback, and browser routes.
- Test rollback to the previous Merchant Web image and verify onboarding records are unchanged.
- Capture production readiness sign-off separately from the local/tunnel health check.

