---
task_id: MWEB-P0-001
status: COMPLETE

reality_2026_003: PASS
reality_2026_011: PASS

implementation_ref: PENDING_COMMIT

tests: PASS
integration: PASS
e2e: PASS

migration: N/A
migration_na_reason: "Perubahan hanya pada landing page dan tautan; tidak ada skema atau data persisten yang berubah."

observability: N/A
observability_na_reason: "Analitik funnel merupakan scope MWEB-P0-004, bukan acceptance criteria MWEB-P0-001."
security_privacy: PASS
rollback_recovery: N/A
rollback_recovery_na_reason: "Tidak ada state atau data yang dimutasi; rollback cukup dengan revert commit web."

task_scope_external_proof_required: false
external_runtime_validation: PASS

release_readiness: NOT_RUN
release_followups: "CI dan deployment image staging tetap perlu dipantau setelah push; public tunnel lokal sudah menyajikan bundle baru."

unproven_requirements: NONE
known_blockers: NONE

locally_actionable_remaining: NONE
blocker_resolution_attempts: NONE
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: NONE

dependency_chain_blocked: false
next_eligible_task: MWEB-P0-002

updated_at: 2026-10-03
---

# Evidence — MWEB-P0-001

## Acceptance Criteria Source

Original requirement dari `task-merchant-web-growth-p0-p2-2026.md`:

- Pengguna baru dapat memilih jalur perusahaan atau perorangan tanpa membaca FAQ.
- CTA perusahaan membuka flow pendaftaran perusahaan yang benar.
- CTA perorangan membuka tautan aplikasi resmi atau instruksi instalasi yang valid.
- Login portal dan cek status dapat dijangkau dari header, hero, dan footer.
- Layout tetap aman pada lebar 320–1440px dan keyboard navigation.

## Scope Implemented

- Hero memakai `Daftar sebagai perusahaan` sebagai CTA utama menuju `/daftar`.
- Hero menyediakan CTA `Daftar perorangan lewat aplikasi` menuju kanal rilis resmi TEMBUS di GitHub Releases.
- Hero menjelaskan perbedaan jalur PT/badan usaha dan usaha perorangan tanpa mengharuskan pengunjung membuka FAQ.
- Akses `Masuk` dan `Cek status pendaftaran` tersedia di header, hero, dan footer.
- CTA eksternal dibuka dengan `target="_blank"` dan `rel="noreferrer"`.

## Files Changed

- `merchant-web/src/pages/Landing.tsx` — pemisahan CTA perusahaan/perorangan dan akses cepat login/status.
- `merchant-web/src/index.css` — styling route note dan quick links yang responsif.
- `docs/task-evidence/MWEB-P0-001.md` — bukti acceptance criteria task.

## Commands / Checks Run

    command: npm run lint (cwd merchant-web)
    result: PASS — exit 0; 13 warning existing, 0 error.

    command: npm run build (cwd merchant-web)
    result: PASS — TypeScript dan Vite production build selesai.

    command: git diff --check
    result: PASS.

    command: docker compose build merchant-web
    result: PASS — image merchant-web staging berhasil dibangun.

    command: docker compose up -d --no-deps merchant-web
    result: PASS — `tembus-merchant-web` recreated dan port `3086` aktif.

    tool: Playwright Chromium terhadap `http://localhost:3086/` dan `https://merchant.bawain.my.id/`
    result: PASS — CTA, href, target, route login/status, dan tidak ada horizontal overflow pada viewport 320, 375, 412, dan 1440px.

    tool: Playwright Chromium keyboard traversal pada public tunnel
    result: PASS — tab order mencapai CTA perusahaan, CTA perorangan, login, dan cek status.

    command: HTTP probes ke `/`, `/daftar`, `/masuk`, `/status` lokal dan public
    result: PASS — seluruh URL mengembalikan HTTP 200.

    command: GitHub Releases API `yogisyahroni/LANCAR/releases`
    result: PASS — release terbaru tersedia dan memiliki asset `tembus-merchant-release.apk`; URL resmi yang dipakai CTA tervalidasi HTTP 200.

## Task-Local Verification

### Tests

Status: PASS

Evidence: `npm run lint` exit 0 dan `npm run build` exit 0. Warning lint berasal dari file merchant-web yang sudah ada dan tidak menambah error pada perubahan ini.

### Integration

Status: PASS

Evidence: CTA perusahaan memakai route SPA `/daftar`; login/status memakai route `/masuk` dan `/status`; CTA perorangan memakai URL kanal rilis resmi yang berisi APK Merchant.

### E2E

Status: PASS

Evidence: Playwright memuat bundle lokal dan tunnel public pada empat breakpoint, memeriksa href CTA, tidak ada overflow horizontal, dan melakukan traversal keyboard.

### Migration

Status: N/A

Evidence: Tidak ada perubahan database, endpoint, atau state persisten.

### Observability

Status: N/A

Evidence: Event funnel adalah scope terpisah MWEB-P0-004.

### Security / Privacy

Status: PASS

Evidence: CTA tidak membawa PII/token; tautan eksternal memakai `rel="noreferrer"`; tidak ada klaim legal atau status pendaftaran palsu yang ditambahkan.

### Rollback / Recovery

Status: N/A

Evidence: Tidak ada state runtime atau migrasi; perubahan dapat dikembalikan dengan revert commit.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value: `false`

Reason: Acceptance criteria dapat dibuktikan melalui build, browser E2E, dan public tunnel; tidak meminta provider sandbox atau deployment produksi.

### External Runtime Validation

Status: PASS

Evidence: `https://merchant.bawain.my.id/` menyajikan bundle baru dan route public mengembalikan HTTP 200. Ini adalah public tunnel ke Docker lokal, bukan klaim deployment remote staging.

### Release Readiness

Status: NOT_RUN

Evidence: Push dan pipeline dilakukan setelah evidence ini dibuat; hasil CI/deployment tetap dilaporkan terpisah.

### Release Follow-ups

- Push commit ke `origin/staging`.
- Pantau CI/CD staging dan validasi image yang dipromosikan.
- Ulangi smoke public bila deployment remote staging menggantikan tunnel lokal.

## Locally Actionable Remaining

NONE untuk MWEB-P0-001.

## Blocker Resolution Attempts

NONE — tidak ada blocker.

## External Blockers

NONE.

## Owner Action Required

NONE.

## Unblock Condition

NONE.

## Verification After Unblock

NONE.

## Dependency Impact

`false` — MWEB-P0-002 adalah task berikutnya dan tidak terhalang oleh MWEB-P0-001.

## Reality Gate Evaluation

### REALITY-2026-003 — Evidence-based Definition of Done

Status: `PASS`

Evidence:

- implementation: CTA dan copy route sudah diimplementasikan.
- tests: lint/build pass.
- integration: route internal dan URL resmi aplikasi tervalidasi.
- E2E: Playwright lokal/public pass pada breakpoint dan keyboard traversal.
- migration: N/A dengan alasan konkret.
- security/privacy: tidak ada PII/token dan external link hardened.
- external proof: tidak diwajibkan oleh task; public tunnel terverifikasi.

### REALITY-2026-011 — No Fake Completeness

Status: `PASS`

Tidak ada mock status sukses, angka bisnis, testimonial, partner logo, atau data pendaftaran yang ditambahkan. URL aplikasi perorangan diverifikasi terhadap release resmi yang memiliki asset Merchant APK.

## Unproven / Remaining

NONE untuk acceptance criteria MWEB-P0-001.

## Next Eligible Task

`MWEB-P0-002` — Bangun trust layer dan identitas legal.

## Status Decision

Original task work untuk MWEB-P0-001 sudah terimplementasi dan seluruh acceptance criteria sudah dibuktikan. Status: `COMPLETE`.

## Notes / N/A Justification

- Migration N/A karena tidak ada persistent schema/data change.
- Observability N/A karena analytics funnel merupakan scope MWEB-P0-004.
- Rollback/recovery N/A karena perubahan bersifat stateless static web.
