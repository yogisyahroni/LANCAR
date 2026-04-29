# TASKS ADDENDUM v1.1 — Feature Flags Implementation
## Platform Logistik Hyperlocal Relay
### Update: 29 April 2026 | Terintegrasi ke TASKS v1.0

> **Catatan:** Dokumen ini menambahkan task-task baru ke TASKS v1.0.
> Task baru disisipkan ke sprint yang paling relevan.
> Semua task baru diberi label **[BARU v1.1]**.

---

## POSISI INTEGRASI KE SPRINT YANG ADA

```
Sprint 1  (DB Setup)         → FF-DB-001: Schema feature_flags + feature_flag_logs
Sprint 3  (Order + Routing)  → FF-BACK-001: Flag reader + routing engine update
Sprint 3  (Order + Routing)  → FF-BACK-002: Admin API feature flags
Sprint 4  (Payment + Notif)  → FF-BACK-003: Invalidasi cache + notifikasi
Sprint 5  (Customer App)     → FF-MOB-001: Flag-aware routing di customer app
Sprint 6  (Courier App)      → FF-MOB-002: Flag-aware order di courier app
Sprint 10 (Admin Dashboard)  → FF-WEB-001: Feature Flag Management UI
Sprint 10 (Admin Dashboard)  → FF-WEB-002: 3-Leg Activation Readiness Dashboard
Sprint 12 (QA)               → FF-QA-001: Testing feature flags
```

---

## SPRINT 1 — DATABASE [BARU v1.1]

---

### FF-DB-001 — Feature Flags Schema
**Assignee:** Backend Lead
**Estimasi:** 2 hari
**Priority:** P0 — Blocker untuk semua task FF lainnya
**Sprint:** 1 (sisipkan setelah DB-001 selesai)

#### Subtask:

- [x] Buat migrasi tabel `feature_flags` sesuai skema ERD v1.1:
  ```sql
  -- Kolom baru vs ERD v1.0:
  -- + category VARCHAR(50) -- 'model' | 'pricing' | 'feature' | 'system'
  -- + require_checklist BOOLEAN DEFAULT FALSE
  ```

- [x] Buat migrasi tabel `feature_flag_logs` (immutable audit trail):
  ```sql
  -- Tabel baru, tidak ada di ERD v1.0
  -- Include: DB trigger untuk prevent UPDATE/DELETE
  ```

- [x] Buat seed data semua 15 feature flags dengan nilai default:
  - `model_p2p` → **ON**, require_checklist: FALSE
  - `model_two_legs` → **ON**, require_checklist: FALSE
  - `model_three_legs` → **OFF**, require_checklist: **TRUE**
  - `dynamic_pricing_peak_hour` → ON
  - `dynamic_pricing_weather` → ON
  - `dynamic_pricing_demand_supply` → ON
  - `volumetric_scanning` → ON
  - `arcore_scanning` → OFF
  - `package_insurance` → ON
  - `in_app_chat` → ON
  - `loyalty_program` → ON
  - `referral_program` → ON
  - `scheduled_delivery` → OFF
  - `multi_zone_courier` → ON
  - `courier_leaderboard` → ON

- [x] Test DB trigger immutability: coba UPDATE/DELETE di `feature_flag_logs` → harus error
- [x] Tambahkan indexes: `key (UNIQUE)`, `category`, `is_enabled`
- [x] Dokumentasikan config JSON schema per flag di README teknis

**Acceptance Criteria:**
```
✅ Semua 15 flag terseed dengan nilai default yang benar
✅ Trigger immutable bekerja (test UPDATE → error)
✅ Query GET flag by key < 5ms (dengan index)
✅ Seed bisa dijalankan ulang (idempotent)
```

---

## SPRINT 3 — CORE BACKEND [BARU v1.1]

---

### FF-BACK-001 — Flag Reader + Routing Engine Update
**Assignee:** Backend (Go — routing-service)
**Estimasi:** 3 hari
**Priority:** P0 — Blocker untuk ORDER-001
**Sprint:** 3 (sebelum ORDER-001 dimulai, atau paralel hari 1–2)

#### Context

Routing engine di ORDER-003 (TASKS v1.0) perlu diupdate: **sebelum memilih model, selalu baca feature flag dari Redis/DB.** Ini mengubah flow dari deterministic rule-based menjadi flag-aware rule-based.

#### Subtask:

**[Flag Reader Service]**
- [x] Buat `FlagReader` struct dengan interface:
  ```go
  type FlagReader interface {
      GetFlag(ctx context.Context, key string) (*FeatureFlag, error)
      GetFlags(ctx context.Context, keys []string) (map[string]*FeatureFlag, error)
      InvalidateCache(ctx context.Context, key string) error
  }
  ```

- [x] Implementasi caching strategy:
  - Redis GET dulu (cache key: `flag:{key}`, TTL 60 detik)
  - Cache miss → query PostgreSQL → simpan ke Redis
  - Cache HIT rate target: >95% (flag jarang berubah)

- [x] Handle Redis unavailable: fallback langsung ke DB (tidak gagal total)
- [x] Handle DB unavailable: return last known cached value + alert (graceful degradation)
- [x] Unit test: mock Redis + DB, test semua code path

**[Routing Engine Update — Model Selector]**
- [x] Refactor `SelectModel()` function untuk baca flags sebelum pilih model:
  ```go
  // SEBELUM (v1.0):
  if dist < 15 { return P2P }
  
  // SESUDAH (v1.1):
  flags := readModelFlagsParallel(ctx)  // paralel read 3 flags
  if dist < 15 && flags.P2P.IsEnabled && zoneActive(flags.P2P, zone) {
      return P2P
  }
  ```

- [x] Baca 3 model flags secara paralel (goroutine) untuk minimasi latency:
  ```go
  // Target: total flag read < 10ms (dari Redis cache)
  var wg sync.WaitGroup
  wg.Add(3)
  go func() { defer wg.Done(); p2pFlag = reader.GetFlag("model_p2p") }()
  go func() { defer wg.Done(); twoFlag = reader.GetFlag("model_two_legs") }()
  go func() { defer wg.Done(); threeFlag = reader.GetFlag("model_three_legs") }()
  wg.Wait()
  ```

- [x] Implementasi zone active check:
  ```go
  // cek apakah zona customer ada di active_zones config flag
  func zoneActive(flag *FeatureFlag, zone string) bool {
      zones := flag.Config["active_zones"].([]string)
      for _, z := range zones { if z == zone { return true } }
      return false
  }
  ```

- [x] Implementasi rejection messages:
  ```go
  type ModelUnavailableError struct {
      Model     string
      MessageID string  // untuk i18n di client
      UserMsg   string  // pesan yang ditampilkan ke customer
  }
  ```

- [ ] Rollout percentage check:
  ```go
  // Jika rollout_pct < 100, hanya sebagian user yang dapat model ini
  func inRollout(flag *FeatureFlag, userID string) bool {
      pct := flag.Config["rollout_pct"].(int)
      if pct >= 100 { return true }
      // Hash userID → angka 0-99 → bandingkan dengan pct
      hash := fnv32(userID) % 100
      return int(hash) < pct
  }
  ```

- [x] Integration test: test semua kombinasi flag ON/OFF + zona active/inactive
- [x] Benchmark: pastikan SelectModel() dengan flag check < 20ms (vs < 5ms tanpa flag — overhead minimal)

**Acceptance Criteria:**
```
✅ SelectModel() membaca flags dari Redis (cache hit <5ms, miss <20ms)
✅ Jika model_three_legs OFF dan jarak >25km → return error MSG_THREE_LEGS_UNAVAILABLE
✅ Jika model_two_legs OFF dan jarak 15-25km → return error (bukan fallback ke 3-Kaki)
✅ Flags dibaca paralel (3 goroutine bersamaan)
✅ Graceful degradation jika Redis down (fallback ke DB)
✅ Unit test coverage >85% untuk routing logic
✅ Benchmark: P95 SelectModel() < 20ms
```

---

### FF-BACK-002 — Admin API: Feature Flag Management
**Assignee:** Backend (Node.js — admin-service)
**Estimasi:** 3 hari
**Priority:** P0
**Sprint:** 3 (paralel dengan FF-BACK-001)

#### Endpoints yang Perlu Dibangun

```
GET    /admin/feature-flags                    → list semua flags
GET    /admin/feature-flags/:key               → detail 1 flag + audit history
PATCH  /admin/feature-flags/:key/toggle        → ON/OFF flag (super_admin only)
PATCH  /admin/feature-flags/:key/config        → update config JSON (super_admin only)
GET    /admin/feature-flags/:key/logs          → riwayat perubahan flag
GET    /admin/feature-flags/readiness/three-legs → data 3-Leg Activation Checklist
```

#### Subtask:

**[GET /admin/feature-flags]**
- [x] Return semua 15 flags dengan status + last_updated_by + last_updated_at
- [x] Filter by category (model/pricing/feature/system)
- [ ] Akses: semua role admin bisa baca (kecuali cs_agent dan finance)

**[PATCH /admin/feature-flags/:key/toggle — KRITIS]**
- [ ] Middleware: role check → hanya `super_admin`
- [ ] Middleware: 2FA check → session harus memiliki `totp_verified: true`
- [ ] Rate limiting: max 10 toggle per jam per super_admin
- [x] Request body:
  ```typescript
  {
    new_enabled: boolean,
    reason: string,           // min 50 karakter
    totp_code: string,        // kode TOTP 6 digit
    checklist_data?: {        // WAJIB jika key === 'model_three_legs' && new_enabled === true
      sla_two_legs_4weeks_pct: number,
      courier_density_per_zone: number,
      validated_meeting_points: number,
      daily_orders_avg: number,
      admin_manual_confirm: boolean
    }
  }
  ```
- [x] Jika `model_three_legs` dan `new_enabled: true`:
  - Jalankan `validateActivationChecklist()` — tolak jika tidak terpenuhi
  - Return error detail kondisi mana yang belum terpenuhi
- [x] DB transaction: update `feature_flags` + insert `feature_flag_logs` (atomic)
- [x] Invalidate Redis cache: `DEL flag:{key}`
- [ ] Kirim notifikasi ke semua `super_admin` aktif via email + in-app
- [ ] Kirim alert ke Slack/Discord ops channel
- [x] Response: return flag state baru + log entry

**[GET /admin/feature-flags/readiness/three-legs]**
- [x] Hitung dan return data real-time untuk 3-Leg Activation Checklist:
  ```typescript
  {
    gate: {
      sla_two_legs_rolling_4weeks: {
        week1: 85.2, week2: 86.1, week3: 88.7, week4: 89.1,
        all_above_93: false,
        current_avg: 87.3
      }
    },
    checklist: {
      courier_density: {
        "JAK-TIM": 28, "JAK-BAR": 22, "JAK-PST": 31,
        min_required: 30, zones_ready: ["JAK-PST"]
      },
      validated_meeting_points: { count: 4, required: 5 },
      daily_orders: { avg_30days: 187, required: 200 }
    },
    overall_ready: false,
    estimated_ready_in_weeks: 6,
    can_activate: false
  }
  ```
- [ ] Query menggunakan materialized view untuk performa (refresh per jam)
- [ ] Cache response 5 menit di Redis (data ini tidak perlu real-time)

**[PATCH /admin/feature-flags/:key/config]**
- [x] Update config JSONB (misal: ubah active_zones, rollout_pct)
- [ ] Validasi JSON schema per key (tidak sembarang config bisa masuk)
- [x] Juga invalidate Redis cache + audit log

**Acceptance Criteria:**
```
✅ Toggle 3-Kaki tanpa checklist → 422 Unprocessable Entity
✅ Toggle tanpa 2FA → 403 Forbidden
✅ Toggle oleh ops_manager → 403 Forbidden
✅ Reason < 50 karakter → 400 Bad Request
✅ Setiap toggle → log tersimpan di feature_flag_logs
✅ Setiap toggle → notifikasi ke semua super_admin
✅ Readiness API akurat vs data DB
```

---

### FF-BACK-003 — Cache Invalidation + Broadcast
**Assignee:** Backend (Node.js)
**Estimasi:** 1 hari
**Priority:** P1
**Sprint:** 3

#### Subtask:

- [x] Setelah toggle flag → publish event ke Redis Pub/Sub:
  ```
  Channel: flag:changed
  Payload: { "key": "model_three_legs", "is_enabled": true, "changed_at": "..." }
  ```

- [x] Semua instance routing-service (Go) subscribe ke channel ini → invalidate local cache

- [ ] Notifikasi real-time ke admin dashboard via WebSocket:
  ```
  Server → Client: { event: "flag:changed", key: "model_three_legs", enabled: true }
  ```
  Admin dashboard langsung refresh tampilan tanpa perlu reload halaman.

- [ ] Alert email template untuk perubahan flag kritikal (model flags):
  ```
  Subject: [ALERT] Feature Flag Changed — model_three_legs: OFF → ON
  Body: Admin Andi mengaktifkan 3-Kaki pada 2026-10-15 09:03 WIB
        Alasan: [reason text]
        IP: 10.0.0.5
        [LIHAT LOG LENGKAP]
  ```

**Acceptance Criteria:**
```
✅ Perubahan flag terasa di routing engine ≤ 60 detik
✅ Admin dashboard update real-time via WebSocket
✅ Email alert terkirim ke semua super_admin dalam 2 menit
```

---

## SPRINT 5 — CUSTOMER APP [BARU v1.1]

---

### FF-MOB-001 — Flag-Aware UI di Customer App
**Assignee:** Mobile Engineer 1
**Estimasi:** 2 hari
**Priority:** P1
**Sprint:** 5 (sisipkan ke dalam CUST-003)

#### Context

Customer app perlu handle skenario ketika model tertentu tidak tersedia (flag OFF). UI harus informatif — bukan crash atau error generik.

#### Subtask:

**[Pricing Estimate Screen — Handle Rejection]**
- [ ] Saat user input alamat pickup dan dropoff, call `POST /pricing/estimate`
- [ ] Handle response error model tidak tersedia:
  ```dart
  // Flutter — handle model unavailable
  if (response.errorCode == 'MODEL_UNAVAILABLE') {
    showBottomSheet(
      icon: Icons.location_off,
      title: 'Rute Belum Tersedia',
      message: response.userMessage,
      // Contoh: "Maaf, rute ini belum tersedia saat ini.
      //          Kami sedang memperluas jangkauan layanan."
      cta: 'Coba Rute Lain',
    );
  }
  ```

- [ ] Tampilkan badge "LAYANAN TERBATAS" di area peta jika zona customer belum aktif untuk model tertentu

- [ ] Jika rute >25 km dan 3-Kaki OFF: jangan crash, tampilkan:
  ```
  ┌─────────────────────────────────┐
  │  📍 Jarak: 32 km               │
  │                                 │
  │  Maaf, layanan untuk rute ini  │
  │  belum tersedia saat ini.      │
  │                                 │
  │  Kami sedang memperluas        │
  │  jangkauan ke area Anda! 🚀    │
  │                                 │
  │  [Coba Rute Lain]              │
  └─────────────────────────────────┘
  ```

- [ ] Track event analytics: `model_unavailable_shown { route_distance, zones, timestamp }`
  → Berguna untuk keputusan kapan aktifkan 3-Kaki (lihat demand di area tsb)

**Acceptance Criteria:**
```
✅ Tidak ada unhandled exception saat model OFF
✅ Pesan ke customer ramah dan informatif
✅ Analytics event tercatat untuk semua rejection
✅ UI test: mock API rejection → verify UI tampil benar
```

---

## SPRINT 6 — COURIER APP [BARU v1.1]

---

### FF-MOB-002 — Flag-Aware Order di Courier App
**Assignee:** Mobile Engineer 2
**Estimasi:** 1 hari
**Priority:** P1
**Sprint:** 6 (sisipkan ke COUR-003)

#### Subtask:

- [ ] Saat kurir online, app query endpoint yang menyertakan info model aktif:
  ```dart
  // Kurir hanya akan menerima order sesuai model yang aktif
  // Backend sudah handle ini — tidak perlu filter di client
  // Tapi UI harus siap menampilkan badge model di notif order:
  ```
  ```
  ┌──────────────────────────────────┐
  │  📦 Order Baru — P2P            │  ← badge model
  │  Rp18.000 | 4.2 km | 28 mnt    │
  │  [ACCEPT]          [DECLINE]    │
  └──────────────────────────────────┘
  ```

- [ ] Badge model warna berbeda: P2P (hijau), 2-Kaki (biru), 3-Kaki (ungu — untuk nanti)
- [ ] Jika kurir relay score <3.5 dan 2-Kaki aktif: tampilkan info "Tingkatkan skor untuk dapat order 2-Kaki"
- [ ] Log: jika kurir decline karena "order type yang tidak familiar" → flag ke admin untuk review training

**Acceptance Criteria:**
```
✅ Badge model tampil di semua order notification
✅ Warna badge sesuai model
✅ Kurir dengan score rendah dapat informasi yang actionable
```

---

## SPRINT 10 — ADMIN DASHBOARD [BARU v1.1]

---

### FF-WEB-001 — Feature Flag Management UI
**Assignee:** Frontend Engineer
**Estimasi:** 3 hari
**Priority:** P0 (Super Admin butuh ini untuk operasional)
**Sprint:** 10 (paralel dengan ADMIN-002)

#### Subtask:

**[Halaman: /admin/feature-flags]**
- [ ] Layout: tabel + card view (toggle switch)
- [ ] Filter by category tabs: Semua | Model | Pricing | Feature | System
- [ ] Per flag card tampilkan:
  ```
  ┌──────────────────────────────────────────────┐
  │ 🚩 model_three_legs          [●●● SUPER ADMIN]│
  │ Model Relay 3-Kaki untuk rute >25km          │
  │                                              │
  │ Status: ⬛ OFF                               │
  │ Terakhir diubah: Belum pernah               │
  │                                              │
  │ [LIHAT CONFIG]  [AUDIT LOG]  [AKTIFKAN ▶]   │
  └──────────────────────────────────────────────┘
  ```

- [ ] Toggle switch: klik → muncul modal konfirmasi
- [ ] Modal konfirmasi untuk flag biasa:
  ```
  Konfirmasi: Aktifkan model_two_legs?
  Alasan perubahan: [textarea min 50 karakter]
  Kode TOTP: [______]
  [Batal]  [Konfirmasi]
  ```

- [ ] Modal konfirmasi untuk `model_three_legs` (extended):
  - Tampilkan 3-Leg Readiness checklist inline
  - Jika belum memenuhi: checklist merah, tombol disable
  - Jika semua terpenuhi: checklist hijau, tombol aktif
  - Checkbox manual confirm + textarea reason + TOTP input

- [ ] Config JSON editor:
  - Monaco editor (sama seperti VSCode) dengan syntax highlighting
  - Schema validation real-time
  - Preview: "Dengan config ini, X% order terdampak"

- [ ] Audit log per flag: timeline vertikal semua perubahan (before/after, alasan, siapa)

**[Komponen: ToggleFlagModal]**
- [ ] Reusable modal untuk semua toggle
- [ ] Props: flagKey, currentEnabled, requireChecklist
- [ ] States: idle → loading → success/error
- [ ] Error states: checklist not met, 2FA wrong, reason too short

**Acceptance Criteria:**
```
✅ Toggle flag biasa: 3 klik (toggle → isi reason → TOTP → submit)
✅ Toggle model_three_legs: tampilkan checklist SEBELUM form
✅ Jika checklist belum met: tombol Aktifkan disabled + tooltip alasan
✅ Setelah toggle: tabel update real-time (WebSocket)
✅ Audit log load dalam <1 detik
✅ Config JSON editor: invalid JSON → error inline
```

---

### FF-WEB-002 — 3-Leg Activation Readiness Dashboard
**Assignee:** Frontend Engineer
**Estimasi:** 2 hari
**Priority:** P1
**Sprint:** 10 (setelah FF-WEB-001)

#### Subtask:

- [ ] Halaman `/admin/feature-flags/three-legs-readiness`
- [ ] Auto-refresh setiap 60 detik

**[Layout Dashboard]**
```
┌─────────────────────────────────────────────────────────────────┐
│ 🎯  3-LEG ACTIVATION READINESS                     [?] Help    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GATE UTAMA  ─────────────────────────────────────────────────  │
│                                                                 │
│  SLA 2-Kaki (4 Minggu Berturut)        Target: ≥93%            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ W1: 85.2% ████████████░░  W2: 86.1% ████████████░░      │  │
│  │ W3: 88.7% ████████████░░  W4: 89.1% █████████████░░     │  │
│  └──────────────────────────────────────────────────────────┘  │
│  Status: ❌ Belum memenuhi (butuh ≥93% di semua 4 minggu)      │
│                                                                 │
│  SUPPORTING CHECKLIST  ────────────────────────────────────── │
│                                                                 │
│  □ Kurir per zona (≥30)          ❌                            │
│    JAK-TIM: 28  JAK-BAR: 22  JAK-PST: 31  JAK-UTR: 19        │
│                                                                 │
│  □ Titik temu tervalidasi (≥5)   ❌  Saat ini: 4              │
│                                                                 │
│  □ Order harian rata-rata (≥200) ❌  Saat ini: 187/hari       │
│                                                                 │
│  ─────────────────────────────────────────────────────────── │
│  Estimasi siap: ~6 minggu lagi                                 │
│                                                                 │
│  [AKTIFKAN 3-KAKI]  ← 🔒 Disabled — belum semua terpenuhi     │
└─────────────────────────────────────────────────────────────────┘
```

- [ ] Progress bar animasi per metrik
- [ ] Tooltip per metrik: "Apa ini?" + "Cara memperbaiki"
- [ ] Tombol "Aktifkan 3-Kaki" disabled jika belum ready (disabled + tooltip alasan)
- [ ] Jika semua ready: tombol hijau + konfetti animasi kecil saat hover
- [ ] History chart: trend SLA 2-Kaki 8 minggu terakhir (line chart)
- [ ] Export readiness report ke PDF (untuk dokumentasi keputusan)

**Acceptance Criteria:**
```
✅ Data akurat vs DB (test dengan mock data known values)
✅ Auto-refresh 60 detik berjalan tanpa memory leak
✅ Tombol disable + tooltip informatif saat belum ready
✅ Export PDF berfungsi
✅ Responsive untuk layar 1440px dan 1280px
```

---

## SPRINT 12 — QA [BARU v1.1]

---

### FF-QA-001 — Feature Flag Testing
**Assignee:** QA Engineer
**Estimasi:** 3 hari
**Priority:** P0
**Sprint:** 12

#### Test Scenarios

**[Backend — Unit + Integration]**
- [ ] **Routing dengan P2P ON, 2-Kaki ON, 3-Kaki OFF:**
  - Jarak 10 km → P2P ✅
  - Jarak 20 km → 2-Kaki ✅
  - Jarak 30 km → error MSG_THREE_LEGS_UNAVAILABLE ✅

- [ ] **Routing dengan 2-Kaki OFF, 3-Kaki OFF:**
  - Jarak 20 km → error ✅
  - Jarak 10 km → P2P (tidak terpengaruh) ✅

- [ ] **Redis cache behavior:**
  - Toggle flag → DEL cache ✅
  - Routing engine gunakan cache lama max 60 detik ✅
  - Redis down → fallback ke DB ✅

- [ ] **Admin API authorization:**
  - ops_manager toggle → 403 ✅
  - super_admin tanpa 2FA → 403 ✅
  - super_admin dengan 2FA tapi reason <50 char → 400 ✅
  - super_admin aktifkan 3-Kaki tanpa checklist → 422 ✅

- [ ] **3-Leg checklist validation:**
  - SLA 89% (kurang) → reject ✅
  - SLA 94% tapi density <30 → reject ✅
  - Semua terpenuhi → accept ✅

- [ ] **Audit log immutability:**
  - Coba UPDATE feature_flag_logs → trigger error ✅
  - Coba DELETE feature_flag_logs → trigger error ✅

**[Mobile — UI Testing]**
- [ ] Customer app: mock API return MODEL_UNAVAILABLE → bottom sheet tampil ✅
- [ ] Customer app: analytics event tercatat saat rejection ✅
- [ ] Courier app: badge model tampil di order notification ✅

**[Web Admin — E2E Testing]**
- [ ] Toggle flag biasa (ops_manager) → 403 modal error ✅
- [ ] Toggle model_three_legs sebelum ready → checklist merah + tombol disabled ✅
- [ ] Toggle model_three_legs setelah semua ready → flow lengkap sukses ✅
- [ ] WebSocket update setelah toggle → tabel refresh tanpa reload ✅
- [ ] Audit log tampil setelah perubahan ✅

**[Performance Testing]**
- [ ] Flag read dari Redis: P95 < 5ms ✅
- [ ] Flag read dari DB (cache miss): P95 < 20ms ✅
- [ ] SelectModel() dengan flag check: P95 < 20ms ✅
- [ ] 100 order simultan dengan flag check → tidak ada race condition ✅

**[Security Testing]**
- [ ] Injection via config JSON field → sanitasi bekerja ✅
- [ ] TOTP bypass attempt → rate limit + lock ✅
- [ ] Akses endpoint tanpa JWT → 401 ✅
- [ ] Akses endpoint dengan JWT non-super_admin → 403 ✅

**Acceptance Criteria:**
```
✅ Semua 25+ test scenario lulus
✅ Tidak ada race condition pada concurrent flag reads
✅ Security: tidak ada privilege escalation
✅ Performance: flag read tidak menambah latency SignificantModel() >20ms
```

---

## RINGKASAN TASK BARU

| Task ID | Deskripsi | Sprint | Estimasi | Priority | Assignee |
|---|---|---|---|---|---|
| FF-DB-001 | Schema feature_flags + feature_flag_logs + seed | 1 | 2 hari | P0 | Backend Lead |
| FF-BACK-001 | Flag reader service + routing engine update | 3 | 3 hari | P0 | Backend (Go) |
| FF-BACK-002 | Admin API: toggle, config, readiness endpoint | 3 | 3 hari | P0 | Backend (Node) |
| FF-BACK-003 | Cache invalidation + broadcast + email alert | 3 | 1 hari | P1 | Backend (Node) |
| FF-MOB-001 | Flag-aware UI rejection handling (Customer App) | 5 | 2 hari | P1 | Mobile Eng 1 |
| FF-MOB-002 | Flag-aware order badge (Courier App) | 6 | 1 hari | P1 | Mobile Eng 2 |
| FF-WEB-001 | Feature Flag Management UI (Web Admin) | 10 | 3 hari | P0 | Frontend Eng |
| FF-WEB-002 | 3-Leg Readiness Dashboard (Web Admin) | 10 | 2 hari | P1 | Frontend Eng |
| FF-QA-001 | End-to-end testing semua feature flag scenarios | 12 | 3 hari | P0 | QA Engineer |
| **Total** | | | **20 hari** | | |

---

## DEPENDENCY BARU

```
FF-DB-001
    │
    ├──► FF-BACK-001 (routing engine butuh schema flag)
    │        │
    │        └──► ORDER-001 (order creation butuh flag-aware routing)
    │
    └──► FF-BACK-002 (admin API butuh schema flag + logs)
             │
             ├──► FF-BACK-003 (cache invalidation butuh toggle API)
             │
             └──► FF-WEB-001 (admin UI consume admin API)
                      │
                      └──► FF-WEB-002 (readiness dashboard pakai API yang sama)

FF-MOB-001 → depends on: ORDER-001 (pricing estimate API dengan error handling)
FF-MOB-002 → depends on: COUR-003 (order notification UI)
FF-QA-001  → depends on: SEMUA FF-* tasks selesai
```

---

## ESTIMASI TAMBAHAN KE TOTAL SPRINT POINTS

| Fase Asal | Story Points Asal | Tambahan FF | Total Baru |
|---|---|---|---|
| Fase 0 (Foundation) | 60 SP | — | 60 SP |
| Fase 1 (Core Backend) | 100 SP | +14 SP (FF-DB, FF-BACK-001,002,003) | 114 SP |
| Fase 2 (Mobile MVP) | 90 SP | +6 SP (FF-MOB-001, FF-MOB-002) | 96 SP |
| Fase 3 (Advanced) | 50 SP | — | 50 SP |
| Fase 4 (Admin Dashboard) | 60 SP | +10 SP (FF-WEB-001, FF-WEB-002) | 70 SP |
| Fase 5 (QA) | 50 SP | +8 SP (FF-QA-001) | 58 SP |
| **Total** | **410 SP** | **+38 SP** | **448 SP** |

Dengan 7 engineer aktif, penambahan **38 SP ≈ 2–3 hari kerja ekstra** tersebar di 6 bulan — dampak ke timeline sangat minimal (<2%).
