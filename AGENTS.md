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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
