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
