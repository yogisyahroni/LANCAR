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
- **Sequential Thinking dipakai** → `07 Daily Notes/LANCAR — Reasoning {date}.md`
- **Bug pattern terdeteksi** → `06 Hermes-Ops/decisions/Bug Patterns.md`
- Sebelum bikin keputusan besar → cek dulu decision log di vault
- Skill baru ditemukan → tulis ke vault + save ke Hermes skill
- Jangan nunggu akhir sesi buat nulis — capture hasil/debug context saat masih fresh
- Vault path: `E:/antigraviti google/SUDAH DEPLOY/vault`
- Reference: `06 Hermes-Ops/Thought Capture.md`

---

## 🛠️ Tools Available

- **terminal**: bash (git-bash), Docker, Go, Node
- **MCP**: GitHub, Playwright, SQLite, Memory KG, Sequential Thinking, Time
- **Skills**: enterprise/Hermes skills tersedia di vault
- **Browser**: Playwright MCP untuk testing frontend

---

## 📋 Project Conventions

- Go backend + TypeScript/Next.js frontend + Android (Kotlin)
- CourierFlow.kt untuk state machine courier
- `make test; make lint` sebelum declare selesai jika command tersedia/applicable
- Bahasa kerja: Indonesia
- Production truth harus server-authoritative
- Jangan membuat duplicate architecture bila ownership existing masih tepat

---

## 🧠 Enterprise Skills Pack (AUTO-AKTIF di dev session)

8 skill dari `AI_AGENT_SKILL_PACK_PORTABLE.md` — wajib load & follow saat nulis code/test/merge/CI/UI/DB:

1. `enterprise-testing-2026`
   - testing pyramid
   - TDD where practical
   - coverage gate sesuai policy
   - no fake coverage

2. `file-integrity-anti-regression`
   - NO placeholders/truncation
   - import sentinel
   - full files
   - jangan merusak existing content

3. `clean-architecture-backend`
   - controller → service → repository
   - E2E wiring
   - structured logging
   - clear ownership

4. `postgresql-integrity`
   - migration-first
   - no N+1
   - indexing
   - pooling
   - transactional integrity

5. `devops-git-cicd`
   - multistage Docker
   - conventional commits
   - feature branches
   - health checks
   - CI verification

6. `observability-sre`
   - golden signals
   - OTel where applicable
   - correlation/trace id
   - PII redaction

7. `security-hardening-zerotrust`
   - JWT/cookie security
   - rate limiting
   - parameterized SQL
   - no secrets in code/log/evidence

8. `anti-ai-slop-uiux-2026`
   - intentional UI
   - responsive
   - WCAG AA
   - no random visual inconsistency
   - obey LANCAR Design System

### UNIVERSAL WORKFLOW

Setiap request:

`Intent Decoding → Dependency Mapping → Architectural Blueprint → Execution → Verification → Evidence → Self-Healing`

Self-healing maksimal 3 retry untuk error yang sama sebelum melakukan root-cause reassessment.

### CARA KERJA

- CI hijau = wajib sebelum claim final COMPLETE jika CI applicable.
- Proper split/refactor penting, tetapi jangan melakukan unrelated rewrite.
- Jangan malas membuat thin wrapper yang tidak menyelesaikan requirement sebenarnya.
- Verify CI / test result yang benar-benar berjalan.
- Jangan menurunkan assertion, validation, security, atau acceptance criteria hanya supaya CI hijau.

---

## graphify

This project has a knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:

- For codebase questions, first run:

  `graphify query "<question>"`

  when `graphify-out/graph.json` exists.

- Use:

  `graphify path "<A>" "<B>"`

  for relationships.

- Use:

  `graphify explain "<concept>"`

  for focused concepts.

- Dirty `graphify-out/` files are expected after hooks or incremental updates.
- Dirty graph files are not a reason to skip graphify.
- Only skip graphify if:
  - task is specifically about stale/incorrect graph output, or
  - user explicitly tells agent not to use it.

- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.

- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.

- After modifying code, run:

  `graphify update .`

  to keep graph current when graphify tooling is available.

---

# ✅ MASTER BLUEPRINT + REALITY EVIDENCE CONTRACT (MANDATORY)

## Source of Truth

Master implementation blueprint:

`task-food-marketplace-parity-2026.md`

Untuk setiap `TASK-ID`, agent WAJIB membaca:

1. section `TASK-ID` yang sedang dikerjakan;
2. dependency/cross-service contract yang direferensikan;
3. `PART O — GLOBAL DEFINITION OF DONE`;
4. `PART AG — BLUEPRINT → REALITY: GLOBAL MARKETPLACE EXECUTION GATES`;
5. `docs/task-evidence/README.md`.

Master task menjelaskan **apa yang harus dibangun**.

`AGENTS.md` menjelaskan **bagaimana agent wajib bekerja dan kapan agent boleh mengklaim progress/completion**.

---

# 🚦 TASK EXECUTION STATE MACHINE

Agent WAJIB bekerja **SATU TASK-ID pada satu dependency chain sampai task tersebut COMPLETE atau genuinely BLOCKED**.

Canonical execution loop:

`READ TASK`
→ `INSPECT REPO`
→ `MAP DEPENDENCIES`
→ `IMPLEMENT`
→ `TEST`
→ `UPDATE EVIDENCE`
→ `CHECK REMAINING REQUIREMENTS`

Kemudian:

### Jika masih ada locally actionable work

`CONTINUE SAME TASK`

### Jika seluruh requirement applicable terbukti

`COMPLETE`

### Jika hanya genuine unavailable dependency yang tersisa

`BLOCKED`

---

# ❗ PARTIAL IS NOT A STOPPING CONDITION

`PARTIAL` adalah **progress/evidence state**, bukan izin untuk berhenti dan pindah ke dependent TASK-ID berikutnya.

Jika task berstatus `PARTIAL`, agent WAJIB:

1. identifikasi semua remaining/unproven requirement;
2. pisahkan antara:
   - locally actionable;
   - external/unavailable blocker;
3. kerjakan semua yang masih locally actionable;
4. jalankan verification yang applicable;
5. update evidence;
6. ulangi sampai status menjadi:
   - `COMPLETE`, atau
   - genuinely `BLOCKED`.

Agent DILARANG melakukan:

`TASK A = PARTIAL`
→ `skip`
→ `TASK B dependent`

selama masih ada pekerjaan Task A yang bisa dilakukan dengan repository, local tooling, CI, available test environment, atau dependency yang sebenarnya tersedia.

---

# 🚫 DEPENDENCY ADVANCEMENT RULE

Agent tidak boleh lanjut ke TASK-ID dependent berikutnya apabila prerequisite masih:

- `PARTIAL`; atau
- `BLOCKED`.

Agent hanya boleh lanjut ke task lain ketika:

1. task sebelumnya `COMPLETE`; atau
2. task lain benar-benar **independent**, dan dependency analysis tertulis membuktikan blocker tidak mempengaruhinya.

Jangan menyebut task “independent” hanya agar agent bisa terus bergerak.

Jika ragu:

**STOP dan laporkan dependency conflict.**

---

# 🧱 BLOCKED DEFINITION

`BLOCKED` hanya sah bila:

1. semua locally actionable work sudah selesai;
2. remaining requirement benar-benar membutuhkan sesuatu yang agent tidak punya;
3. blocker ditulis secara spesifik;
4. unblock condition ditulis secara spesifik.

Contoh genuine blocker:

- external provider credential tidak tersedia;
- provider sandbox/live endpoint tidak tersedia;
- required staging infrastructure tidak tersedia;
- secret/account milik owner belum diberikan;
- product/business/legal decision belum ada;
- architecture decision membutuhkan approval;
- prerequisite TASK-ID belum complete;
- third-party dependency tidak dapat diakses.

Yang BUKAN blocker valid:

- implementasinya sulit;
- test banyak;
- perlu refactor;
- agent belum membaca code;
- agent malas menjalankan Docker yang sebenarnya tersedia;
- agent belum mencoba environment setup;
- agent takut mengubah banyak file;
- CI merah tetapi penyebabnya masih bisa diperbaiki;
- acceptance criteria rumit.

---

# 🔓 BLOCKED EVIDENCE REQUIREMENT

Evidence task `BLOCKED` harus menjelaskan minimal:

- exact blocker;
- exact remaining requirement;
- apa saja locally actionable work yang sudah selesai;
- exact unblock condition;
- apakah dependent task harus berhenti;
- task independent apa yang masih eligible bila ada.

Gunakan field:

```yaml
known_blockers: "<exact blocker>"
unproven_requirements: "<remaining proof>"

locally_actionable_remaining: NONE
unblock_condition: "<exact condition>"
dependency_chain_blocked: true
next_eligible_task: "<independent task, jika ada>"
```

## Evidence Frontmatter Contract

Setiap evidence yang disentuh wajib mendukung field berikut:

```yaml
task_id: TASK-ID
status: PARTIAL | BLOCKED | COMPLETE
reality_2026_003: PASS | PARTIAL | FAIL | NOT_RUN | N/A
reality_2026_011: PASS | PARTIAL | FAIL | NOT_RUN | N/A
implementation_ref: "<commit/PR/ref atau NONE>"
tests: PASS | PARTIAL | FAIL | NOT_RUN | N/A
e2e_staging: PASS | PARTIAL | FAIL | NOT_RUN | N/A
migration: PASS | PARTIAL | FAIL | NOT_RUN | N/A
observability: PASS | PARTIAL | FAIL | NOT_RUN | N/A
security_privacy: PASS | PARTIAL | FAIL | NOT_RUN | N/A
rollback_recovery: PASS | PARTIAL | FAIL | NOT_RUN | N/A
unproven_requirements: "<remaining proof atau NONE>"
known_blockers: "<exact blocker atau NONE>"
locally_actionable_remaining: "<remaining local work atau NONE>"
unblock_condition: "<exact unblock condition atau NONE>"
dependency_chain_blocked: false
next_eligible_task: "<task setelah COMPLETE atau NONE>"
updated_at: YYYY-MM-DD
```

`PARTIAL` wajib memiliki `locally_actionable_remaining` yang bermakna dan
`unblock_condition` yang menjelaskan langkah berikutnya; agent wajib tetap
mengerjakan TASK-ID yang sama. `BLOCKED` hanya boleh memakai
`locally_actionable_remaining: NONE` setelah seluruh pekerjaan lokal selesai,
dan wajib memiliki blocker serta kondisi unblock yang spesifik. `COMPLETE`
wajib memiliki seluruh remaining/blocker/unblock bernilai `NONE`,
`dependency_chain_blocked: false`, semua acceptance criteria terbukti, serta
kedua Reality gate PASS. Validator adalah pemeriksa konsistensi tambahan, bukan
pengganti bukti runtime yang sebenarnya.
