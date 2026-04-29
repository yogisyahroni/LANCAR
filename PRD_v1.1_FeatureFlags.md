# PRD ADDENDUM v1.1 — Feature Flags: Model Selection
## Platform Logistik Hyperlocal Relay
### Update: 29 April 2026 | Terintegrasi ke PRD v1.0

> **Catatan integrasi:** Bagian-bagian di bawah ini merupakan tambahan dan revisi terhadap PRD v1.0.
> Setiap bagian diberi label **[BARU]** atau **[REVISI]** beserta nomor seksi asal di PRD v1.0.

---

## REVISI SEKSI 3: MODEL BISNIS — FEATURE FLAGS INTEGRATION

### [REVISI] 3.0 Prinsip Baru: Model Delivery sebagai Feature Flag

Mulai PRD v1.1, **setiap model pengiriman (P2P, 2-Kaki, 3-Kaki) diperlakukan sebagai fitur yang bisa diaktifkan/dinonaktifkan secara independen oleh Super Admin** tanpa memerlukan deployment ulang aplikasi.

Keputusan ini didasarkan pada:
- **Fase Pilot (Bulan 1–3):** Hanya P2P yang aktif default — operasi paling sederhana dan margin tertinggi (36.4%)
- **Fase Early Traction (Bulan 4–9):** 2-Kaki diaktifkan setelah validasi lapangan
- **Fase Growth (Bulan 7–12+):** 3-Kaki diaktifkan hanya setelah **3-Leg Activation Framework** terpenuhi

```
STATUS AWAL PILOT (default):
┌─────────────────────┬──────────┬─────────────────────────────────┐
│ Feature Flag Key    │ Status   │ Keterangan                      │
├─────────────────────┼──────────┼─────────────────────────────────┤
│ model_p2p           │ ✅ ON    │ Aktif sejak hari pertama pilot  │
│ model_two_legs      │ ✅ ON    │ Aktif sejak hari pertama pilot  │
│ model_three_legs    │ ❌ OFF   │ Dinonaktifkan — aktifkan manual │
└─────────────────────┴──────────┴─────────────────────────────────┘
```

---

### [BARU] 3.1 Definisi Feature Flags per Model

#### Flag: `model_p2p`
```json
{
  "key": "model_p2p",
  "is_enabled": true,
  "config": {
    "max_distance_km": 15,
    "active_zones": ["JAK-TIM", "JAK-BAR", "JAK-PST", "JAK-UTR", "JAK-SEL"],
    "rollout_pct": 100,
    "fallback_if_disabled": "reject_with_message"
  },
  "description": "Model Point-to-Point: 1 kurir dari pickup ke delivery (<15 km). Model utama pilot.",
  "updated_by": "super_admin_id",
  "updated_at": "2026-04-29T00:00:00Z"
}
```

#### Flag: `model_two_legs`
```json
{
  "key": "model_two_legs",
  "is_enabled": true,
  "config": {
    "max_distance_km": 25,
    "active_zones": ["JAK-TIM", "JAK-BAR", "JAK-PST", "JAK-UTR", "JAK-SEL"],
    "min_courier_density_per_zone": 10,
    "rollout_pct": 100,
    "fallback_if_disabled": "reject_with_message"
  },
  "description": "Model Transfer 2-Kaki: 2 kurir untuk rute menengah (15–25 km). Aktif sejak pilot.",
  "updated_by": "super_admin_id",
  "updated_at": "2026-04-29T00:00:00Z"
}
```

#### Flag: `model_three_legs`
```json
{
  "key": "model_three_legs",
  "is_enabled": false,
  "config": {
    "max_distance_km": 50,
    "active_zones": [],
    "min_courier_density_per_zone": 30,
    "activation_trigger": "manual_super_admin_only",
    "rollout_pct": 0,
    "fallback_if_disabled": "reject_with_message",
    "rejection_message_id": "MSG_THREE_LEGS_UNAVAILABLE"
  },
  "description": "Model Relay 3-Kaki: 3 kurir untuk rute panjang (>25 km). NONAKTIF — aktifkan hanya setelah 3-Leg Activation Framework terpenuhi.",
  "updated_by": null,
  "updated_at": null
}
```

---

### [BARU] 3.2 Three-Leg Activation Framework

3-Kaki **hanya boleh diaktifkan oleh Super Admin** setelah seluruh kondisi berikut terpenuhi:

#### Gate Utama (Wajib — tidak bisa dikompromikan)

| Gate | Threshold | Cara Ukur |
|---|---|---|
| **SLA compliance 2-Kaki** | **≥93% selama 4 minggu berturut-turut** | Dashboard SLA admin |

> Ini adalah *lagging indicator* paling jujur — membuktikan fondasi operasional sudah matang. SLA 2-Kaki ≥93% konsisten berarti kurir hafal zona, koordinasi berjalan, GPS+handover stabil, CS terlatih, dan tim ops mampu monitor multi-leg order. Semua ini prasyarat untuk 3-Kaki yang lebih kompleks.

#### Supporting Checklist (Semua harus ✅ sebelum Super Admin bisa aktifkan)

| # | Kondisi | Threshold |
|---|---|---|
| 1 | Kurir aktif per zona | ≥30 kurir per zona yang akan aktifkan 3-Kaki |
| 2 | Titik temu tervalidasi lapangan | ≥5 titik temu per pair zona (bukan hanya di-input di peta) |
| 3 | Volume order harian | ≥200 order/hari (network effect sudah terasa) |

#### Estimasi Kapan Tercapai

```
Bulan 1–6:  Fokus P2P + 2-Kaki. Build density kurir per zona.
Bulan 7–9:  Evaluasi SLA compliance 2-Kaki (4 minggu window).
Bulan 9–10: Jika gate + checklist hijau → Super Admin aktifkan
            model_three_legs per zona satu-per-satu.
Bulan 10+:  Rollout bertahap ke semua zona.
```

---

### [REVISI] 3.3 Algoritma Pemilihan Model — Dengan Feature Flag Check

**Algoritma lama (PRD v1.0):**
```
IF jarak < 15 km  → P2P
IF jarak 15-25 km → 2-Kaki atau 3-Kaki
IF jarak > 25 km  → 3-Kaki
```

**Algoritma baru (PRD v1.1) — dengan feature flag:**
```
═══════════════════════════════════════════════════════════════
FUNGSI: pilih_model(pickup_coords, dropoff_coords, user_id)
═══════════════════════════════════════════════════════════════

LANGKAH 1: Hitung jarak & zona
  jarak_km        = hitung_jarak(pickup, dropoff)          [Google Maps]
  zona_pickup     = deteksi_zona(pickup)                   [PostGIS]
  zona_dropoff    = deteksi_zona(dropoff)                  [PostGIS]
  zona_adjacent   = cek_adjacency(zona_pickup, zona_dropoff)

LANGKAH 2: Baca feature flags dari Redis (TTL 60 detik)
  flag_p2p        = get_flag("model_p2p")
  flag_two_legs   = get_flag("model_two_legs")
  flag_three_legs = get_flag("model_three_legs")

LANGKAH 3: Validasi zona aktif per flag
  p2p_zone_ok     = zona_pickup IN flag_p2p.config.active_zones
  two_zone_ok     = zona_pickup IN flag_two_legs.config.active_zones
                    AND zona_dropoff IN flag_two_legs.config.active_zones
  three_zone_ok   = zona_pickup IN flag_three_legs.config.active_zones
                    AND zona_dropoff IN flag_three_legs.config.active_zones

LANGKAH 4: Seleksi model (urutan prioritas)
  IF jarak_km <= 15:
    IF flag_p2p.is_enabled AND p2p_zone_ok:
      RETURN MODEL_P2P
    ELSE:
      RETURN ERROR("P2P tidak tersedia di zona ini")

  ELSE IF jarak_km <= 25:
    IF flag_two_legs.is_enabled AND two_zone_ok:
      RETURN MODEL_TWO_LEGS
    ELSE IF flag_three_legs.is_enabled AND three_zone_ok:
      RETURN MODEL_THREE_LEGS              ← fallback ke 3-Kaki jika 2-Kaki off
    ELSE:
      RETURN ERROR("Layanan belum tersedia untuk rute ini")

  ELSE (jarak_km > 25):
    IF flag_three_legs.is_enabled AND three_zone_ok:
      RETURN MODEL_THREE_LEGS
    ELSE:
      RETURN ERROR_WITH_MESSAGE(           ← 3-Kaki off = rute >25km ditolak
        flag_three_legs.config.rejection_message_id
      )

LANGKAH 5: Terapkan dynamic pricing ke model terpilih
  RETURN apply_dynamic_pricing(model, harga_dasar, kondisi_realtime)

═══════════════════════════════════════════════════════════════
```

#### Pesan Penolakan untuk Customer App

| Skenario | Pesan yang Ditampilkan |
|---|---|
| Rute >25 km, 3-Kaki nonaktif | "Maaf, rute ini belum tersedia saat ini. Kami sedang memperluas jangkauan layanan kami. Coba lagi dalam beberapa minggu!" |
| Zona belum aktif | "Layanan belum tersedia di area ini. Kami akan segera hadir!" |
| P2P nonaktif (sangat jarang) | "Layanan sedang dalam pemeliharaan. Coba beberapa menit lagi." |

---

## REVISI SEKSI 4: WEB ADMIN DASHBOARD — FEATURE FLAG MANAGEMENT

### [BARU] FR-WEB-080: Feature Flag Management (Super Admin Only)

**FR-WEB-080:** Halaman Feature Flags — hanya dapat diakses oleh role `super_admin`.

**FR-WEB-081:** Tampilan daftar semua feature flags dengan:
- Status toggle ON/OFF (dengan konfirmasi modal sebelum ubah)
- Config JSON viewer/editor dengan syntax highlighting
- Last updated by (nama + waktu)
- Tombol "Audit History" per flag

**FR-WEB-082:** Aktivasi `model_three_legs` memiliki **double confirmation**:
```
Langkah 1: Admin klik toggle ON
Langkah 2: Modal muncul — tampilkan 3-Leg Activation Checklist:
           □ SLA 2-Kaki ≥93% (4 minggu) → [LIHAT DATA]
           □ Kurir aktif ≥30/zona       → [LIHAT DATA]
           □ Titik temu ≥5 tervalidasi  → [LIHAT DATA]
           □ Order ≥200/hari            → [LIHAT DATA]
Langkah 3: Admin harus centang manual: "Saya konfirmasi semua kondisi terpenuhi"
Langkah 4: Input catatan alasan aktivasi (mandatory, min 50 karakter)
Langkah 5: Masukkan password + TOTP 2FA code
Langkah 6: Submit → simpan ke admin_logs + aktifkan flag
```

**FR-WEB-083:** Perubahan feature flag **tidak bisa di-undo otomatis** — hanya bisa di-toggle ulang secara manual dengan konfirmasi yang sama.

**FR-WEB-084:** Setiap perubahan flag dikirimkan notifikasi ke:
- Semua `super_admin` aktif via email + in-app
- Slack/Discord ops channel
- Dicatat lengkap di `admin_logs` (before_state + after_state)

**FR-WEB-085:** Config editor per flag:
- Edit `active_zones` (multi-select checkbox dari daftar zona)
- Edit `rollout_pct` (slider 0–100% untuk gradual rollout)
- Edit `min_courier_density_per_zone` (number input)
- Preview: "Dengan config ini, berapa % order yang akan terdampak?" (simulasi)

**FR-WEB-086:** Dashboard 3-Leg Readiness — halaman khusus yang menampilkan:

```
┌─────────────────────────────────────────────────────────┐
│         3-LEG ACTIVATION READINESS DASHBOARD            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ GATE UTAMA                                              │
│ SLA 2-Kaki (4 minggu rolling)                          │
│ ████████████████░░░░  87.3%  [TARGET: 93%]             │
│ Minggu 1: 85.2% | Minggu 2: 86.1% | Minggu 3: 88.7%   │
│                              Minggu 4: 89.1%           │
│ Status: ❌ BELUM MEMENUHI                               │
│                                                         │
│ SUPPORTING CHECKLIST                                    │
│ □ Kurir aktif/zona: JAK-TIM 28 | JAK-BAR 22 [MIN: 30]│
│ □ Titik temu valid: 4/5 tervalidasi lapangan           │
│ □ Order/hari: 187 [TARGET: 200]                        │
│                                                         │
│ ESTIMASI SIAP: ~6 minggu lagi                          │
│                                                         │
│ [AKTIFKAN 3-KAKI]  ← Tombol disabled sampai semua ✅   │
└─────────────────────────────────────────────────────────┘
```

---

## REVISI SEKSI 9: RELAY & SLA ENGINE

### [REVISI] 9.1 Model Selection — Integrasi Feature Flag

Algoritma pemilihan model di routing-service sekarang **selalu membaca feature flags dari Redis sebelum memilih model**. Cache flag di Redis di-refresh setiap 60 detik dari database. Perubahan flag oleh Super Admin akan terasa di sistem maksimal **60 detik** setelah disimpan (bukan real-time instantaneous, tapi cukup cepat untuk operasional).

**FR-RELAY-005 [BARU]:** Jika flag model berubah saat order sedang dalam proses, order yang sedang berjalan **tidak terpengaruh** — flag hanya berlaku untuk order baru yang masuk setelah perubahan.

**FR-RELAY-006 [BARU]:** Jika 2-Kaki dinonaktifkan sementara (misal: gangguan operasional), sistem otomatis:
1. Stop terima order 2-Kaki baru
2. Tampilkan pesan ke customer: "Layanan rute menengah sedang dalam pemeliharaan"
3. Order 2-Kaki yang sedang berjalan tetap dilanjutkan sampai selesai
4. Alert ke admin + log ke `admin_logs`

---

## REVISI SEKSI 8: DYNAMIC PRICING

### [BARU] FR-PRICE-020: Feature Flag Guard di Pricing Engine

Pricing engine harus **validasi flag aktif sebelum hitung harga**:

```
FUNGSI: hitung_harga(order_request)
  model = pilih_model(...)           ← sudah include flag check
  IF model == ERROR:
    RETURN error_response             ← tidak sampai ke pricing
  
  harga = pricing_engine(model, ...)
  RETURN harga
```

Tidak ada perubahan formula pricing — flag hanya mempengaruhi apakah model tersedia atau tidak, bukan nilai harganya.

---

## REVISI SEKSI 12: SECURITY

### [BARU] FR-SEC-020: Feature Flag Access Control

**FR-SEC-020:** Endpoint feature flag management hanya bisa diakses dengan:
- Role: `super_admin` (tidak cukup `ops_manager` atau `finance`)
- 2FA aktif dan sudah terverifikasi di session saat ini
- IP address tercatat di whitelist VPN (opsional, untuk keamanan ekstra)

**FR-SEC-021:** Rate limiting khusus untuk endpoint feature flag:
- Max 10 perubahan flag per jam per super_admin
- Jika melebihi: akun di-lock sementara + alert ke super_admin lain

**FR-SEC-022:** Feature flag values **tidak boleh di-cache di client** (mobile app atau web admin). Selalu fetch dari server. Ini mencegah stale state jika flag berubah.

---

## MATRIKS AKSES FEATURE FLAGS (RBAC)

| Role | Lihat Flags | Edit Config | Toggle ON/OFF | Aktifkan 3-Kaki |
|---|---|---|---|---|
| `super_admin` | ✅ | ✅ | ✅ | ✅ (dengan 2FA + checklist) |
| `ops_manager` | ✅ | ❌ | ❌ | ❌ |
| `finance` | ❌ | ❌ | ❌ | ❌ |
| `cs_agent` | ❌ | ❌ | ❌ | ❌ |
| `zone_manager` | ✅ (zona sendiri) | ❌ | ❌ | ❌ |
| `courier` | ❌ | ❌ | ❌ | ❌ |
| `customer` | ❌ | ❌ | ❌ | ❌ |

---

## DAFTAR SEMUA FEATURE FLAGS SISTEM

| Key | Default | Akses Toggle | Keterangan |
|---|---|---|---|
| `model_p2p` | ✅ ON | Super Admin | Model P2P (<15 km) |
| `model_two_legs` | ✅ ON | Super Admin | Model 2-Kaki (15–25 km) |
| `model_three_legs` | ❌ OFF | Super Admin (+ checklist) | Model 3-Kaki (>25 km) — pilot nonaktif |
| `dynamic_pricing_peak_hour` | ✅ ON | Super Admin | Surge jam sibuk |
| `dynamic_pricing_weather` | ✅ ON | Super Admin | Surge cuaca hujan |
| `dynamic_pricing_demand` | ✅ ON | Super Admin | Surge demand/supply |
| `volumetric_scanning` | ✅ ON | Super Admin | Fitur scan dimensi via kamera |
| `arcore_scanning` | ❌ OFF | Super Admin | ARCore/LiDAR enhancement (fase 2) |
| `package_insurance` | ✅ ON | Super Admin | Asuransi barang opsional |
| `in_app_chat` | ✅ ON | Super Admin | Chat kurir-customer |
| `loyalty_program` | ✅ ON | Super Admin | Tier Bronze/Silver/Gold |
| `referral_program` | ✅ ON | Super Admin | Program referral + reward |
| `scheduled_delivery` | ❌ OFF | Super Admin | Pengiriman terjadwal (fase 2) |
| `multi_zone_courier` | ✅ ON | Super Admin | Kurir bisa assign 2 zona |
| `courier_leaderboard` | ✅ ON | Super Admin | Leaderboard zona kurir |

---

## GLOSSARY TAMBAHAN

| Term | Definisi |
|---|---|
| Feature Flag | Switch ON/OFF untuk fitur sistem tanpa deployment ulang. Disimpan di DB dan di-cache Redis. |
| Gate Utama | Kondisi mandatory yang harus terpenuhi sebelum fitur bisa diaktifkan. |
| Supporting Checklist | Kondisi pendukung yang melengkapi gate utama. Semua harus ✅. |
| 3-Leg Activation Framework | Sistem terstruktur untuk memutuskan kapan 3-Kaki boleh diaktifkan. |
| Rollout Pct | Persentase traffic yang mendapat fitur baru (0–100%). Untuk gradual rollout. |
| Double Confirmation | Mekanisme konfirmasi 2 langkah untuk perubahan kritis (3-Kaki). |
| Rejection Message | Pesan yang ditampilkan ke customer jika model tidak tersedia. |
