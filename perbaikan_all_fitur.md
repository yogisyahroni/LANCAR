# Perbaikan All Fitur — Admin Dashboard E2E

Status: In Progress | Dibuat: 2026-05-02

---

## STATUS AUDIT LENGKAP (SEMUA HALAMAN)

| Halaman        | Live API?              | Aksi Berfungsi?                           | Prioritas |
|----------------|------------------------|-------------------------------------------|-----------|
| Dashboard      | TIDAK - 100% hardcoded | TIDAK                                     | P1 KRITIS |
| Orders         | TIDAK - ActiveOrdersTable hardcoded | TIDAK - Export/Reassign/Flag mati | P1 KRITIS |
| Couriers       | TIDAK - 100% hardcoded | TIDAK - Verify/Suspend/Paginate mati      | P1 KRITIS |
| Disputes       | TIDAK - 100% hardcoded | TIDAK - Resolve/Assign/Escalate mati      | P1 KRITIS |
| Finance        | TIDAK - 100% hardcoded | TIDAK - Release/Export/TopUp mati         | P1 KRITIS |
| Customers      | TIDAK - 100% hardcoded | TIDAK - BulkEmail/ViewProfile mati        | P1 KRITIS |
| Analytics      | TIDAK - 100% hardcoded | TIDAK - Download/Heatmap/Schedule mati    | P2        |
| Notifications  | TIDAK - initialTemplates hardcoded | TIDAK - AddTrigger/Save mati  | P2        |
| Vouchers       | TIDAK - initialVouchers hardcoded  | TIDAK - Edit/Delete/Generate mati | P2    |
| Zones          | TIDAK - initialZones hardcoded     | TIDAK - CreateZone/Edit/Delete mati | P2  |
| PricingConfig  | TIDAK - simulationData hardcoded   | TIDAK - Save/Toggle mati          | P2        |
| SLAConfig      | TIDAK - semua stages hardcoded     | TIDAK - DeployConfig/Reset mati   | P2        |
| Settings       | SUDAH LIVE             | SUDAH E2E                                 | DONE      |
| AuditLogs      | SUDAH LIVE             | SUDAH E2E                                 | DONE      |
| FeatureFlags   | SUDAH LIVE             | SUDAH E2E                                 | DONE      |
| ThreeLegReady  | SUDAH LIVE             | SUDAH E2E                                 | DONE      |
| Login          | Mock Auth              | Berfungsi                                 | DONE      |

---

## FASE 1 - CORE DATA PAGES (KRITIS)

### [1.1] Dashboard.tsx - Semua Statistik Hardcoded

PROBLEM: Stat cards, Recent Events, System Health, Revenue Chart - 0% API call.

BACKEND PERLU DIBUAT:
[ ] GET /admin/dashboard/stats  -> orders, payments, courier_profiles, sla_logs
[ ] GET /admin/dashboard/events -> order_events, audit_logs LIMIT 10

FRONTEND:
[ ] useQuery /admin/dashboard/stats -> replace 4 StatCard
[ ] useQuery /admin/dashboard/events -> replace Recent Events array
[ ] Sambungkan System Health ke /admin/health (sudah ada)
[ ] "View All Activity" navigate ke /audit-logs

---

### [1.2] Orders / ActiveOrdersTable.tsx - 100% Hardcoded

PROBLEM: const orders hardcoded 5 baris. "Showing 5 of 124 active orders" hardcoded.
Search hanya filter client-side. Modal Order Detail: timeline hardcoded, Delivery Evidence placeholder.
Tombol "Manual Reassign" dan "Flag Issue" tidak melakukan apapun.
Tombol "Export CSV" dan "Create Manual Order" di Orders.tsx juga mati.

DB TABLES: orders, order_legs, order_events, users, courier_profiles, package_scans

BACKEND PERLU DIBUAT:
[ ] GET /admin/orders?page=1&limit=20&status=&search=&type=
    -> JOIN orders, users(customer), courier_profiles, order_legs
[ ] GET /admin/orders/stats -> COUNT per status, total revenue
[ ] GET /admin/orders/:id   -> detail + order_events timeline + package_scans
[ ] POST /admin/orders/:id/reassign -> {courier_id} update order_legs
[ ] POST /admin/orders/:id/flag    -> insert ke disputes
[ ] POST /admin/orders (Create Manual Order)
[ ] GET /admin/orders/export -> CSV stream dari DB

FRONTEND:
[ ] Replace const orders dengan useQuery('/admin/orders') + skeleton
[ ] Search input -> debounce + ?search= backend (bukan filter array)
[ ] Pagination real (total dari response, bukan hardcoded 124)
[ ] Modal timeline -> dari order_events (GET /admin/orders/:id)
[ ] Delivery Evidence -> dari package_scans (foto POD)
[ ] Tombol "Manual Reassign" -> useMutation POST /admin/orders/:id/reassign
[ ] Tombol "Flag Issue" -> useMutation POST /admin/orders/:id/flag
[ ] Tombol "Export CSV" -> GET /admin/orders/export download file
[ ] Tombol "Create Manual Order" -> modal form + POST /admin/orders

---

### [1.3] Couriers.tsx - 100% Hardcoded

PROBLEM: Array couriers 4 entry hardcoded. Stats (1248, 412, 28, 5) hardcoded.
Pagination palsu. Tombol Verify/Suspend tidak melakukan apapun.

DB TABLES: courier_profiles, users, courier_documents, courier_ratings, relay_score_history

BACKEND PERLU DIBUAT:
[ ] GET /admin/couriers?page=1&limit=20&status=&search=
    -> JOIN courier_profiles, users, courier_ratings
[ ] GET /admin/couriers/stats -> COUNT per status
[ ] GET /admin/couriers/:id  -> detail + courier_documents + rating
[ ] PATCH /admin/couriers/:id/status -> {status: active|suspended|pending}
[ ] GET /admin/couriers/:id/history -> orders JOIN order_legs
[ ] GET /admin/couriers/export -> CSV

FRONTEND:
[ ] Replace array hardcoded dengan useQuery('/admin/couriers') + skeleton
[ ] Stats cards -> useQuery('/admin/couriers/stats')
[ ] Pagination real
[ ] "Verify Courier" -> PATCH status active
[ ] "Suspend Access" -> PATCH status suspended
[ ] Modal detail -> GET /admin/couriers/:id
[ ] "Export List" -> download CSV

---

### [1.4] Disputes.tsx - 100% Hardcoded

PROBLEM: Array disputes 3 entry. Badge "8 Unresolved" hardcoded.
Resolve/Contact/Escalate tidak berfungsi. Assign Specialist select statis.

DB TABLES: disputes, orders, users

BACKEND PERLU DIBUAT:
[ ] GET /admin/disputes?status=all  -> JOIN disputes, orders, users
[ ] GET /admin/disputes/stats       -> COUNT per status
[ ] PATCH /admin/disputes/:id/status -> {status: resolved|investigating|escalated}
[ ] POST /admin/disputes/:id/assign  -> {admin_id}

FRONTEND:
[ ] Replace array dengan useQuery('/admin/disputes?status=all')
[ ] Badge count -> /admin/disputes/stats
[ ] Filter tabs -> ?status= query param
[ ] "Resolve & Close" -> PATCH + toast
[ ] "Escalate to Legal" -> PATCH status escalated
[ ] Assign select -> dari /admin/admins, submit ke assign endpoint

---

### [1.5] Finance.tsx - 100% Hardcoded

PROBLEM: Revenue Rp 842.5M, donut chart, bar chart, settlements table,
Emergency Fund Rp 42.5M, Unit Economics - semua hardcoded.

DB TABLES: payments, payout_records, courier_insurance, system_configs

BACKEND PERLU DIBUAT:
[ ] GET /admin/finance/summary          -> SUM payments (gross, net, cost)
[ ] GET /admin/finance/revenue-breakdown -> GROUP BY order_type
[ ] GET /admin/finance/cost-breakdown   -> breakdown per kategori
[ ] GET /admin/finance/settlements      -> payout_records WHERE status=pending
[ ] POST /admin/finance/settlements/:id/release -> update status
[ ] GET /admin/finance/emergency-fund   -> system_configs key=emergency_fund

FRONTEND:
[ ] 3 stat cards -> /admin/finance/summary
[ ] Donut chart  -> /admin/finance/revenue-breakdown
[ ] Bar chart    -> /admin/finance/cost-breakdown
[ ] Settlements table -> useQuery + real pagination
[ ] "Release" per row -> useMutation + toast
[ ] "Batch Trigger All" -> release semua pending
[ ] Emergency Fund -> real dari system_configs
[ ] "Export Audit (PDF)" -> download file

---

### [1.6] Customers.tsx - 100% Hardcoded (BARU DITEMUKAN)

PROBLEM: Array customers 3 entry. Stats (8432, 412, Rp 842.5M) hardcoded.
Search hanya setState lokal. "Bulk Email" dan "View Profile Detail" tidak berfungsi.

DB TABLES: users, orders, payments (wallet/saldo)

BACKEND PERLU DIBUAT:
[ ] GET /admin/customers?page=1&limit=20&type=&search=
    -> users WHERE role IN ('customer','umkm') + COUNT orders
[ ] GET /admin/customers/stats  -> total, umkm count, total revenue
[ ] GET /admin/customers/:id    -> detail + order history + wallet balance
[ ] POST /admin/customers/bulk-email -> {user_ids, subject, body}
[ ] PATCH /admin/customers/:id/status -> activate/deactivate

FRONTEND:
[ ] Replace array dengan useQuery('/admin/customers')
[ ] 3 stat cards -> /admin/customers/stats
[ ] Search -> backend ?search= (bukan filter lokal)
[ ] Pagination real
[ ] "View Profile Detail" -> modal/navigate ke customer detail
[ ] "Bulk Email" -> modal compose + POST bulk-email

---

## FASE 2 - SECONDARY PAGES

### [2.1] Analytics.tsx - Semua Chart Hardcoded

PROBLEM: slaComplianceByZone, cohortData, surgeAnalytics, volumetricAccuracy
semua array statis. Download mati. Heatmap placeholder. Scheduled Reports statis.

BACKEND PERLU DIBUAT:
[ ] GET /admin/analytics/sla-by-zone?range=7D  -> sla_logs GROUP BY zone+day
[ ] GET /admin/analytics/surge?range=7D         -> dynamic_pricing_logs GROUP BY hour
[ ] GET /admin/analytics/scan-accuracy          -> package_scans GROUP BY confidence
[ ] GET /admin/analytics/kpis                   -> SLA%, avg delivery, demand gap

FRONTEND:
[ ] Replace semua array statis dengan useQuery + ?range= param
[ ] Time filter (24H/7D/30D/1Y) -> re-fetch
[ ] Download -> export CSV
[ ] Heatmap -> Leaflet + courier_locations data
[ ] Scheduled Reports -> CRUD /admin/reports/schedules

---

### [2.2] Notifications.tsx - 100% Hardcoded

PROBLEM: const initialTemplates 3 entry hardcoded (useState tidak pernah update).
Tombol "Add Trigger" tidak buka modal apapun.
Tombol "Save Changes" tidak POST ke endpoint manapun.
Channel toggles (PUSH/EMAIL/SMS) hanya UI visual, tidak save state.

DB TABLES: notification_templates (trigger, channels, subject, content, status)

BACKEND PERLU DIBUAT:
[ ] GET /admin/notification-templates          -> semua template dari DB
[ ] POST /admin/notification-templates         -> create template baru
[ ] PATCH /admin/notification-templates/:id    -> update subject/content/channels
[ ] DELETE /admin/notification-templates/:id   -> hapus template
[ ] POST /admin/notification-templates/:id/test -> kirim test notification

FRONTEND:
[ ] useState(initialTemplates) -> useQuery('/admin/notification-templates')
[ ] "Add Trigger" -> modal form + POST endpoint
[ ] Channel toggle buttons -> update local state, save via PATCH
[ ] "Save Changes" -> useMutation PATCH /admin/notification-templates/:id
[ ] Reset button (RotateCcw) -> invalidate query (reload dari DB)

---

### [2.3] Vouchers.tsx - 100% Hardcoded

PROBLEM: const initialVouchers 3 entry. Stats (12, 42120, Rp 124.5M) hardcoded.
Search input tidak terhubung ke filter manapun.
"Generate Voucher" tidak buka modal. "Edit Details" dan Trash tidak berfungsi.
Progress bar usage dihitung dari string hardcoded (split ' / ').
"Valid for 142 days more" hardcoded.

DB TABLES: vouchers, voucher_usages

BACKEND PERLU DIBUAT:
[ ] GET /admin/vouchers?search=&status=       -> vouchers + COUNT usage
[ ] GET /admin/vouchers/stats                 -> total active, total claims, revenue impact
[ ] POST /admin/vouchers                      -> create voucher baru
[ ] PATCH /admin/vouchers/:id                 -> edit detail
[ ] DELETE /admin/vouchers/:id               -> hapus
[ ] PATCH /admin/vouchers/:id/status          -> activate/deactivate

FRONTEND:
[ ] useState(initialVouchers) -> useQuery('/admin/vouchers')
[ ] 3 stat cards -> /admin/vouchers/stats
[ ] Search input -> debounce + ?search= backend
[ ] Progress bar usage -> hitung dari (usage_count / max_usage) real
[ ] Days remaining -> hitung dari expiry date real
[ ] "Generate Voucher" -> modal form + POST
[ ] "Edit Details" -> modal pre-filled + PATCH
[ ] Trash button -> confirm dialog + DELETE

---

### [2.4] Zones.tsx - 100% Hardcoded + Map Belum Terintegrasi

PROBLEM: const initialZones 3 entry hardcoded. Map area adalah placeholder div
dengan teks "Map Engine Loading..." - tidak ada Leaflet/Mapbox terintegrasi.
meetingPoints dan activeOrders hardcoded. Search tidak berfungsi.
"Create New Zone", "Edit Shape", "Delete Zone" semua mati.
Keyboard shortcut "D" untuk Draw dan "M" untuk Point tidak diimplementasi.

DB TABLES: zones, meeting_points, courier_zones, orders

BACKEND PERLU DIBUAT:
[ ] GET /admin/zones                    -> zones + COUNT meeting_points + active_orders
[ ] GET /admin/zones/stats              -> total zones, total meeting points
[ ] POST /admin/zones                   -> create zone baru dengan polygon coordinates
[ ] GET /admin/zones/:id                -> detail + polygon geojson + meeting points
[ ] PATCH /admin/zones/:id              -> update name/color/polygon
[ ] DELETE /admin/zones/:id             -> hapus zone
[ ] GET /admin/zones/:id/meeting-points -> list titik temu dalam zone
[ ] POST /admin/zones/:id/meeting-points -> tambah titik temu

FRONTEND:
[ ] useState(initialZones) -> useQuery('/admin/zones')
[ ] Search -> filter dari backend ?search=
[ ] Integrasikan Leaflet/Mapbox (package: leaflet + react-leaflet)
[ ] Render polygon zone dari geojson data
[ ] Draw mode -> react-leaflet-draw untuk buat polygon baru
[ ] "Create New Zone" -> modal form + simpan polygon ke POST
[ ] "Edit Shape" -> aktifkan edit mode polygon + PATCH
[ ] "Delete Zone" -> confirm dialog + DELETE
[ ] Meeting points -> marker di peta + CRUD endpoint

---

### [2.5] PricingConfig.tsx - Sebagian Hardcoded

PROBLEM: Tab Standard/Relay/Express tidak mengubah data apapun (sama semua).
simulationData hardcoded (tidak recalculate dari baseFare/perKm state).
Dynamic Surge Triggers (3 rules) hardcoded, toggle tidak save state.
Gross Margin (22.4%) dan Courier Take-Home (78%) hardcoded.
"Save Changes" tidak POST ke endpoint apapun.
"Add New Trigger Rule" tidak buka modal.
"Discard" tidak reset state.
"Zonal Pricing" button tidak navigate kemana pun.

DB TABLES: pricing_configs (key, value, model_type)

BACKEND PERLU DIBUAT:
[ ] GET /admin/pricing?model=Standard     -> pricing_configs WHERE model_type=Standard
[ ] PATCH /admin/pricing                  -> bulk update multiple pricing_configs
[ ] GET /admin/pricing/surge-rules        -> surge rules dari system_configs
[ ] PATCH /admin/pricing/surge-rules/:id  -> toggle/update surge rule
[ ] POST /admin/pricing/surge-rules       -> tambah rule baru
[ ] GET /admin/pricing/health             -> gross margin, courier take-home (calculated)

FRONTEND:
[ ] Load pricing saat mount -> GET /admin/pricing?model=Standard
[ ] Tab switch -> re-fetch dengan model berbeda (Standard/Relay/Express)
[ ] baseFare/perKm input -> recalculate simulationData secara real-time
[ ] Surge toggles -> useMutation PATCH /admin/pricing/surge-rules/:id
[ ] "Add New Trigger Rule" -> modal form + POST
[ ] "Save Changes" -> batch PATCH semua nilai
[ ] "Discard" -> invalidate query (reload dari DB)
[ ] Margin/Take-home -> dari /admin/pricing/health (calculated dari DB)

---

### [2.6] SLAConfig.tsx - Semua Hardcoded

PROBLEM: 4 SLA stages (Pickup Window, Leg 1, Relay Processing, Final Leg) hardcoded.
Target dan Critical input adalah defaultValue statis (tidak diload dari DB).
Model switch P2P/2-Leg/3-Leg tidak mengubah data (semua stages sama).
Min. Confidence Score (85%) dan Assignment Radius (3.5 KM) hardcoded.
"Deploy Config" tidak POST ke endpoint apapun.
"Review Peak Rules" tidak navigate kemana pun.

DB TABLES: sla_configs (model_type, stage, target_minutes, critical_minutes)

BACKEND PERLU DIBUAT:
[ ] GET /admin/sla?model=3-Leg          -> sla_configs WHERE model_type=3-Leg
[ ] PATCH /admin/sla                    -> bulk update sla_configs
[ ] GET /admin/sla/auto-assignment      -> system_configs (confidence, radius)
[ ] PATCH /admin/sla/auto-assignment    -> update confidence score / radius

FRONTEND:
[ ] Mount -> GET /admin/sla?model=3-Leg (load ke state)
[ ] Model switch (P2P/2-Leg/3-Leg) -> re-fetch model berbeda
[ ] Input target/critical -> controlled input dari DB value
[ ] "Deploy Config" -> PATCH semua sla_configs + toast sukses
[ ] Reset (RotateCcw) -> invalidate query
[ ] Confidence Score slider -> real value dari /admin/sla/auto-assignment
[ ] Assignment Radius slider -> real value dari DB

---

## FASE 3 - CROSS-CUTTING

### [3.1] Export (Semua Halaman)
[ ] Orders -> GET /admin/orders/export CSV
[ ] Couriers -> GET /admin/couriers/export CSV
[ ] Customers -> GET /admin/customers/export CSV
[ ] Finance -> GET /admin/finance/export PDF/CSV

### [3.2] Real Pagination
[ ] Orders, Couriers, Customers, Disputes, Finance settlements
[ ] Format response: { data: [...], total: N, page: N, limit: N }

### [3.3] Search Backend-Driven
[ ] Semua search input -> debounce 300ms -> ?search= ke backend
[ ] Tidak ada filter array client-side

### [3.4] Real-time
[ ] Dashboard stats -> refetchInterval: 30000
[ ] Active Orders -> refetchInterval: 10000
[ ] Subscribe WebSocket /admin/events untuk notif live

---

## SEMUA ENDPOINT YANG PERLU DIBUAT

| Endpoint                              | Method | Table Sumber             | Status |
|---------------------------------------|--------|--------------------------|--------|
| /admin/dashboard/stats                | GET    | orders,payments,couriers | TODO   |
| /admin/dashboard/events               | GET    | order_events,audit_logs  | TODO   |
| /admin/orders                         | GET    | orders,users,couriers    | TODO   |
| /admin/orders/stats                   | GET    | orders                   | TODO   |
| /admin/orders/:id                     | GET    | orders,order_events      | TODO   |
| /admin/orders/:id/reassign            | POST   | order_legs               | TODO   |
| /admin/orders/:id/flag                | POST   | disputes                 | TODO   |
| /admin/orders/export                  | GET    | orders                   | TODO   |
| /admin/couriers                       | GET    | courier_profiles,users   | TODO   |
| /admin/couriers/stats                 | GET    | courier_profiles         | TODO   |
| /admin/couriers/:id                   | GET    | courier_profiles,docs    | TODO   |
| /admin/couriers/:id/status            | PATCH  | courier_profiles         | TODO   |
| /admin/couriers/:id/history           | GET    | orders,order_legs        | TODO   |
| /admin/couriers/export                | GET    | courier_profiles         | TODO   |
| /admin/disputes                       | GET    | disputes,orders,users    | TODO   |
| /admin/disputes/stats                 | GET    | disputes                 | TODO   |
| /admin/disputes/:id/status            | PATCH  | disputes                 | TODO   |
| /admin/disputes/:id/assign            | POST   | disputes                 | TODO   |
| /admin/finance/summary                | GET    | payments                 | TODO   |
| /admin/finance/revenue-breakdown      | GET    | payments,orders          | TODO   |
| /admin/finance/cost-breakdown         | GET    | payout_records           | TODO   |
| /admin/finance/settlements            | GET    | payout_records           | TODO   |
| /admin/finance/settlements/:id/release| POST   | payout_records           | TODO   |
| /admin/finance/emergency-fund         | GET    | system_configs           | TODO   |
| /admin/customers                      | GET    | users,orders             | TODO   |
| /admin/customers/stats                | GET    | users,payments           | TODO   |
| /admin/customers/:id                  | GET    | users,orders             | TODO   |
| /admin/customers/bulk-email           | POST   | users                    | TODO   |
| /admin/analytics/sla-by-zone          | GET    | sla_logs                 | TODO   |
| /admin/analytics/surge                | GET    | dynamic_pricing_logs     | TODO   |
| /admin/analytics/scan-accuracy        | GET    | package_scans            | TODO   |
| /admin/analytics/kpis                 | GET    | sla_logs,orders          | TODO   |
| /admin/notification-templates         | GET    | notification_templates   | TODO   |
| /admin/notification-templates         | POST   | notification_templates   | TODO   |
| /admin/notification-templates/:id     | PATCH  | notification_templates   | TODO   |
| /admin/notification-templates/:id     | DELETE | notification_templates   | TODO   |
| /admin/vouchers                       | GET    | vouchers,voucher_usages  | TODO   |
| /admin/vouchers/stats                 | GET    | vouchers,voucher_usages  | TODO   |
| /admin/vouchers                       | POST   | vouchers                 | TODO   |
| /admin/vouchers/:id                   | PATCH  | vouchers                 | TODO   |
| /admin/vouchers/:id                   | DELETE | vouchers                 | TODO   |
| /admin/zones                          | GET    | zones,meeting_points     | TODO   |
| /admin/zones                          | POST   | zones                    | TODO   |
| /admin/zones/:id                      | GET    | zones,meeting_points     | TODO   |
| /admin/zones/:id                      | PATCH  | zones                    | TODO   |
| /admin/zones/:id                      | DELETE | zones                    | TODO   |
| /admin/pricing                        | GET    | pricing_configs          | TODO   |
| /admin/pricing                        | PATCH  | pricing_configs          | TODO   |
| /admin/pricing/surge-rules            | GET    | system_configs           | TODO   |
| /admin/pricing/surge-rules/:id        | PATCH  | system_configs           | TODO   |
| /admin/sla                            | GET    | sla_configs              | TODO   |
| /admin/sla                            | PATCH  | sla_configs              | TODO   |
| /admin/sla/auto-assignment            | GET    | system_configs           | TODO   |
| /admin/sla/auto-assignment            | PATCH  | system_configs           | TODO   |
| /admin/feature-flags                  | GET    | feature_flags            | DONE   |
| /admin/feature-flags/:key/toggle      | PATCH  | feature_flags            | DONE   |
| /admin/settings                       | GET    | system_configs           | DONE   |
| /admin/settings/:key                  | PATCH  | system_configs           | DONE   |
| /admin/admins                         | GET    | users                    | DONE   |
| /admin/admins                         | POST   | users                    | DONE   |
| /admin/admins/:id                     | DELETE | users                    | DONE   |
| /admin/health                         | GET    | ping services            | DONE   |
| /admin/audit-logs                     | GET    | feature_flag_logs        | DONE   |

---

## ATURAN WAJIB CI/CD

Setiap endpoint baru di routes.ts HARUS ditambahkan ke mock di routes.test.ts.
Jika tidak: TypeError: argument handler must be a function -> CI GAGAL.
