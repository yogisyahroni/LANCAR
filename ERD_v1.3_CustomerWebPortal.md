# ERD v1.3 — Customer Web Portal

## Tambahan Tabel & Schema untuk Web Portal

### Update: 29 April 2026

---

## TABEL BARU v1.3

### 1. web_sessions — Session management web portal

```sql
CREATE TABLE web_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    session_token   VARCHAR(255) UNIQUE NOT NULL,
    -- Token yang disimpan di httpOnly cookie
    device_info     JSONB,
    -- { browser, os, device_type, user_agent }
    ip_address      VARCHAR(50),
    is_remember_me  BOOLEAN DEFAULT FALSE,
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    -- 8 jam jika normal, 30 hari jika remember_me
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_web_sessions_user    ON web_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_web_sessions_token   ON web_sessions(session_token);
CREATE INDEX idx_web_sessions_expires ON web_sessions(expires_at) WHERE revoked_at IS NULL;
-- Cleanup job: DELETE expired + revoked sessions older than 7 days
```

---

### 2. web_push_subscriptions — Browser push notification

```sql
CREATE TABLE web_push_subscriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    endpoint        TEXT NOT NULL,
    -- Push service URL (FCM, APNS, Mozilla, dll)
    p256dh_key      TEXT NOT NULL,
    -- Public key dari browser subscription
    auth_key        TEXT NOT NULL,
    -- Auth secret dari browser subscription
    browser         VARCHAR(50),
    -- chrome | firefox | safari | edge
    is_active       BOOLEAN DEFAULT TRUE,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, endpoint)
);

CREATE INDEX idx_push_subs_user ON web_push_subscriptions(user_id) WHERE is_active = TRUE;
```

---

### 3. bulk_downloads — Tracking bulk ZIP download requests

```sql
CREATE TABLE bulk_downloads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requested_by    UUID NOT NULL REFERENCES users(id),
    download_type   VARCHAR(30) NOT NULL,
    -- 'resi_zip' | 'orders_export' | 'report_pdf' | 'report_excel'
    filter_params   JSONB,
    -- { order_ids: [...], date_from: ..., date_to: ... }
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending | processing | ready | expired | failed
    file_url        TEXT,
    -- URL S3 setelah file ready
    file_size_bytes INT,
    item_count      INT,
    -- Jumlah resi/order dalam ZIP
    error_message   TEXT,
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ready_at        TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    -- File di S3 di-expire setelah 24 jam
    downloaded_at   TIMESTAMPTZ
);

CREATE INDEX idx_bulk_dl_user    ON bulk_downloads(requested_by);
CREATE INDEX idx_bulk_dl_status  ON bulk_downloads(status);
CREATE INDEX idx_bulk_dl_expires ON bulk_downloads(expires_at) WHERE status = 'ready';
```

---

### 4. customer_analytics_cache — Cache hasil kalkulasi analytics UMKM

```sql
CREATE TABLE customer_analytics_cache (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES users(id),
    period_type     VARCHAR(20) NOT NULL,
    -- 'monthly' | 'quarterly' | 'ytd' | 'custom'
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    analytics_data  JSONB NOT NULL,
    -- {
    --   total_orders, completed_orders, failed_orders,
    --   total_spent_idr, avg_order_value_idr,
    --   ontime_rate_pct, avg_weight_kg, avg_distance_km,
    --   model_distribution: {p2p: 68, two_legs: 32},
    --   top_destinations: [{zone, count}],
    --   daily_series: [{date, count, amount}]
    -- }
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    -- Cache 1 jam untuk data bulan ini, 24 jam untuk bulan lalu
    UNIQUE(customer_id, period_type, period_start, period_end)
);

CREATE INDEX idx_analytics_cache_customer ON customer_analytics_cache(customer_id);
CREATE INDEX idx_analytics_cache_expires  ON customer_analytics_cache(expires_at);
```

---

### 5. landing_page_leads — (Sudah ada di v1.2, diperluas)

```sql
-- Tambahkan kolom ke tabel existing landing_page_leads:
ALTER TABLE landing_page_leads
    ADD COLUMN lead_type VARCHAR(20) DEFAULT 'customer',
    -- 'customer' | 'courier' | 'umkm' | 'investor'
    ADD COLUMN status VARCHAR(20) DEFAULT 'new',
    -- 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected'
    ADD COLUMN contacted_at TIMESTAMPTZ,
    ADD COLUMN contacted_by UUID REFERENCES users(id),
    -- Admin yang follow-up
    ADD COLUMN notes TEXT;
    -- Catatan internal admin

CREATE INDEX idx_leads_status  ON landing_page_leads(status);
CREATE INDEX idx_leads_type    ON landing_page_leads(lead_type);
```

---

## REVISI TABEL YANG ADA (v1.3)

### Revisi: notifications — Tambah channel web

```sql
-- Tambah nilai baru ke kolom channel
-- Existing: push | whatsapp | sms | in_app
-- Tambah: web_push | browser

-- Update check constraint:
ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_channel_check;

ALTER TABLE notifications
    ADD CONSTRAINT notifications_channel_check
    CHECK (channel IN ('push', 'whatsapp', 'sms', 'in_app', 'web_push', 'email'));
```

---

## REDIS CACHE — TAMBAHAN v1.3

```
# Web session validation (fast lookup)
GET  web_session:{token_hash}        → JSON: {user_id, role, expires_at}
SET  web_session:{token_hash} {json}  EX 28800  ← 8 jam (atau 2592000 = 30 hari jika remember_me)

# Analytics cache per customer (heavy query)
GET  analytics:{customer_id}:{period_key}  → JSON analytics data
SET  analytics:{customer_id}:{period_key}  EX 3600  ← 1 jam

# Bulk download job status
GET  bulk_dl:{job_id}                → JSON: {status, file_url, item_count}
SET  bulk_dl:{job_id} {json}          EX 86400  ← 24 jam

# Pricing estimate rate limit (landing page kalkulator, per IP)
GET  ratelimit:pricing:{ip}          → counter
EX   60                              ← max 20 req/menit per IP

# Active WebSocket connections per user (untuk multi-tab)
SMEMBERS ws:user:{user_id}           → Set of socket_ids
EXPIRE   ws:user:{user_id}  3600
```

---

## S3 STORAGE — TAMBAHAN v1.3

```
bucket: relay-logistics-{env}/
│
├── exports/
│   └── {year}/{month}/
│       └── {customer_id}/
│           ├── orders_export_{period}_{timestamp}.xlsx
│           ├── report_{period}_{timestamp}.pdf
│           └── bulk_download_{download_id}.zip
│
└── landing/
    └── assets/
        ├── hero-animation.json        ← Lottie animation
        ├── og-image.png               ← Open Graph image
        └── app-screenshot-*.png       ← App screenshots
```

---

## RELASI BARU (v1.3)

```
users (customer)
  │
  ├──► web_sessions (1:M)
  │        └── session_token → httpOnly cookie
  │
  ├──► web_push_subscriptions (1:M)
  │        └── endpoint (browser push URL)
  │
  ├──► bulk_downloads (1:M)
  │        └── file_url → S3 ZIP
  │
  └──► customer_analytics_cache (1:M)
           └── analytics_data (JSONB computed)

landing_page_leads
  └── contacted_by → users.id (admin yang follow-up)
  └── converted_user_id → users.id (customer yang registrasi)
```

---

## ERD DIAGRAM LENGKAP — CUSTOMER DOMAIN (v1.2 + v1.3)

```
                            users
                              │
         ┌────────────────────┼─────────────────────────┐
         │                    │                          │
         ▼                    ▼                          ▼
  customer_profiles    web_sessions             customer_addresses
         │             (httpOnly cookie)        (buku alamat)
         │
         ├──► orders ─────────────────────────────────┐
         │       │                                     │
         │       ├──► shipment_receipts ──► barcode_tokens
         │       │        └── pdf_url, png_url (S3)
         │       │
         │       └──► order_items (dimensi + volumetric)
         │
         ├──► bulk_order_jobs
         │       │
         │       └──► bulk_order_rows ──► orders (FK)
         │                             └──► shipment_receipts (FK)
         │
         ├──► bulk_downloads (export ZIP requests)
         │
         ├──► web_push_subscriptions (browser notif)
         │
         ├──► customer_analytics_cache (dashboard data)
         │
         └──► landing_page_leads (prospek dari landing)
```

---

## MATERIALIZED VIEWS UNTUK WEB ANALYTICS

```sql
-- Performa order per customer per hari (base untuk semua analytics)
CREATE MATERIALIZED VIEW mv_customer_daily_stats AS
SELECT
    o.customer_id,
    DATE(o.created_at AT TIME ZONE 'Asia/Jakarta') AS order_date,
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE o.status = 'delivered') AS completed_orders,
    COUNT(*) FILTER (WHERE o.status IN ('failed', 'cancelled')) AS failed_orders,
    SUM(o.total_price_idr) AS total_spent_idr,
    AVG(o.total_price_idr) AS avg_order_value_idr,
    AVG(oi.charged_weight_kg) AS avg_weight_kg,
    AVG(o.distance_km) AS avg_distance_km,
    COUNT(*) FILTER (WHERE o.model = 'p2p') AS p2p_count,
    COUNT(*) FILTER (WHERE o.model = 'two_legs') AS two_legs_count
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.status NOT IN ('pending_payment')
GROUP BY o.customer_id, DATE(o.created_at AT TIME ZONE 'Asia/Jakarta');

-- Refresh setiap jam via pg_cron
SELECT cron.schedule('refresh-customer-daily-stats', '0 * * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_daily_stats');

CREATE UNIQUE INDEX ON mv_customer_daily_stats(customer_id, order_date);
CREATE INDEX ON mv_customer_daily_stats(customer_id);
```
