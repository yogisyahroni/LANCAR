---
task_id: MWEB-PORTAL-P0-008
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: WORKTREE-2026-10-05

tests: PASS
integration: NOT_RUN
e2e: NOT_RUN

migration: N/A
migration_na_reason: "Review/reply increment memakai tabel merchant ratings dan reply yang sudah tersedia; tidak ada schema baru."

observability: NOT_RUN
security_privacy: PARTIAL
rollback_recovery: NOT_RUN

task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Issue center, customer/courier support, evidence moderation, escalation, refund/compensation policy, staging E2E, dan release gate tetap ditunda sampai capability portal selesai."

unproven_requirements: "Issue lifecycle end to end; attachment/evidence validation and expiry; support escalation; duplicate-safe compensation; browser/staging/device proof."
known_blockers: NONE
locally_actionable_remaining: "Implement issue/support workflow and connect refund/compensation policy; after feature scope complete run deferred cross-app and release verification."
blocker_resolution_attempts: NONE
unblock_condition: NONE
owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: "Run authenticated merchant review/reply and issue E2E with customer/admin, duplicate requests, privacy checks, and reconciliation proof."
dependency_chain_blocked: false
next_eligible_task: NONE
updated_at: 2026-10-05
---

# Evidence — MWEB-PORTAL-P0-008

## Implemented in this increment

- Merchant Web menampilkan ringkasan rating dan distribusi bintang dari endpoint database-authoritative.
- Ulasan customer ditampilkan tanpa data kontak; merchant dapat membuat atau memperbarui tanggapan melalui endpoint yang sudah tenant-scoped dan diaudit.
- Rating/review diperlakukan read-only untuk merchant; UI hanya menyediakan reply.

## Files

- `merchant-web/src/pages/Reviews.tsx`
- `merchant-web/src/lib/types.ts`
- `merchant-web/src/App.tsx`
- `merchant-web/src/components/Layout.tsx`

## Verification

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (working directory merchant-web)
    result: PASS

    command: Browser/staging/device E2E
    result: NOT_RUN — owner-approved feature-first queue

The queue is intentionally recorded as not run, not passed.
