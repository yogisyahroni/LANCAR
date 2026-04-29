# ERD ADDENDUM v1.1 — Feature Flags Schema
## Platform Logistik Hyperlocal Relay
### Update: 29 April 2026 | Terintegrasi ke ERD v1.0

> **Catatan:** Dokumen ini merevisi dan memperluas definisi tabel `feature_flags` di ERD v1.0,
> serta menambahkan tabel baru `feature_flag_logs` dan query patterns terkait.

---

## 1. REVISI TABEL: feature_flags

### Skema Lengkap (Menggantikan versi di ERD v1.0)

```sql
CREATE TABLE feature_flags (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key           VARCHAR(100) UNIQUE NOT NULL,
    is_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    config        JSONB,
    description   TEXT NOT NULL,
    category      VARCHAR(50) NOT NULL DEFAULT 'general',
    -- 'model'     = model pengiriman (p2p, two_legs, three_legs)
    -- 'pricing'   = dynamic pricing factors
    -- 'feature'   = fitur produk (scanning, chat, dll)
    -- 'system'    = config sistem internal
    require_checklist BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE = tidak bisa di-toggle tanpa checklist konfirmasi (khusus 3-Kaki)
    updated_by    UUID REFERENCES users(id),
    updated_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_feature_flags_key ON feature_flags(key);
CREATE INDEX idx_feature_flags_category ON feature_flags(category);
CREATE INDEX idx_feature_flags_enabled ON feature_flags(is_enabled);

-- RLS: Hanya super_admin yang bisa UPDATE/DELETE
-- (Enforce di application layer + database policy)
```

### Kolom Detail

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | UUID | PK | uuid_generate_v4() |
| `key` | VARCHAR(100) | UNIQUE, NOT NULL | Identifier unik. Format: `category_name` |
| `is_enabled` | BOOLEAN | NOT NULL, DEFAULT FALSE | Status flag ON/OFF |
| `config` | JSONB | — | Konfigurasi detail per flag (lihat contoh di bawah) |
| `description` | TEXT | NOT NULL | Deskripsi fungsi flag untuk admin |
| `category` | VARCHAR(50) | NOT NULL | `model` / `pricing` / `feature` / `system` |
| `require_checklist` | BOOLEAN | DEFAULT FALSE | Jika TRUE, toggle butuh konfirmasi checklist |
| `updated_by` | UUID | FK → users.id | Super admin yang terakhir mengubah |
| `updated_at` | TIMESTAMPTZ | — | Kapan terakhir diubah |
| `created_at` | TIMESTAMPTZ | NOT NULL | Kapan flag dibuat |

---

## 2. TABEL BARU: feature_flag_logs

Tabel ini menyimpan **seluruh riwayat perubahan** setiap feature flag — immutable audit trail.

```sql
CREATE TABLE feature_flag_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flag_id         UUID NOT NULL REFERENCES feature_flags(id),
    flag_key        VARCHAR(100) NOT NULL,
    changed_by      UUID NOT NULL REFERENCES users(id),
    -- Snapshot perubahan
    before_enabled  BOOLEAN NOT NULL,
    after_enabled   BOOLEAN NOT NULL,
    before_config   JSONB,
    after_config    JSONB,
    -- Konteks perubahan
    change_reason   TEXT NOT NULL,        -- Wajib diisi admin (min 50 karakter)
    checklist_data  JSONB,                -- Snapshot checklist saat aktivasi 3-Kaki
    ip_address      VARCHAR(50),
    user_agent      TEXT,
    totp_verified   BOOLEAN DEFAULT FALSE,-- Apakah 2FA diverifikasi saat perubahan
    -- Timestamps
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ff_logs_flag    ON feature_flag_logs(flag_id);
CREATE INDEX idx_ff_logs_changed ON feature_flag_logs(changed_at DESC);
CREATE INDEX idx_ff_logs_by      ON feature_flag_logs(changed_by);

-- Tabel ini TIDAK BOLEH di-UPDATE atau DELETE (immutable audit)
-- Enforce via application layer + DB trigger
CREATE OR REPLACE FUNCTION prevent_ff_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'feature_flag_logs is immutable — no UPDATE or DELETE allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ff_log_immutable
    BEFORE UPDATE OR DELETE ON feature_flag_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_ff_log_mutation();
```

### Kolom Detail

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID PK | Identifier log entry |
| `flag_id` | UUID FK | Referensi ke feature_flags.id |
| `flag_key` | VARCHAR | Disimpan juga sebagai snapshot (tidak hanya FK) |
| `changed_by` | UUID FK | Super admin yang melakukan perubahan |
| `before_enabled` | BOOLEAN | Status sebelum perubahan |
| `after_enabled` | BOOLEAN | Status setelah perubahan |
| `before_config` | JSONB | Config JSON sebelum perubahan |
| `after_config` | JSONB | Config JSON setelah perubahan |
| `change_reason` | TEXT | Alasan perubahan (mandatory, min 50 karakter) |
| `checklist_data` | JSONB | Snapshot nilai checklist 3-Leg Framework (jika relevan) |
| `ip_address` | VARCHAR | IP admin saat aksi |
| `totp_verified` | BOOLEAN | Apakah 2FA sudah diverifikasi di session ini |
| `changed_at` | TIMESTAMPTZ | Timestamp perubahan (UTC) |

---

## 3. SEED DATA: Semua Feature Flags Default

```sql
-- ════════════════════════════════════════════════════════════════
-- SEED: feature_flags (Data awal saat deployment pertama)
-- ════════════════════════════════════════════════════════════════

INSERT INTO feature_flags
    (key, is_enabled, config, description, category, require_checklist)
VALUES

-- ─── MODEL FLAGS ─────────────────────────────────────────────────
(
    'model_p2p',
    TRUE,
    '{
        "max_distance_km": 15,
        "active_zones": ["JAK-TIM","JAK-BAR","JAK-PST","JAK-UTR","JAK-SEL"],
        "rollout_pct": 100,
        "fallback_if_disabled": "reject_with_message",
        "rejection_message_id": "MSG_P2P_UNAVAILABLE"
    }',
    'Model Point-to-Point: 1 kurir pickup sampai delivery (<15 km). Model utama pilot dengan margin 36.4%.',
    'model',
    FALSE
),
(
    'model_two_legs',
    TRUE,
    '{
        "max_distance_km": 25,
        "active_zones": ["JAK-TIM","JAK-BAR","JAK-PST","JAK-UTR","JAK-SEL"],
        "min_courier_density_per_zone": 10,
        "rollout_pct": 100,
        "fallback_if_disabled": "reject_with_message",
        "rejection_message_id": "MSG_TWO_LEGS_UNAVAILABLE"
    }',
    'Model Transfer 2-Kaki: 2 kurir untuk rute menengah (15-25 km). Aktif sejak pilot. Margin 20.3%.',
    'model',
    FALSE
),
(
    'model_three_legs',
    FALSE,     -- ← NONAKTIF DEFAULT
    '{
        "max_distance_km": 50,
        "active_zones": [],
        "min_courier_density_per_zone": 30,
        "activation_trigger": "manual_super_admin_only",
        "rollout_pct": 0,
        "fallback_if_disabled": "reject_with_message",
        "rejection_message_id": "MSG_THREE_LEGS_UNAVAILABLE",
        "activation_checklist": {
            "sla_two_legs_pct_min": 93,
            "sla_two_legs_weeks_min": 4,
            "courier_density_min": 30,
            "meeting_points_validated_min": 5,
            "daily_orders_min": 200
        }
    }',
    'Model Relay 3-Kaki: 3 kurir untuk rute panjang (>25 km). NONAKTIF — aktifkan hanya setelah 3-Leg Activation Framework terpenuhi (SLA 2-Kaki ≥93% selama 4 minggu, dll).',
    'model',
    TRUE       -- ← Butuh konfirmasi checklist sebelum bisa di-ON
),

-- ─── DYNAMIC PRICING FLAGS ────────────────────────────────────────
(
    'dynamic_pricing_peak_hour',
    TRUE,
    '{
        "ranges": [
            {"start": "07:00", "end": "09:00", "multiplier": 0.20},
            {"start": "16:00", "end": "19:00", "multiplier": 0.20}
        ],
        "timezone": "Asia/Jakarta"
    }',
    'Surge pricing jam sibuk pagi (07-09) dan sore (16-19). Multiplier +20%.',
    'pricing',
    FALSE
),
(
    'dynamic_pricing_weather',
    TRUE,
    '{
        "source_primary": "bmkg",
        "source_fallback": "openmeteo",
        "poll_interval_minutes": 15,
        "levels": [
            {"intensity_min": 2, "intensity_max": 2, "multiplier": 0.15, "label": "hujan_sedang"},
            {"intensity_min": 3, "intensity_max": 5, "multiplier": 0.25, "label": "hujan_lebat"}
        ]
    }',
    'Surge pricing cuaca hujan berdasarkan data BMKG per zona. Multiplier +15% (sedang) atau +25% (lebat).',
    'pricing',
    FALSE
),
(
    'dynamic_pricing_demand_supply',
    TRUE,
    '{
        "check_interval_minutes": 2,
        "surge_threshold_ratio": 0.5,
        "surge_multiplier": 0.10,
        "discount_threshold_ratio": 2.0,
        "discount_multiplier": -0.05
    }',
    'Surge/diskon berdasarkan rasio kurir tersedia vs order aktif per zona.',
    'pricing',
    FALSE
),

-- ─── FEATURE FLAGS ────────────────────────────────────────────────
(
    'volumetric_scanning',
    TRUE,
    '{
        "min_confidence_auto_accept": 0.85,
        "min_confidence_warn": 0.70,
        "max_dimension_cm": 100,
        "reference_object": "standard_card_85x54mm",
        "ml_model_version": "v1.0.0"
    }',
    'Fitur scan dimensi paket via kamera ML. Hitung berat volumetrik P×L×T÷5000.',
    'feature',
    FALSE
),
(
    'arcore_scanning',
    FALSE,
    '{
        "min_android_version": "9",
        "requires_arcore": true,
        "ios_requires_lidar": true,
        "fallback_to_ml": true
    }',
    'Enhancement ARCore/LiDAR untuk akurasi scan ±1-2cm. NONAKTIF — aktifkan di Fase 2 setelah evaluasi.',
    'feature',
    FALSE
),
(
    'package_insurance',
    TRUE,
    '{"premium_pct": 0.2, "max_insured_value_idr": 10000000}',
    'Asuransi barang opsional. Premi 0.2% dari nilai barang.',
    'feature',
    FALSE
),
(
    'in_app_chat',
    TRUE,
    '{"max_message_length": 500, "media_allowed": false}',
    'Chat in-app antara customer dan kurir aktif per order (masked number).',
    'feature',
    FALSE
),
(
    'loyalty_program',
    TRUE,
    '{
        "tiers": [
            {"name":"bronze", "min_orders": 0,  "discount_pct": 0},
            {"name":"silver", "min_orders": 10, "discount_pct": 5},
            {"name":"gold",   "min_orders": 30, "discount_pct": 10}
        ]
    }',
    'Program loyalty tier Bronze/Silver/Gold dengan diskon.',
    'feature',
    FALSE
),
(
    'referral_program',
    TRUE,
    '{"reward_idr": 20000, "min_orders_to_qualify": 1}',
    'Program referral customer. Reward Rp20.000 setelah referred user selesai 1 order.',
    'feature',
    FALSE
),
(
    'scheduled_delivery',
    FALSE,
    '{"max_days_advance": 7, "slot_interval_hours": 1}',
    'Pengiriman terjadwal (max 7 hari ke depan). NONAKTIF — aktifkan di Fase 2.',
    'feature',
    FALSE
),
(
    'multi_zone_courier',
    TRUE,
    '{"max_zones_per_courier": 2}',
    'Kurir bisa di-assign ke maksimal 2 zona kerja.',
    'feature',
    FALSE
),
(
    'courier_leaderboard',
    TRUE,
    '{"update_interval_hours": 24, "top_n": 10}',
    'Leaderboard ranking kurir per zona. Update harian.',
    'feature',
    FALSE
);
```

---

## 4. QUERY PATTERNS PENTING

### 4.1 Baca Flag dengan Cache (Routing Engine — Go)

```go
// routing_service/flag_reader.go

const flagCacheTTL = 60 * time.Second

func GetFlag(ctx context.Context, key string) (*FeatureFlag, error) {
    // 1. Cek Redis cache dulu
    cacheKey := fmt.Sprintf("flag:%s", key)
    cached, err := redis.Get(ctx, cacheKey)
    if err == nil {
        var flag FeatureFlag
        json.Unmarshal([]byte(cached), &flag)
        return &flag, nil
    }

    // 2. Cache miss → query database
    var flag FeatureFlag
    err = db.QueryRowContext(ctx,
        `SELECT id, key, is_enabled, config, require_checklist
         FROM feature_flags WHERE key = $1`, key,
    ).Scan(&flag.ID, &flag.Key, &flag.IsEnabled, &flag.Config, &flag.RequireChecklist)
    if err != nil {
        return nil, err
    }

    // 3. Simpan ke Redis dengan TTL 60 detik
    data, _ := json.Marshal(flag)
    redis.Set(ctx, cacheKey, data, flagCacheTTL)

    return &flag, nil
}
```

### 4.2 Routing Engine dengan Flag Check (Go)

```go
// routing_service/model_selector.go

func SelectModel(ctx context.Context, req OrderRequest) (ModelType, error) {
    // Baca semua flags paralel
    p2pFlag, twoFlag, threeFlag, err := readModelFlagsParallel(ctx)
    if err != nil {
        return "", fmt.Errorf("gagal baca feature flags: %w", err)
    }

    distKm   := calculateDistance(req.Pickup, req.Dropoff)
    pickupZone := detectZone(req.Pickup)
    dropoffZone := detectZone(req.Dropoff)

    switch {
    case distKm <= 15:
        if p2pFlag.IsEnabled && zoneActive(p2pFlag, pickupZone) {
            return ModelP2P, nil
        }
        return "", ErrModelUnavailable("P2P", "MSG_P2P_UNAVAILABLE")

    case distKm <= 25:
        if twoFlag.IsEnabled && zonesActive(twoFlag, pickupZone, dropoffZone) {
            return ModelTwoLegs, nil
        }
        // Fallback: coba 3-Kaki jika aktif (sangat jarang)
        if threeFlag.IsEnabled && zonesActive(threeFlag, pickupZone, dropoffZone) {
            return ModelThreeLegs, nil
        }
        return "", ErrModelUnavailable("2-Kaki", "MSG_TWO_LEGS_UNAVAILABLE")

    default: // distKm > 25
        if threeFlag.IsEnabled && zonesActive(threeFlag, pickupZone, dropoffZone) {
            return ModelThreeLegs, nil
        }
        return "", ErrModelUnavailable("3-Kaki", "MSG_THREE_LEGS_UNAVAILABLE")
    }
}
```

### 4.3 Update Flag oleh Super Admin (Node.js)

```typescript
// admin_service/feature_flag.service.ts

async function toggleFlag(
    adminId: string,
    flagKey: string,
    newEnabled: boolean,
    reason: string,
    checklistData?: ThreeLegChecklist,
    totpCode?: string
): Promise<void> {

    // 1. Validasi role super_admin
    const admin = await getUser(adminId);
    if (admin.role !== 'super_admin') throw new ForbiddenError();

    // 2. Validasi 2FA untuk perubahan sensitif
    if (!await verifyTOTP(adminId, totpCode)) throw new TwoFAError();

    // 3. Baca flag saat ini
    const flag = await db.featureFlags.findOne({ key: flagKey });

    // 4. Jika require_checklist = true dan mau di-ON → validasi checklist
    if (flag.require_checklist && newEnabled) {
        await validateActivationChecklist(flagKey, checklistData);
    }

    // 5. Validasi reason (min 50 karakter)
    if (reason.length < 50) throw new ValidationError('Alasan minimal 50 karakter');

    // 6. Simpan perubahan ke DB (transaction)
    await db.transaction(async (trx) => {
        // Update flag
        await trx.featureFlags.update(
            { key: flagKey },
            { is_enabled: newEnabled, updated_by: adminId, updated_at: new Date() }
        );

        // Simpan audit log (immutable)
        await trx.featureFlagLogs.create({
            flag_id:       flag.id,
            flag_key:      flagKey,
            changed_by:    adminId,
            before_enabled: flag.is_enabled,
            after_enabled:  newEnabled,
            before_config:  flag.config,
            after_config:   flag.config,  // config tidak berubah, hanya status
            change_reason:  reason,
            checklist_data: checklistData || null,
            ip_address:     getRequestIP(),
            totp_verified:  true,
            changed_at:     new Date(),
        });
    });

    // 7. Invalidate Redis cache (agar perubahan terasa ≤60 detik)
    await redis.del(`flag:${flagKey}`);

    // 8. Notifikasi semua super_admin + ops channel
    await notifyFlagChange(flagKey, flag.is_enabled, newEnabled, adminId, reason);
}
```

### 4.4 Validasi 3-Leg Activation Checklist

```typescript
// admin_service/three_leg_checklist.service.ts

interface ThreeLegChecklist {
    sla_two_legs_4weeks_pct: number;     // Harus ≥93%
    courier_density_per_zone: number;    // Harus ≥30
    validated_meeting_points: number;    // Harus ≥5
    daily_orders_avg: number;            // Harus ≥200
    admin_manual_confirm: boolean;       // Harus TRUE (centang manual)
}

async function validateActivationChecklist(
    flagKey: string,
    data: ThreeLegChecklist
): Promise<void> {
    if (flagKey !== 'model_three_legs') return; // hanya untuk 3-Kaki

    const errors: string[] = [];

    if (data.sla_two_legs_4weeks_pct < 93)
        errors.push(`SLA 2-Kaki harus ≥93% (saat ini: ${data.sla_two_legs_4weeks_pct}%)`);

    if (data.courier_density_per_zone < 30)
        errors.push(`Kurir per zona harus ≥30 (saat ini: ${data.courier_density_per_zone})`);

    if (data.validated_meeting_points < 5)
        errors.push(`Titik temu tervalidasi harus ≥5 (saat ini: ${data.validated_meeting_points})`);

    if (data.daily_orders_avg < 200)
        errors.push(`Order harian harus ≥200 (saat ini: ${data.daily_orders_avg})`);

    if (!data.admin_manual_confirm)
        errors.push('Admin belum konfirmasi manual checklist');

    if (errors.length > 0) {
        throw new ChecklistNotMetError(errors);
    }
}
```

---

## 5. REDIS CACHE — TAMBAHAN UNTUK FEATURE FLAGS

```
# Feature flag cache (TTL 60 detik per flag)
GET  flag:{key}          → JSON: { is_enabled, config, require_checklist }
SET  flag:{key} {json}     EX 60

# Contoh:
GET  flag:model_p2p      → { "is_enabled": true, "config": {...} }
GET  flag:model_two_legs → { "is_enabled": true, "config": {...} }
GET  flag:model_three_legs → { "is_enabled": false, "config": {...} }

# Invalidasi manual saat super_admin update:
DEL  flag:model_three_legs   ← langsung terasa ≤60 detik kemudian
```

---

## 6. ERD DIAGRAM — RELASI BARU

```
feature_flags
    │ id (PK)
    │ key (UNIQUE)
    │ is_enabled
    │ config (JSONB)
    │ category
    │ require_checklist
    │ updated_by → users.id (FK)
    │ updated_at
    │ created_at
    │
    └──◄── feature_flag_logs (1:M)
               │ id (PK)
               │ flag_id → feature_flags.id (FK)
               │ flag_key
               │ changed_by → users.id (FK)
               │ before_enabled
               │ after_enabled
               │ before_config (JSONB)
               │ after_config (JSONB)
               │ change_reason
               │ checklist_data (JSONB)
               │ totp_verified
               │ changed_at
               └─ [IMMUTABLE — no UPDATE/DELETE]
```

---

## 7. CONTOH DATA: Snapshot Perubahan di feature_flag_logs

```json
// Contoh: Super Admin mengaktifkan model_three_legs setelah semua checklist terpenuhi
{
    "id": "uuid-xxx",
    "flag_id": "uuid-model-three-legs",
    "flag_key": "model_three_legs",
    "changed_by": "uuid-super-admin-andi",
    "before_enabled": false,
    "after_enabled": true,
    "before_config": { "active_zones": [], "rollout_pct": 0 },
    "after_config": {
        "active_zones": ["JAK-TIM", "JAK-BAR"],
        "rollout_pct": 100
    },
    "change_reason": "Semua kondisi 3-Leg Activation Framework telah terpenuhi. SLA 2-Kaki 94.2% selama 5 minggu berturut-turut. Kurir aktif JAK-TIM 35, JAK-BAR 32. 7 titik temu sudah tervalidasi lapangan. Rata-rata order 215/hari selama 2 minggu terakhir.",
    "checklist_data": {
        "sla_two_legs_4weeks_pct": 94.2,
        "courier_density_per_zone": 33,
        "validated_meeting_points": 7,
        "daily_orders_avg": 215,
        "admin_manual_confirm": true,
        "snapshot_date": "2026-10-15T09:00:00Z"
    },
    "ip_address": "10.0.0.5",
    "totp_verified": true,
    "changed_at": "2026-10-15T09:03:22Z"
}
```
