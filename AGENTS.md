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
