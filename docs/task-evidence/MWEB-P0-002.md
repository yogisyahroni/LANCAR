---
task_id: MWEB-P0-002
status: COMPLETE

reality_2026_003: PASS
reality_2026_011: PASS

implementation_ref: b25b69fc

tests: PASS
integration: PASS
e2e: PASS

migration: N/A
migration_na_reason: "Perubahan hanya pada presentasi Merchant Web dan dokumentasi ownership; tidak ada skema atau data persisten yang berubah."

observability: N/A
observability_na_reason: "Task hanya meminta trust copy, legal links, dan ownership documentation; telemetry funnel berada di MWEB-P0-004."
security_privacy: PASS
rollback_recovery: N/A
rollback_recovery_na_reason: "Tidak ada state runtime atau migrasi; rollback cukup dengan revert commit web."

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
next_eligible_task: MWEB-P0-003

updated_at: 2026-10-04
---

# Evidence — MWEB-P0-002

## Acceptance Criteria Source

Original requirement dari `task-merchant-web-growth-p0-p2-2026.md`:

- Tambahkan identitas badan hukum, alamat/kontak bisnis, email support, kanal bantuan yang benar.
- Tautan Kebijakan Privasi, Syarat dan Ketentuan, dan kebijakan penggunaan data harus valid/direct.
- Jelaskan data usaha diperiksa sebelum toko menerima pesanan.
- Copy security/data handling harus faktual dan tidak mengklaim sertifikasi yang belum dimiliki.
- Siapkan area testimonial/logo partner sebagai komponen kosong yang tidak dirender bila belum ada data terverifikasi.
- Tidak ada footer/trust copy data fiktif.
- Support info memiliki owner dan target respons internal yang terdokumentasi.
- Copy publik tidak memakai istilah internal seperti `backend`, `server`, atau nama service.

## Scope Implemented

- Menambahkan trust layer di landing Merchant Web dengan identitas `PT TEMBUS LINTAS TEKNOLOGI`, kanal `support@tembus.id`, penjelasan penggunaan data usaha, dan tautan legal/bantuan publik.
- Menggunakan halaman publik `bawain.my.id` sebagai tujuan langsung untuk Kebijakan Privasi, Syarat dan Ketentuan, serta Pusat Bantuan.
- Tidak menampilkan nomor telepon atau alamat kantor yang belum memiliki sumber terverifikasi; trust copy hanya memakai data yang sudah menjadi bagian dari sumber layanan publik/repository.
- Menyiapkan `verifiedProofItems` sebagai konfigurasi data-driven kosong. Tidak ada testimonial atau logo partner yang dirender sampai sumber dan persetujuan publikasinya tersedia.
- Menambahkan tautan Kebijakan Privasi pada footer.
- Mendokumentasikan owner, kanal, target triase internal, dan batas komunikasi publik di `docs/merchant-web/support-ownership.md`.

## Files Changed

- `merchant-web/src/pages/Landing.tsx` — trust layer, legal/support links, dan conditional verified proof component.
- `merchant-web/src/index.css` — layout trust layer responsif dan state kosong social proof.
- `docs/merchant-web/support-ownership.md` — owner dan target respons internal Merchant Web.
- `docs/task-evidence/MWEB-P0-002.md` — bukti acceptance criteria task.

## Commands / Checks Run

    command: npm run lint (cwd merchant-web)
    result: PASS — exit 0; 13 warning existing, 0 error.

    command: npm run build (cwd merchant-web)
    result: PASS — TypeScript dan Vite production build selesai.

    command: git diff --check
    result: PASS.

    command: docker compose build merchant-web
    result: PASS — image `merchant-web:staging` berhasil dibangun dengan bundle trust layer.

    command: docker compose up -d --no-deps merchant-web
    result: PASS — `tembus-merchant-web` recreated dan port `3086` aktif.

    tool: Playwright Chromium terhadap `http://localhost:3086/` dan `https://merchant.bawain.my.id/`
    result: PASS — trust layer tampil, support email terdeteksi, tidak ada istilah `backend`, `server`, atau `service name` pada copy publik, social proof tidak dirender, dan tidak ada horizontal overflow pada viewport 320, 375, 412, dan 1440px.

    tool: Playwright Chromium terhadap legal links
    result: PASS — `https://bawain.my.id/bantuan/kebijakan-privasi`, `/bantuan/syarat-dan-ketentuan`, dan `/bantuan/pusat-bantuan` mengembalikan HTTP 200 dan memiliki heading halaman yang sesuai.

    tool: Playwright Chromium keyboard traversal pada public tunnel
    result: PASS — tab order mencapai CTA pendaftaran/login/status serta link trust legal dan bantuan.

## Task-Local Verification

### Tests

Status: PASS

Evidence: `npm run lint` exit 0 dan `npm run build` exit 0. Lint masih mencatat 13 warning existing dari file lain dan tidak ada error.

### Integration

Status: PASS

Evidence: Trust layer dirender dari komponen landing, legal links diarahkan ke route publik yang sudah ada, email support memakai `mailto:`, dan proof items memakai guard data-driven.

### E2E

Status: PASS

Evidence: Playwright memuat local Docker dan public tunnel, memeriksa trust section, link/target legal, presence support email, absence of proof markup, keyboard traversal, dan overflow pada breakpoint mobile/desktop.

### Migration

Status: N/A

Evidence: Tidak ada perubahan database, endpoint, atau state persisten.

### Observability

Status: N/A

Evidence: Task tidak mengubah event, metric, atau log runtime. Analitik funnel merupakan scope MWEB-P0-004.

### Security / Privacy

Status: PASS

Evidence: Tidak ada token/PII di tautan, external links memakai `rel="noreferrer"`, copy data handling bersifat faktual, dan tidak ada sertifikasi/partner/testimonial yang diklaim tanpa bukti.

### Rollback / Recovery

Status: N/A

Evidence: Perubahan stateless pada bundle web dan dokumentasi; rollback dapat dilakukan dengan revert commit `b25b69fc`.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value: `false`

Reason: Acceptance criteria dapat dibuktikan melalui build, browser E2E, dan public tunnel. Task tidak meminta provider sandbox atau deployment produksi.

### External Runtime Validation

Status: PASS

Evidence: `https://merchant.bawain.my.id/` menyajikan trust layer dari Docker lokal melalui tunnel aktif. Ini bukan klaim deployment remote staging.

### Release Readiness

Status: NOT_RUN

Evidence: Push dan pipeline dilakukan setelah evidence ini dibuat; status CI/deployment dilaporkan terpisah.

### Release Follow-ups

- Push commit ke `origin/staging`.
- Pantau CI/CD staging dan validasi image yang dipromosikan.
- Ulangi smoke public bila deployment remote staging menggantikan tunnel lokal.

## Locally Actionable Remaining

NONE untuk MWEB-P0-002.

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

`false` — MWEB-P0-003 dapat dilanjutkan setelah MWEB-P0-002.

## Reality Gate Evaluation

### REALITY-2026-003 — Evidence-based Definition of Done

Status: `PASS`

Evidence:

- implementation: trust layer, support/legal links, conditional proof component, dan ownership doc sudah diimplementasikan.
- tests: lint/build pass.
- integration: tautan dan email support terhubung ke tujuan yang ditentukan.
- E2E: local/public browser verification pass pada breakpoint dan keyboard traversal.
- migration: N/A dengan alasan konkret.
- security/privacy: tidak ada data kontak placeholder, token, atau klaim sertifikasi/partner yang tidak terbukti.
- external proof: tidak diwajibkan oleh task; public tunnel terverifikasi.

### REALITY-2026-011 — No Fake Completeness

Status: `PASS`

Tidak ada testimonial, logo partner, alamat, nomor telepon, status legal, sertifikasi, atau angka operasional fiktif yang ditambahkan. Area social proof tidak dirender karena data terverifikasi belum tersedia.

## Unproven / Remaining

NONE untuk acceptance criteria MWEB-P0-002.

## Next Eligible Task

`MWEB-P0-003` — Perjelas alur onboarding perusahaan.

## Status Decision

Original task work untuk MWEB-P0-002 sudah terimplementasi dan seluruh acceptance criteria sudah dibuktikan. Status: `COMPLETE`.

## Notes / N/A Justification

- Migration N/A karena tidak ada persistent schema/data change.
- Observability N/A karena task tidak mengubah telemetry; analytics funnel ada pada MWEB-P0-004.
- Rollback/recovery N/A karena perubahan stateless dan dapat dikembalikan dengan revert commit.
