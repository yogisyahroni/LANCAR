---
task_id: MWEB-PORTAL-P0-004
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: WORKTREE-2026-10-05
tests: PASS
integration: NOT_RUN
e2e: NOT_RUN
migration: N/A
migration_na_reason: "Import memakai schema katalog dan governance tables yang sudah ada; increment ini tidak mengubah database."
observability: NOT_RUN
security_privacy: PARTIAL
rollback_recovery: NOT_RUN
task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Customer catalog propagation, race/sold-out E2E, upload security, preview/dry-run UX, rollback proof, dan release gate masih ditunda sampai feature scope selesai."
unproven_requirements: "Full catalog publish/review/rollback, customer propagation, stale-cache race proof, image policy, and authenticated staging E2E."
known_blockers: NONE
locally_actionable_remaining: "Complete catalog publish/readiness and customer projection controls before deferred runtime verification."
blocker_resolution_attempts: NONE
unblock_condition: NONE
owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: "Run merchant-to-customer catalog E2E, sold-out race, modifier validation, import replay, rollback, and image policy checks."
dependency_chain_blocked: false
next_eligible_task: NONE
updated_at: 2026-10-05
---

# Evidence — MWEB-PORTAL-P0-004

## Implemented in this increment

- Import CSV Merchant Web sekarang mengirim raw CSV satu kali ke `/merchant/menu/import`.
- Server menjadi pemilik parsing, validation, idempotency, audit, dan batch commit; browser tetap hanya menampilkan preview.
- Import tidak lagi melakukan loop POST per baris yang dapat meninggalkan catalog setengah tersimpan.

## Verification

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (working directory merchant-web)
    result: PASS

    command: Browser/staging catalog E2E and replay/rollback
    result: NOT_RUN — owner-approved feature-first queue
