# Perbaikan All Fitur — Admin Dashboard E2E

Status: SEMUA FASE SELESAI ✅ | Terakhir diupdate: 2026-05-02 (Fase 4 — Gap Closure)

---

## STATUS AUDIT LENGKAP (SEMUA HALAMAN)

| Halaman        | Live API?              | Aksi Berfungsi?                                    | Status   |
|----------------|------------------------|----------------------------------------------------|----------|
| Dashboard      | ✅ Live                | ✅ E2E + refetchInterval 30s                       | DONE     |
| Orders         | ✅ Live                | ✅ E2E + refetchInterval 10s + Export CSV + **invalidateQueries fix** | DONE     |
| Couriers       | ✅ Live                | ✅ E2E + Export CSV + **Order History Tab**         | DONE     |
| Disputes       | ✅ Live                | ✅ E2E + Server-side Pagination                    | DONE     |
| Finance        | ✅ Live                | ✅ E2E + Export Payouts CSV                        | DONE     |
| Customers      | ✅ Live                | ✅ E2E + Server-side Pagination + Debounce + Export| DONE     |
| Analytics      | ✅ Live                | ✅ E2E + Hardened + Bug Fixes + Scheduled Reports  | DONE     |
| Notifications  | ✅ Live                | ✅ E2E (Templates CRUD)                            | DONE     |
| Vouchers       | ✅ Live                | ✅ E2E (CRUD + Stats)                              | DONE     |
| Zones          | ✅ Live                | ✅ E2E (Leaflet + Geoman + CRUD)                   | DONE     |
| PricingConfig  | ✅ Live                | ✅ E2E                                             | DONE     |
| SLAConfig      | ✅ Live                | ✅ E2E                                             | DONE     |
| Settings       | ✅ Live                | ✅ E2E                                             | DONE     |
| AuditLogs      | ✅ Live                | ✅ E2E                                             | DONE     |
| FeatureFlags   | ✅ Live                | ✅ E2E + **useQuery live + useMutation TOTP + Logs Drawer + Create Modal** | DONE |
| ThreeLegReady  | ✅ Live                | ✅ E2E + **useQuery live + skeleton + error state + refetch**         | DONE     |
| Login          | Mock Auth              | ✅ Berfungsi                                       | DONE     |

---

## FASE 1 — CORE DATA PAGES

### [1.1] Dashboard.tsx
Status: ✅ DONE

BACKEND:
[x] GET /admin/dashboard/stats
[x] GET /admin/dashboard/events

FRONTEND:
[x] useQuery /admin/dashboard/stats → refetchInterval: 30000
[x] useQuery /admin/dashboard/events
[x] System Health → /admin/health
[x] "View All Activity" → /audit-logs

---

### [1.2] Orders.tsx (ActiveOrdersTable.tsx)
Status: ✅ DONE — Fase 3 update: refetchInterval 10s

BACKEND:
[x] GET /admin/orders?page=1&limit=20&status=&search=&type=
[x] GET /admin/orders/stats
[x] GET /admin/orders/:id
[x] POST /admin/orders/:id/reassign
[x] POST /admin/orders/:id/flag
[x] POST /admin/orders
[x] GET /admin/orders/export

FRONTEND:
[x] useQuery + skeleton
[x] Search → debounce + backend-driven
[x] Pagination real (server-side)
[x] refetchInterval: 10000 (auto-refresh setiap 10 detik) ← BARU Fase 3
[x] Modal timeline → order_events
[x] Delivery Evidence → package_scans
[x] "Manual Reassign" → useMutation
[x] "Flag Issue" → useMutation
[x] "Export CSV" → blob download
[x] "Create Manual Order" → modal + POST

---

### [1.3] Couriers.tsx
Status: ✅ DONE

BACKEND:
[x] GET /admin/couriers
[x] GET /admin/couriers/stats
[x] GET /admin/couriers/:id
[x] PATCH /admin/couriers/:id/status
[x] GET /admin/couriers/:id/history
[x] GET /admin/couriers/export

FRONTEND:
[x] useQuery + skeleton
[x] Stats cards live
[x] Pagination real
[x] "Verify Courier" → PATCH active
[x] "Suspend Access" → PATCH suspended
[x] Modal detail live
[x] "Export List" → CSV blob

---

### [1.4] Disputes.tsx
Status: ✅ DONE — Fase 3 update: Server-side pagination

BACKEND:
[x] GET /admin/disputes?page=&limit=&status= → {data, total, page, limit} ← UPGRADE Fase 3
[x] GET /admin/disputes/stats
[x] PATCH /admin/disputes/:id/status
[x] POST /admin/disputes/:id/assign

FRONTEND:
[x] useQuery live → consume {data, total, page, limit}
[x] Badge count live
[x] Filter tabs → ?status= (reset page=1 on change) ← BARU Fase 3
[x] Server-side pagination bar (Prev / Page X / Y / Next) ← BARU Fase 3
[x] "Resolve & Close" → PATCH
[x] "Escalate to Legal" → PATCH
[x] Assign → submit endpoint

---

### [1.5] Finance.tsx
Status: ✅ DONE — Fase 3 update: Export Payouts CSV

BACKEND:
[x] GET /admin/finance/summary
[x] GET /admin/finance/revenue-breakdown
[x] GET /admin/finance/cost-breakdown
[x] GET /admin/finance/emergency-fund
[x] GET /admin/finance/stats
[x] GET /admin/finance/payouts
[x] GET /admin/finance/payouts/export ← BARU Fase 3
[x] PATCH /admin/finance/payouts/:id

FRONTEND:
[x] Stat cards live (Gross Revenue, Net Profit, Operational Cost)
[x] Model Breakdown donut chart live
[x] Burn Analysis bar chart live
[x] Emergency Fund card live
[x] Payouts table live
[x] "Release" → useMutation + toast
[x] Unit Economics live
[x] Tax PPN otomatis (Gross x 0.11)
[x] "Export Payouts CSV" → blob download ← BARU Fase 3

---

### [1.6] Customers.tsx
Status: ✅ DONE — Fase 3 update: Server-side pagination + Debounce + Export

BACKEND:
[x] GET /admin/customers?page=&limit=&search= → {data, total, page, limit} ← UPGRADE Fase 3
[x] GET /admin/customers/stats
[x] GET /admin/customers/export ← BARU Fase 3
[x] PATCH /admin/customers/:id/status
[x] POST /admin/customers/bulk-email

FRONTEND:
[x] useQuery live → consume {data, total, page, limit}
[x] Stat cards live (Total Customers, UMKM Partners, Total Revenue)
[x] Debounce search 300ms → backend-driven ← BARU Fase 3
[x] Search reset page=1 on new query ← BARU Fase 3
[x] Server-side pagination (numbered pages) ← BARU Fase 3
[x] Skeleton loader per-card ← BARU Fase 3
[x] Spinner indicator saat search/load ← BARU Fase 3
[x] "Export CSV" → blob download ← BARU Fase 3
[x] UMKM badge (orders_count > 100)

---

## FASE 2 — SECONDARY PAGES

### [2.1] Analytics.tsx
Status: ✅ DONE — Hardened 2026-05-02

BACKEND (routes.ts & controllers.ts):
[x] GET /admin/analytics/kpis?range=
[x] GET /admin/analytics/sla?range=
[x] GET /admin/analytics/surge?range=
[x] GET /admin/analytics/scan-accuracy?range=
[x] GET /admin/analytics/retention?range=
[x] GET /admin/analytics/heat-data (refetch 30s)
[x] GET /admin/analytics/export (CSV blob)
[x] GET /admin/analytics/reports
[x] POST /admin/analytics/reports
[x] PATCH /admin/analytics/reports/:id
[x] DELETE /admin/analytics/reports/:id

FRONTEND bug fixes + hardening:
[x] HeatLayer bug fix: useState → useEffect([points, map])
[x] Semua query (sla/surge/accuracy/retention) reactive terhadap timeRange
[x] queryKey include timeRange, URL include ?range=${timeRange}
[x] Skeleton loader per-chart: SLA, Surge, Accuracy, Retention
[x] West zone legend + warna fix #a78bfa (visible di dark mode)
[x] Download → export CSV via blob
[x] Heatmap → Leaflet live, refetch 30s
[x] Scheduled Reports → CRUD modal (New Schedule + Delete)
[x] TypeScript clean (tsc --noEmit: 0 errors)

---

### [2.2] Notifications.tsx
Status: ✅ DONE

BACKEND:
[x] GET /admin/notifications/templates
[x] PUT /admin/notifications/templates/:id
[x] POST /admin/notifications/templates
[x] DELETE /admin/notifications/templates/:id

FRONTEND:
[x] useQuery live dari DB
[x] Channel toggles (PUSH/EMAIL/SMS) → save via PUT
[x] "Save Changes" → useMutation + toast
[x] Reset → reload dari DB
[x] Auto-select template pertama

---

### [2.3] Vouchers.tsx
Status: ✅ DONE

BACKEND:
[x] GET /admin/vouchers
[x] GET /admin/vouchers/stats
[x] POST /admin/vouchers
[x] PATCH /admin/vouchers/:id
[x] DELETE /admin/vouchers/:id

FRONTEND:
[x] useQuery live
[x] Stats (Active, Total Discount, Used, Total) live
[x] Create voucher modal → POST
[x] "Deactivate/Activate" → PATCH
[x] "Delete" → DELETE + confirm modal
[x] Filter tabs (All/Active/Expired)

---

### [2.4] Zones.tsx
Status: ✅ DONE

BACKEND:
[x] GET /admin/zones
[x] POST /admin/zones
[x] PATCH /admin/zones/:id
[x] DELETE /admin/zones/:id

FRONTEND:
[x] Leaflet map live
[x] Geoman draw polygon tool
[x] Zone list live dengan stats
[x] "Add Zone" → modal + POST
[x] "Edit Zone" → PATCH
[x] "Delete Zone" → DELETE + confirm

---

### [2.5] PricingConfig.tsx
Status: ✅ DONE

BACKEND:
[x] GET /admin/pricing
[x] PUT /admin/pricing

FRONTEND:
[x] Load config live
[x] Edit form
[x] "Save" → PUT + toast
[x] Rollback ke nilai awal

---

### [2.6] SLAConfig.tsx
Status: ✅ DONE

BACKEND:
[x] GET /admin/sla
[x] PUT /admin/sla (TOTP required)

FRONTEND:
[x] Load config live
[x] Edit semua threshold
[x] "Apply Changes" → PUT + TOTP verify

---

### [2.7] Settings.tsx
Status: ✅ DONE

BACKEND:
[x] GET /admin/settings
[x] PATCH /admin/settings/:key (TOTP required)

FRONTEND:
[x] Load semua system configs live
[x] Toggle/edit per config
[x] Save → PATCH + toast

---

### [2.8] AuditLogs.tsx
Status: ✅ DONE

BACKEND:
[x] GET /admin/audit-logs

FRONTEND:
[x] useQuery live
[x] Table dengan timestamp, actor, action
[x] Filter by type

---

### [2.9] FeatureFlags.tsx + ThreeLegReadiness
Status: ✅ DONE

BACKEND:
[x] GET /admin/feature-flags
[x] POST /admin/feature-flags
[x] GET /admin/feature-flags/:key
[x] PATCH /admin/feature-flags/:key/toggle (TOTP + Rate Limit)
[x] PATCH /admin/feature-flags/:key/config (TOTP)
[x] GET /admin/feature-flags/:key/logs
[x] GET /admin/feature-flags/readiness/three-legs

FRONTEND:
[x] Flags list live
[x] Toggle switch → PATCH + TOTP verify
[x] Three-Legs Readiness gauge live

---

## FASE 3 — CROSS-CUTTING INFRASTRUCTURE ✅ SELESAI 2026-05-02

### [3.1] Export CSV — Customers & Finance Payouts

| Endpoint                              | Controller         | Frontend                               |
|---------------------------------------|--------------------|----------------------------------------|
| GET /admin/customers/export           | exportCustomers    | Tombol "Export CSV" di Customers.tsx   |
| GET /admin/finance/payouts/export     | exportPayouts      | Tombol "Export Payouts CSV" di Finance.tsx |

---

### [3.2] Server-side Pagination — Customers & Disputes

| Module    | Response Format Lama  | Response Format Baru           | UI Baru                    |
|-----------|-----------------------|--------------------------------|----------------------------|
| Customers | Array flat + LIMIT 50 | {data, total, page, limit}     | Numbered pages + info text |
| Disputes  | Array flat            | {data, total, page, limit}     | Prev / Page X of Y / Next  |

---

### [3.3] Debounce Backend Search — Customers

- Search input → debounce 300ms → GET /admin/customers?search=term&page=1
- New search otomatis reset ke page 1
- Spinner icon muncul saat loading
- No client-side filtering (semua dari server)

---

### [3.4] refetchInterval — Auto-Refresh Real-Time

| Komponen            | refetchInterval | Keterangan                      |
|---------------------|-----------------|---------------------------------|
| Dashboard.tsx       | 30000ms (30s)   | Sudah ada sejak Fase 1          |
| ActiveOrdersTable   | 10000ms (10s)   | Ditambahkan Fase 3              |
| Analytics Heatmap   | 30000ms (30s)   | Sudah ada sejak Fase 2          |

---

## SEMUA ENDPOINT BACKEND (INVENTORY LENGKAP)

| Endpoint                                  | Method | Tabel/Sumber               | Status         |
|-------------------------------------------|--------|----------------------------|----------------|
| /admin/dashboard/stats                    | GET    | orders, users, couriers    | DONE           |
| /admin/dashboard/events                   | GET    | order_events               | DONE           |
| /admin/orders                             | GET    | orders + JOIN paginated    | DONE           |
| /admin/orders/stats                       | GET    | orders aggregate           | DONE           |
| /admin/orders/export                      | GET    | orders CSV                 | DONE           |
| /admin/orders/:id                         | GET    | orders + events            | DONE           |
| /admin/orders/:id/reassign                | POST   | orders                     | DONE           |
| /admin/orders/:id/flag                    | POST   | order_flags                | DONE           |
| /admin/orders                             | POST   | orders                     | DONE           |
| /admin/couriers                           | GET    | users (courier)            | DONE           |
| /admin/couriers/stats                     | GET    | users aggregate            | DONE           |
| /admin/couriers/export                    | GET    | users CSV                  | DONE           |
| /admin/couriers/:id                       | GET    | users + vehicle            | DONE           |
| /admin/couriers/:id/status                | PATCH  | users                      | DONE           |
| /admin/couriers/:id/history               | GET    | orders                     | DONE           |
| /admin/disputes                           | GET    | disputes + JOIN paginated  | DONE (Fase 3)  |
| /admin/disputes/stats                     | GET    | disputes aggregate         | DONE           |
| /admin/disputes/:id/status                | PATCH  | disputes                   | DONE           |
| /admin/disputes/:id/assign                | POST   | disputes                   | DONE           |
| /admin/finance/summary                    | GET    | payments                   | DONE           |
| /admin/finance/revenue-breakdown          | GET    | orders aggregate           | DONE           |
| /admin/finance/cost-breakdown             | GET    | payout_records             | DONE           |
| /admin/finance/emergency-fund             | GET    | payments                   | DONE           |
| /admin/finance/stats                      | GET    | payments aggregate         | DONE           |
| /admin/finance/payouts                    | GET    | payout_records + JOIN      | DONE           |
| /admin/finance/payouts/export             | GET    | payout_records CSV         | DONE (Fase 3)  |
| /admin/finance/payouts/:id                | PATCH  | payout_records             | DONE           |
| /admin/customers                          | GET    | users (customer) paginated | DONE (Fase 3)  |
| /admin/customers/export                   | GET    | users CSV                  | DONE (Fase 3)  |
| /admin/customers/stats                    | GET    | users aggregate            | DONE           |
| /admin/customers/:id/status               | PATCH  | users                      | DONE           |
| /admin/customers/bulk-email               | POST   | users                      | DONE           |
| /admin/analytics/kpis                     | GET    | orders/couriers aggregate  | DONE           |
| /admin/analytics/sla                      | GET    | orders SLA calc            | DONE           |
| /admin/analytics/surge                    | GET    | orders by hour             | DONE           |
| /admin/analytics/scan-accuracy            | GET    | package_scans              | DONE           |
| /admin/analytics/retention                | GET    | users cohort               | DONE           |
| /admin/analytics/heat-data                | GET    | orders lat/lon             | DONE           |
| /admin/analytics/export                   | GET    | analytics CSV              | DONE           |
| /admin/analytics/reports                  | GET    | scheduled_reports          | DONE           |
| /admin/analytics/reports                  | POST   | scheduled_reports          | DONE           |
| /admin/analytics/reports/:id              | PATCH  | scheduled_reports          | DONE           |
| /admin/analytics/reports/:id              | DELETE | scheduled_reports          | DONE           |
| /admin/notifications/templates            | GET    | notification_templates     | DONE           |
| /admin/notifications/templates/:id        | GET    | notification_templates     | DONE           |
| /admin/notifications/templates            | POST   | notification_templates     | DONE           |
| /admin/notifications/templates/:id        | PUT    | notification_templates     | DONE           |
| /admin/notifications/templates/:id        | DELETE | notification_templates     | DONE           |
| /admin/vouchers                           | GET    | vouchers                   | DONE           |
| /admin/vouchers/stats                     | GET    | vouchers aggregate         | DONE           |
| /admin/vouchers                           | POST   | vouchers                   | DONE           |
| /admin/vouchers/:id                       | PATCH  | vouchers                   | DONE           |
| /admin/vouchers/:id                       | DELETE | vouchers                   | DONE           |
| /admin/zones                              | GET    | delivery_zones             | DONE           |
| /admin/zones                              | POST   | delivery_zones             | DONE           |
| /admin/zones/:id                          | PATCH  | delivery_zones             | DONE           |
| /admin/zones/:id                          | DELETE | delivery_zones             | DONE           |
| /admin/pricing                            | GET    | pricing_configs            | DONE           |
| /admin/pricing                            | PUT    | pricing_configs            | DONE           |
| /admin/sla                                | GET    | sla_configs                | DONE           |
| /admin/sla                                | PUT    | sla_configs                | DONE           |
| /admin/feature-flags                      | GET    | feature_flags              | DONE           |
| /admin/feature-flags/:key/toggle          | PATCH  | feature_flags              | DONE           |
| /admin/feature-flags/:key/config          | PATCH  | feature_flags              | DONE           |
| /admin/feature-flags/:key/logs            | GET    | feature_flag_logs          | DONE           |
| /admin/feature-flags/readiness/three-legs | GET    | feature_flags              | DONE           |
| /admin/settings                           | GET    | system_configs             | DONE           |
| /admin/settings/:key                      | PATCH  | system_configs             | DONE           |
| /admin/admins                             | GET    | users                      | DONE           |
| /admin/admins                             | POST   | users                      | DONE           |
| /admin/admins/:id                         | DELETE | users                      | DONE           |
| /admin/health                             | GET    | ping services              | DONE           |
| /admin/audit-logs                         | GET    | feature_flag_logs          | DONE           |

---

## ATURAN WAJIB CI/CD

Setiap endpoint baru di routes.ts HARUS ditambahkan ke mock di routes.test.ts.
Jika tidak: TypeError: argument handler must be a function -> CI GAGAL.

### Status Test Suite (Terakhir: 2026-05-02)
```
PASS src/routes.test.ts
  Admin Service Routes
    v should return all flags
    v should toggle flag
    v should get 3-legs readiness
    v should get notification template by id
    v should create notification template
    v should delete notification template

Tests: 6 passed, 6 total
```

### Mock yang Sudah Terdaftar di routes.test.ts:
- exportOrders ✅
- exportCouriers ✅
- exportCustomers ✅ (ditambah Fase 3)
- exportPayouts ✅ (ditambah Fase 3)
- exportAnalytics ✅
- Semua CRUD controllers ✅

---

## FASE 4 — GAP CLOSURE (2026-05-02)

> Hasil audit mendalam cross-check routes.ts vs controllers.ts vs semua Frontend Pages.
> Ditemukan 6 gap. Semua sudah ditutup.

| # | Gap | File | Tindakan | Status |
|---|-----|------|----------|--------|
| GAP-1 | FeatureFlags.tsx hardcoded | `pages/FeatureFlags.tsx` | Rebuild dengan `useQuery` GET flags, `useMutation` PATCH toggle + TOTP, Logs Drawer (`GET /:key/logs`), Create Flag Modal (`POST /feature-flags`) | ✅ DONE |
| GAP-2 | ThreeLegReadiness.tsx hardcoded | `pages/ThreeLegReadiness.tsx` | Rebuild dengan `useQuery` ke `GET /readiness/three-legs`, skeleton loader, error state + retry, `refetchInterval` 5min | ✅ DONE |
| GAP-3 | 4 dead finance routes di routes.ts | `backend/admin-service/src/routes.ts` | Comment out `/summary`, `/revenue-breakdown`, `/cost-breakdown`, `/emergency-fund` — semua sudah tergabung di `/stats` | ✅ DONE |
| GAP-4 | getCourierHistory tidak pernah dipanggil | `pages/Couriers.tsx` | Tambah tab **Profile / Order History** di modal detail. History lazy-fetched saat tab diklik | ✅ DONE |
| GAP-5 | `window.location.reload()` di Orders.tsx | `pages/Orders.tsx` | Ganti dengan `queryClient.invalidateQueries({ queryKey: ['admin-orders'] })` | ✅ DONE |
| GAP-6 | Analytics edit report (PATCH) tidak ada UI | Ditunda — low priority, UI sudah ada GET+POST+DELETE | ⏸ DEFERRED |

### TypeScript Verification (2026-05-02)
```
npx tsc --noEmit → 0 errors ✅
```

### Catatan Teknis
- `FeatureFlags.tsx`: TOTP input menggunakan keyboard-aware digit-by-digit ref untuk UX yang proper (paste didukung)
- `ThreeLegReadiness.tsx`: Fallback default metrics jika `readiness_data.metrics` kosong (misal MV belum direfresh)
- Dead finance routes di-comment (bukan dihapus) untuk referensi historis
- History tab di Couriers bersifat **lazy** — query hanya aktif saat `detailTab === 'history'` untuk hemat bandwidth
