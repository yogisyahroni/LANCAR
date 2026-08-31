# LANCAR — Agent Instructions

## 🧠 Obsidian Second Brain (MANDATORY)

Obsidian vault adalah **source of truth**. Setiap sesi WAJIB:

### Session Start — Load Context
1. **READ** `E:\antigraviti google\SUDAH DEPLOY\vault\01 Projects\LANCAR\00 — Index.md` — project context
2. **READ** `E:\antigraviti google\SUDAH DEPLOY\vault\06 Hermes-Ops\Hermes Session Bridge.md` — bridge config
3. **CHECK** `E:\antigraviti google\SUDAH DEPLOY\vault\07 Daily Notes\` — sesi terakhir
4. **READ** `E:\antigraviti google\SUDAH DEPLOY\vault\01 Projects\LANCAR\LANCAR — Technical Decisions Log.md` — keputusan terbaru

### Session End — Write Results
5. **WRITE** session summary ke `E:\antigraviti google\SUDAH DEPLOY\vault\07 Daily Notes\LANCAR — Session {date}.md`
6. **UPDATE** decision log jika ada keputusan penting
7. **SAVE** skill baru ke `E:\antigraviti google\SUDAH DEPLOY\vault\06 Hermes-Ops\skills\` jika ada workflow baru
8. **SELF-REVIEW SEBELUM LOGOUT/TASK SELESAI**:
   - Baca ulang histori chat yang tersedia di konteks thread saat ini dan catatan vault terbaru; jangan memaksa buka Codex Desktop History jika kondisi auth sedang rawan logout.
   - Catat bagian **Self-Improvement** di session note: miskomunikasi/kesalahan, root cause perilaku agent, aturan kerja baru, dan follow-up.
   - Kalau ada pola bug agent/tooling yang berulang, tulis juga ke `E:\antigraviti google\SUDAH DEPLOY\vault\06 Hermes-Ops\decisions\Bug Patterns.md`.
   - Untuk isu Codex Desktop logout/history: review dari transcript aktif, logs, dan daily note; hindari klik History Desktop saat VS Code Codex atau host Codex lain masih aktif memakai auth store yang sama.

### During Session — REAL-TIME Thought Capture
- **Debugging kompleks** (>5 steps) → `07 Daily Notes/LANCAR — Debug {date}.md` dengan root cause analysis
- **Keputusan arsitektur** → append ke `01 Projects/LANCAR/LANCAR — Technical Decisions Log.md` (ADR format)
- **Insight baru** → `01 Projects/LANCAR/AI Context Restore.md`
- **Sequential Thinking dipakai** → `07 Daily Notes/LANCAR — Reasoning {date}.md` (full thought chain)
- **Bug pattern terdeteksi** → `06 Hermes-Ops/decisions/Bug Patterns.md`
- Sebelum bikin keputusan besar → cek dulu decision log di vault
- Skill baru ditemukan → tulis ke vault + save ke Hermes skill
- Jangan nunggu akhir sesi buat nulis — capture pikiran pas lagi fresh
- Vault path: `E:/antigraviti google/SUDAH DEPLOY/vault`
- Reference: `06 Hermes-Ops/Thought Capture.md`

## 🛠️ Tools Available
- **terminal**: bash (git-bash), Docker, Go, Node
- **MCP**: GitHub (26 tools), Playwright (23), SQLite, Memory KG, Sequential Thinking, Time
- **Skills**: 77 skills loaded (ce Hermes Skills MOC di vault)
- **Browser**: Playwright MCP untuk testing frontend

## 📋 Project Conventions
- Go backend + TypeScript/Next.js frontend + Android (Kotlin)
- CourierFlow.kt untuk state machine courier
- `make test; make lint` sebelum declare selesai
- Bahasa: Indonesia

## 🧠 Enterprise Skills Pack (AUTO-AKTIF di dev session)
8 skill dari AI_AGENT_SKILL_PACK_PORTABLE.md — wajib load & follow saat nulis code/test/merge/CI/UI/DB:
1. `enterprise-testing-2026` — testing pyramid, TDD, coverage>=90% gate, no fake coverage
2. `file-integrity-anti-regression` — NO placeholders/truncation, import sentinel, full files
3. `clean-architecture-backend` — controller->service->repo, e2e wiring, structured logging
4. `postgresql-integrity` — migration-first, no N+1, indexing, pooling
5. `devops-git-cicd` — multistage Docker, conventional commits, feature branches, health checks
6. `observability-sre` — 4 golden signals, OTel, PII redaction
7. `security-hardening-zerotrust` — JWT+cookies, rate limit, parameterized SQL, no secrets
8. `anti-ai-slop-uiux-2026` — distinctive fonts, asymmetric, motion, WCAG AA, no slop
UNIVERSAL WORKFLOW (setiap request): Intent Decoding -> Dependency Mapping -> Architectural Blueprint -> Execution (complete+tested) -> Self-Healing (max 3 retry).
CARA KERJA (user 2026-08-26): CI hijau = wajib; roadmap proper-split (god-file -> <=400 line modules) = prioritas LEBIH tinggi. JANGAN malas (thin-wrapper). SELALU verify CI (`gh run`) hijau SEBELUM push staging.
## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

---

## ✅ Master Blueprint + Reality Evidence Contract (MANDATORY)

### Source of truth

Master implementation blueprint:

`task-food-marketplace-parity-2026.md`

Untuk setiap `TASK-ID`, agent WAJIB membaca:

1. section `TASK-ID` yang sedang dikerjakan;
2. dependency/cross-service contract yang direferensikan;
3. `PART O — GLOBAL DEFINITION OF DONE`;
4. `PART AG — BLUEPRINT → REALITY: GLOBAL MARKETPLACE EXECUTION GATES`;
5. `docs/task-evidence/README.md`.

Master task menjelaskan **apa yang harus dibangun**. Bagian ini menjelaskan **kapan agent boleh mengklaim progress/completion**.

### Reality Gates berlaku ke SEMUA task

`REALITY-2026-003 — Evidence-based Definition of Done` dan
`REALITY-2026-011 — No fake completeness gate`

berlaku ke **setiap TASK-ID**, bukan hanya task di Part AG.

Task tidak boleh berstatus `COMPLETE` sampai kedua gate tersebut `PASS`.

### Status yang diizinkan

- `PARTIAL` — ada progress yang sudah diverifikasi, tetapi requirement/evidence masih tersisa.
- `BLOCKED` — dependency nyata menghalangi pekerjaan atau verifikasi.
- `COMPLETE` — semua checklist applicable sudah benar-benar implemented dan evidence lengkap; kedua Reality Gate PASS.

Jangan memakai “done”, “basically done”, “implemented”, atau “production-ready” untuk melewati definisi ini.

### Evidence wajib sebelum checkbox `[x]`

Sebelum mengubah checkbox task menjadi `[x]`, buat/update:

`docs/task-evidence/<TASK-ID>.md`

Mulai dari:

`docs/task-evidence/TEMPLATE.md`

Jika progress baru sebagian:

- evidence status = `PARTIAL` atau `BLOCKED`;
- hanya item yang benar-benar terbukti boleh `[x]`;
- item yang belum terbukti tetap `[ ]`;
- test yang tidak dijalankan = `NOT_RUN`;
- production/provider proof yang tidak tersedia harus ditulis apa adanya.

Jika semua checkbox task `[x]`, evidence harus `COMPLETE` dan validator wajib hijau.

### No Fake Completeness — aturan keras

DILARANG menganggap task selesai hanya karena:

- recommended file dibuat tetapi masih stub/TODO;
- endpoint ada tetapi client/ops flow belum wired;
- screen render tetapi backend masih mock/static/fabricated;
- compilation berhasil tetapi E2E/invariant yang diwajibkan belum dibuktikan;
- Admin GUI requirement hanya punya API/Postman;
- payment menunjukkan success tanpa persisted authoritative payment/order state;
- “ML-ready” hanya berarti model-service shell kosong;
- “multi-region” hanya berarti manifest deploy tanpa failover/data-semantics drill;
- “multi-country” hanya berarti country selector sementara money/tax/compliance/config masih hardcoded;
- “provider integrated” hanya berarti adapter skeleton tanpa contract/sandbox evidence;
- “accessible” hanya berarti tooling terpasang tanpa fixes/manual verification;
- “observability complete” hanya berarti log statement tanpa correlation/metric/alert path.

DILARANG membuat fake success, production mock, fabricated ETA/status/price/provider response, fabricated test/log/screenshot/metric/reconciliation/migration/provider callback atau fabricated production proof.

Jika credential/provider sandbox/environment tidak tersedia, kerjakan hanya bagian yang bisa dibuktikan dan tandai sisanya `PARTIAL`/`BLOCKED`.

`N/A` hanya boleh dipakai bila benar-benar tidak applicable dan WAJIB punya alasan tertulis. `N/A` bukan berarti “belum dikerjakan”.

### Wajib inspect repo sebelum coding

- Path/file di master task adalah rekomendasi sampai diverifikasi terhadap tree terbaru.
- Reuse/evolve ownership existing kalau semantics cocok.
- Jangan membuat duplicate service/table/store/design-system/feature-flag/provider-registry hanya karena blueprint menyebut nama file baru.
- Jangan rewrite acceptance criteria atau melemahkan master task agar implementation terlihat selesai kecuali user memang meminta perubahan blueprint.
- Jangan mengubah behavior unrelated hanya karena sedang cleanup.

### Verification wajib

Setelah implementasi, jalankan check yang applicable dan benar-benar tersedia, misalnya:

- formatter/linter/type checker;
- unit test;
- integration/contract test;
- Android compile/test;
- frontend build/test;
- E2E/staging flow;
- migration validation;
- concurrency/replay test;
- accessibility/security checks;
- provider sandbox contract test;
- reconciliation check.

Catat command **yang benar-benar dijalankan** dan hasil sebenarnya di evidence file.

Jika command tidak bisa dijalankan, tulis alasan sebenarnya. Jangan ubah `NOT_RUN` menjadi `PASS`.

### Completion formula

`COMPLETE = implementation + applicable tests + applicable E2E/staging + applicable migration/backfill + observability + security/privacy + rollback/recovery + Reality Gates`

Compilation saja ≠ complete.  
Screen saja ≠ complete.  
Endpoint saja ≠ complete.  
Migration saja ≠ complete.  
Mock E2E ≠ complete.

### Branch / PR discipline

Untuk implementation code:

- gunakan feature branch + PR kecuali user secara eksplisit meminta direct update;
- keep scope sesuai TASK-ID/batch;
- cantumkan TASK-ID dan evidence path di PR;
- jangan diam-diam menandai task lain `[x]`;
- jangan hapus test atau melemahkan assertion/security/validation hanya untuk membuat CI hijau.

Master-task documentation-only maintenance boleh direct ke `staging` bila user memang meminta.

### Final response agent per task

Agent wajib melaporkan:

1. `TASK-ID`;
2. status `PARTIAL` / `BLOCKED` / `COMPLETE`;
3. implementation summary;
4. files changed;
5. exact verification commands + result;
6. evidence file path;
7. hasil Reality Gate;
8. remaining/unproven requirements;
9. blockers bila ada.

Agent tidak boleh menyatakan `COMPLETE` jika evidence atau validator mengatakan sebaliknya.

### Mechanical enforcement

Sebelum claim complete, jalankan:

```bash
python3 scripts/tasks/validate_task_evidence.py
```

GitHub Actions juga menjalankan validator ini.

Jika validator gagal, task belum complete.
