# PRD — Portal Mitra TEMBUS untuk Bisnis F&B

**Status:** Draft untuk implementasi bertahap  
**Tanggal:** 2026-10-04  
**Target product:** Merchant Web / Portal Mitra pada `merchant.bawain.my.id`  
**Target pengguna:** bisnis F&B, PT/badan usaha, owner, manager outlet, kasir, kitchen, dan finance  
**Baseline:** branch `staging`  
**Related backlog:** [`task-merchant-web-growth-p0-p2-2026.md`](../../task-merchant-web-growth-p0-p2-2026.md)  
**Related task list:** [`TASKS.md`](../../TASKS.md)

> Dokumen ini adalah sumber kebenaran produk. Ia menjelaskan masalah, tujuan,
> scope, behavior, prioritas, dan definisi sukses. Implementasi teknis tetap
> wajib mengikuti contract yang sudah ada dan bukti runtime; PRD ini bukan
> bukti bahwa capability sudah selesai atau production-ready.

## 1. Ringkasan produk

Portal Mitra TEMBUS adalah ruang kerja web bagi bisnis F&B untuk mengelola
operasional toko secara aman dari satu tempat: status outlet, pesanan,
katalog/menu, staff, promo, laporan, settlement, bantuan, dan integrasi.

Portal harus terhubung end to end dengan Customer Android, Merchant Android,
Courier Android, Admin, service backend, database, event/outbox, ledger, dan
provider yang benar-benar aktif. Merchant tidak boleh mendapatkan status,
nominal, permission, atau keberhasilan palsu hanya karena UI berhasil dirender.

Portal web ditujukan terutama untuk merchant bisnis/PT. Jalur merchant
perorangan tetap dapat diarahkan ke Merchant Android sesuai capability dan
policy server. Jika suatu merchant perorangan memang diizinkan masuk portal,
scope dan menu harus berasal dari server, bukan dari tipe yang ditebak
frontend.

## 2. Problem statement

Bisnis F&B membutuhkan satu tempat kerja yang dapat dipercaya untuk menerima
pesanan, mengatur ketersediaan menu, mengelola tim, memahami pendapatan, dan
menyelesaikan masalah order. Tanpa portal yang konsisten, merchant harus
berpindah channel, tidak tahu status yang authoritative, berisiko menerima
order saat outlet tidak siap, dan sulit merekonsiliasi penjualan sampai
pencairan.

Masalah ini memengaruhi owner dan manager yang bertanggung jawab atas omzet,
kasir/kitchen yang menangani order real-time, finance yang memeriksa payout,
serta customer dan kurir yang bergantung pada status menu, outlet, dan order
yang benar. Dampak jika tidak diselesaikan adalah order gagal atau terlambat,
refund dan komplain meningkat, kebocoran data antar outlet, kesalahan
settlement, serta hilangnya kepercayaan bisnis.

## 3. Product principles

1. **Server-authoritative:** frontend menampilkan dan meminta transition; bukan
   sumber kebenaran order, uang, permission, outlet, atau menu.
2. **Operational first:** aksi yang menentukan order dan kesiapan outlet harus
   cepat terlihat, dapat dipulihkan, dan tidak ambigu.
3. **Least privilege:** user hanya melihat outlet, data, dan aksi yang sesuai
   dengan role dan assignment-nya.
4. **No fake completeness:** capability yang belum tersedia harus berstatus
   planned/coming soon atau disembunyikan berdasarkan capability matrix.
5. **Traceable money:** setiap nominal dari gross sales sampai payout dapat
   ditelusuri ke order, ledger, settlement, dan provider reference.
6. **Cross-platform consistency:** Customer, Merchant, Courier, Admin, dan Web
   menggunakan contract state yang sama meskipun copy UI berbeda.
7. **Accessible and resilient:** portal tetap dapat dipahami ketika kosong,
   lambat, offline, stale, error, atau session berakhir.

## 4. Goals dan success outcomes

Target berikut adalah **target persetujuan produk**, bukan hasil yang sudah
tercapai. Baseline aktual harus diukur pada staging/UAT sebelum target final
ditetapkan.

### G1 — Operasi order dapat dijalankan dari satu portal

- Merchant dapat menerima, menolak, menyiapkan, menandai siap, menangani item
  habis, dan menyelesaikan issue tanpa pindah sistem untuk kasus normal.
- Target: minimal 95% skenario P0 UAT order selesai tanpa workaround manual.
- Target: tidak ada duplicate transition atau settlement mutation pada replay
  command/idempotency test.

### G2 — Data dan status dipercaya lintas aplikasi

- Status outlet, menu, order, payment, refund, dan payout konsisten dengan
  service/database authoritative.
- Target: seluruh P0 state memiliki contract, source of truth, freshness,
  audit, dan error mapping yang terdokumentasi.

### G3 — Bisnis dapat mengelola tim dan outlet dengan aman

- Owner/manager dapat menugaskan staff sesuai outlet dan capability tanpa
  berbagi password.
- Target: seluruh high-risk action memiliki authorization server-side,
  step-up bila diperlukan, audit event, dan negative authorization test.

### G4 — Keuangan dapat direkonsiliasi

- Merchant dapat memahami gross-to-net, promo, komisi, pajak/biaya, refund,
  settlement, dan payout tanpa angka yang berbeda antar halaman.
- Target: dashboard, detail, export, dan statement lulus reconciliation test
  terhadap ledger/settlement source.

### G5 — Portal siap dioperasikan dan dipelihara

- Error dapat ditemukan, dijelaskan, dipulihkan, dan dieskalasikan tanpa
  membocorkan secret atau PII.
- Target: seluruh release P0 memiliki browser E2E, cross-app E2E, security,
  accessibility, observability, rollback, dan support runbook evidence.

## 5. Non-goals versi P0

1. **Membangun payment gateway baru.** Portal memakai payment/ledger/provider
   yang sudah menjadi ownership service terkait; provider live yang belum ada
   tetap menjadi dependency.
2. **Menjadi ERP/accounting penuh.** Export dan integrasi accounting disiapkan
   bertahap; general ledger perusahaan tetap di luar scope P0.
3. **Mengelola inventory procurement penuh.** Sold-out dan availability order
   diperlukan untuk P0; procurement, waste, forecasting, dan purchase order
   masuk P2.
4. **Menggantikan Admin.** Admin tetap memiliki privileged review, enforcement,
   moderation, support override, dan approval yang memang dibatasi.
5. **Menjadikan portal sebagai aplikasi customer atau kurir.** Portal hanya
   mengoperasikan sisi merchant dan memperlihatkan state lintas sistem sesuai
   privacy policy.
6. **Menampilkan capability provider yang belum tersedia.** POS, printer,
   payment, ads, CRM, dan API partner hanya boleh ditampilkan aktif jika
   adapter, owner, contract, dan verification-nya ada.

## 6. Personas dan kebutuhan utama

### 6.1 Owner bisnis/PT

Memiliki tanggung jawab atas legal entity, outlet, staff, rekening, payout,
performance, dan keputusan operasional.

Kebutuhan utama: melihat kesehatan bisnis, mengontrol akses, mengelola banyak
outlet, memahami uang, dan menerima bukti perubahan yang dapat diaudit.

### 6.2 Manager outlet

Menjalankan operasi harian pada outlet tertentu.

Kebutuhan utama: buka/jeda outlet, menerima order, mengatur menu tersedia,
menangani keterlambatan/issue, dan melihat performa outlet tanpa mengakses
rekening atau tindakan high-risk yang tidak ditugaskan.

### 6.3 Kasir/order operator

Menangani queue order, customer note, item unavailable, dan status siap.

Kebutuhan utama: UI cepat, notifikasi jelas, keyboard-friendly, dan tidak dapat
mengubah payout atau permission.

### 6.4 Kitchen/staff produksi

Menyiapkan makanan dan mengelola kapasitas produksi.

Kebutuhan utama: daftar kerja yang jelas, prep time, modifier, catatan alergi
bila tersedia, dan aksi terbatas pada status produksi.

### 6.5 Finance

Memeriksa gross-to-net, komisi, promo, tax/fee, settlement, payout, invoice,
dan export.

Kebutuhan utama: nominal authoritative, filter periode/outlet, rekonsiliasi,
masking data, dan audit export.

### 6.6 Admin/support TEMBUS

Bukan pengguna merchant portal biasa. Admin mempunyai console dan privilege
terpisah untuk verifikasi, moderation, enforcement, support override, appeal,
dan investigation sesuai policy.

## 7. Scope dan requirements

### 7.1 P0 — Portal foundation dan akses

**PRD-P0-001 — Authenticated shell dan tenant context**

Portal harus memuat business, merchant, outlet, role, permission, market,
currency, timezone, verification state, notification, help, account menu, dan
session state dari server.

**Acceptance criteria:**

- Given user login valid, when portal dibuka, then context bisnis dan outlet
  ditampilkan dari session/server.
- Given user mengubah `merchant_id`, `outlet_id`, atau object ID di URL, when
  request dikirim, then backend menolak akses lintas tenant/outlet.
- Given session expired/revoked, when user melakukan aksi, then portal meminta
  login ulang tanpa mengklaim aksi berhasil.
- Given user tidak memiliki capability, then route dan API sama-sama menolak
  atau menyajikan state read-only sesuai policy.

**PRD-P0-002 — Role, staff, dan permission**

Portal harus mendukung owner, manager, cashier/order operator, kitchen,
finance, analyst, dan support-read-only sesuai role/capability yang disetujui.
Invite, revoke, branch assignment, device/session, MFA/step-up, dan high-risk
approval mengikuti contract RBAC.

**Acceptance criteria:**

- Permission tidak berasal dari bitmask yang dikirim client.
- Staff hanya dapat mengakses outlet assignment-nya.
- Bank, payout, refund threshold, permission, dan export sensitif memiliki
  permission/step-up yang sesuai.
- Perubahan role, invite, revoke, dan high-risk action menghasilkan audit.

### 7.2 P0 — Operational control center

**PRD-P0-003 — Beranda operasi**

Beranda menampilkan status outlet, jam operasi, pause/busy, terima otomatis,
order queue, alert, ringkasan penjualan, issue, dan payout berikutnya sesuai
data yang tersedia.

**Acceptance criteria:**

- Setiap angka memiliki period, outlet scope, currency, dan freshness.
- Toggle open/pause/busy/auto-accept memiliki confirmation, optimistic failure
  rollback, retry, idempotency, dan audit.
- Perubahan operating state dipropagasikan ke Customer, Courier, Merchant
  Android, Search/Ads bila relevan, dan Admin melalui contract event.
- Loading, empty, stale, error, retry, dan permission-denied state tersedia.

**PRD-P0-004 — Multi-outlet dan business profile**

Owner bisnis dapat mengelola legal entity, brand, outlet address, map, contact,
timezone, currency, jam operasi/libur, verification, dan outlet lifecycle.

**Acceptance criteria:**

- Semua query, export, event, cache, dan audit memiliki business/outlet scope.
- Outlet switcher tidak mengubah data hanya karena context UI; server melakukan
  authorization ulang.
- Bulk action memiliki preview, progress, partial failure, retry, dan rollback
  path bila capability tersedia.

### 7.3 P0 — Order food end to end

**PRD-P0-005 — Order operations center**

Portal harus mendukung queue order baru, aktif, terjadwal, selesai, cancelled,
refund/dispute, search/filter, detail, timeline, receipt, notification, dan
aksi transition yang diizinkan.

Lifecycle minimum:

`customer checkout → payment state → merchant accept/reject → preparing →
ready for pickup → courier assigned/pickup → delivered → settlement`, dengan
cabang item unavailable, substitution, customer approval, timeout, cancel,
refund, failed, dan dispute.

**Acceptance criteria:**

- Setiap transition authoritative, idempotent, memiliki actor, timestamp,
  state version, reason bila diperlukan, dan correlation ID.
- Merchant tidak dapat mengubah total, payment state, courier state, atau
  delivered status langsung dari frontend.
- Refresh, multi-tab, reconnect, duplicate click, out-of-order event, worker
  restart, dan provider timeout menghasilkan state akhir yang benar.
- Customer dan Courier menerima update yang konsisten dengan order state.
- Receipt berasal dari snapshot order authoritative, bukan kalkulasi bebas UI.

**PRD-P0-006 — Issue, substitution, refund, dan communication**

Merchant dapat mengajukan item unavailable/substitution sesuai policy,
berkomunikasi melalui channel privacy-safe, membuat issue, dan melakukan
refund/compensation hanya bila role/threshold mengizinkan.

**Acceptance criteria:**

- Customer mendapat kesempatan menyetujui perubahan yang memang memerlukannya.
- Issue memiliki owner, SLA, evidence, resolution code, escalation, dan audit.
- Refund/compensation tidak dapat dibuat dua kali dan masuk ke ledger/settlement.
- Nomor telepon mentah, token, dan data sensitif tidak ditampilkan tanpa policy.

### 7.4 P0 — Catalog dan menu

**PRD-P0-007 — Catalog governance**

Merchant dapat mengelola kategori, item, image, description, price, prep time,
variant, modifier, allergen/diet label bila tersedia, schedule, inventory
availability, sold-out, draft, moderation, publish, rollback, dan import.

**Acceptance criteria:**

- Menu baru mengikuti moderation/publish lifecycle dan tidak langsung muncul di
  Customer sebelum state yang sah.
- Item snapshot pada order lama tidak berubah ketika menu baru diubah.
- Modifier wajib/opsional, min/max, price delta, dan dependency tervalidasi
  di backend.
- Sold-out atau schedule unavailable mencegah oversell akibat stale cache/race.
- Import melakukan validate-before-mutate, idempotency, row error, size/MIME
  limit, dan hasil dapat diaudit.

### 7.5 P0 — Finance dan settlement

**PRD-P0-008 — Financial visibility and reconciliation**

Portal menampilkan gross sales, subtotal, fee, commission, promo contribution,
tax, refund, adjustment, chargeback/dispute, net payable, holding, available,
settlement batch, payout schedule, bank status, invoice, dan export.

**Acceptance criteria:**

- Dashboard/detail/export/statement menggunakan definisi metric dan source yang
  sama.
- HTTP 200 tidak boleh otomatis berarti payment atau payout berhasil.
- Setiap nominal dapat ditelusuri order → transaction/ledger → settlement →
  payout/provider reference.
- Payout/bank change memiliki masking, verification, step-up, cooldown/approval
  bila diwajibkan, idempotency, dan audit.
- Mismatch masuk exception queue/alert; frontend tidak memperbaiki ledger.

### 7.6 P0 — Reliability, security, dan release

**PRD-P0-009 — Realtime dan recovery**

Incoming order, state update, stale-data, notification preference, websocket/SSE
atau polling fallback, deduplication, event sequence, retry, dan offline/read-
only state harus didefinisikan.

**Acceptance criteria:**

- Duplicate, delayed, out-of-order, missing, dan replayed event aman.
- Portal membedakan live, stale, syncing, offline, dan failed.
- Write yang belum dikonfirmasi tidak ditampilkan sebagai success.
- Metric event lag, order notification latency, command error, dan freshness
  memiliki alert/runbook.

**PRD-P0-010 — Security, privacy, accessibility, dan production gate**

- Tenant isolation, RBAC/ABAC, CSRF/XSS/upload controls, rate limit, MFA,
  secure session, secret handling, audit immutability, PII masking/retention,
  security headers, dependency/container scan.
- Desktop/tablet/mobile responsive, keyboard/focus, contrast, text scaling,
  reduced motion, semantic labels, Indonesian copy, dan error recovery.
- Browser E2E, cross-app E2E, migration compatibility, backup/restore,
  rollback, feature flag kill switch, support/on-call, dan incident runbook.

**Acceptance criteria:** P0 tidak boleh release tanpa evidence terpisah untuk
build/test, API/DB, browser E2E, cross-app E2E, security, accessibility,
observability, migration, rollback, dan staging runtime.

### 7.7 P1 — Scale, growth, dan integrations

P1 mencakup:

- Promo/campaign/ads dengan eligibility, budget, funding owner, stacking,
  redemption, expiry, dan settlement impact.
- Reports/analytics/customer insight dengan metric definition, freshness,
  outlet/timezone filter, drill-down, export governance, dan privacy.
- POS/KDS/printer/payment/webhook integration center dengan health, retry,
  replay protection, versioning, secret rotation, dan conflict resolution.
- Food compliance, document expiry, quality score, appeal, enforcement, dan
  support escalation.
- Help center, merchant academy, ticket, release notes, status incident, dan
  contextual guidance.
- CRM/retention/controlled experiment hanya jika consent, aggregate data,
  suppression, frequency cap, audit, dan kill switch tersedia.

P1 tidak boleh mengubah atau menggantikan source of truth P0.

### 7.8 P2 — Enterprise dan ecosystem

P2 mencakup:

- Hierarki group → brand → legal entity → outlet dan multi-market policy.
- Inventory/procurement/waste/kitchen capacity bila authoritative inventory
  source dan concurrency rule sudah tersedia.
- Accounting/tax ecosystem dengan schema version, period close, restatement,
  approval, dan reconciliation.
- Public API/partner ecosystem dengan OAuth/scoped key, quota, webhook,
  sandbox, certification, deprecation, dan incident process.

## 8. Canonical state dan ownership

PRD menggunakan contract yang sudah tersedia sebagai sumber aturan teknis:

| Domain | Source of truth | Contract/reference |
|---|---|---|
| Onboarding/KYB/activation | `merchant-service` + lifecycle database; review privileged oleh `admin-service` | [`merchant-onboarding-2026.md`](../contracts/merchant-onboarding-2026.md) |
| Branch/staff/device/RBAC | `merchant-service` + branch/session tables | [`merchant-branch-staff-rbac-2026.md`](../contracts/merchant-branch-staff-rbac-2026.md) |
| Operating state | `merchants.operating_state` + versioned event | [`merchant-operating-state-2026.md`](../contracts/merchant-operating-state-2026.md) |
| Catalog/menu/modifier | `merchant-service` + catalog version/event outbox | [`merchant-catalog-governance-2026.md`](../contracts/merchant-catalog-governance-2026.md) |
| Order lifecycle | `order-service` canonical order state | [`order-state-contract-2026.md`](../contracts/order-state-contract-2026.md) |
| Money/ledger | finance ledger; typed payment balance projection | [`payment-balance-ledger-2026.md`](../contracts/payment-balance-ledger-2026.md) |
| Settlement/payout | merchant/finance ownership sesuai provider contract | wajib dibuat detail sebelum live payout |
| Notification/realtime | event/outbox + notification delivery ownership | wajib dibuat contract sebelum P0 realtime |
| Promo/quality/review | merchant/ads/order ownership sesuai capability | wajib dipetakan ke service dan DB sebelum P1 |

Aturan penting: portal tidak membuat sumber kebenaran kedua. Bila endpoint
lama memakai field legacy, adapter boleh dipakai selama mapping canonical,
version, compatibility, dan deprecation tercatat.

## 9. Role dan permission matrix awal

`—` berarti tidak boleh, bukan berarti tombol sekadar disembunyikan.

| Capability | Owner | Manager | Cashier | Kitchen | Finance | Read-only support |
|---|---:|---:|---:|---:|---:|---:|
| Lihat dashboard outlet | Semua scope | Outlet assigned | Outlet assigned | Outlet assigned | Scope assigned | Read |
| Buka/jeda/busy outlet | Ya | Ya, assigned | Policy-limited | — | — | Override terpisah |
| Terima/tolak order | Ya | Ya | Ya | Policy-limited | — | Read |
| Ubah item unavailable | Ya | Ya | Ya | Ya | — | Read |
| Publish/menu moderation | Owner/approved | Policy-limited | — | — | — | Read |
| Kelola staff/permission | Ya | Scope-limited | — | — | — | — |
| Lihat finance/settlement | Ya | Policy-limited | — | — | Ya | Masked read |
| Refund/compensation | Threshold/approval | Threshold/approval | Policy-limited | — | Policy-limited | Escalate |
| Ubah bank/payout | Step-up + approval | — | — | — | Step-up + approval | — |
| Export data | Ya | Scope-limited | Policy-limited | — | Ya | Masked/approved |

Matrix final harus mengikuti permission server dan market policy. Role baru
tidak boleh dibuat hanya untuk menyelesaikan kebutuhan satu halaman.

## 10. UX dan state requirements

Semua halaman P0 harus memiliki state berikut jika relevan:

- initial loading dan skeleton yang tidak menipu sebagai data nyata;
- empty state dengan next action;
- error terklasifikasi dan retry yang aman;
- stale/syncing/offline state dengan freshness;
- permission denied dan verification required;
- session expired dan re-authentication;
- duplicate command/in-flight state;
- partial success dan per-object error untuk bulk action;
- maintenance/provider unavailable;
- responsive layout, keyboard navigation, focus, contrast, zoom, reduced
  motion, dan text scaling.

Copy untuk merchant harus menggunakan bahasa bisnis yang jelas. Jangan
menampilkan istilah internal seperti nama service, tabel, backend, token,
worker, atau status teknis yang tidak bermakna bagi merchant.

## 11. Analytics dan measurement plan

Event analytics hanya boleh mengandung identifier pseudonymous, scope non-PII,
feature, result, latency bucket, dan correlation ID yang disetujui.

### Leading metrics

- login-to-first-action completion;
- waktu dari order masuk sampai accept/reject;
- order acceptance rate;
- prep-time adherence;
- item unavailable rate;
- incident/refund resolution time;
- menu publish success rate;
- staff invite/activation success;
- report/export success;
- notification delivery and acknowledgement;
- error, stale-data, reconnect, dan duplicate-command rate.

### Lagging metrics

- merchant activation dan 30/90-day retention;
- order completion dan cancellation/refund rate;
- gross-to-net reconciliation exception rate;
- support contact rate per active merchant;
- payout dispute rate;
- repeat order/customer retention pada merchant;
- adoption multi-outlet dan staff delegation;
- production incident severity dan recovery time.

Setiap metric harus memiliki definisi, query/source, owner, timezone,
aggregation window, privacy class, dan target/threshold yang disetujui.

## 12. Security, privacy, dan compliance baseline

- Auth/session: secure cookie atau mekanisme equivalent yang disetujui security,
  refresh rotation, revoke, device/session visibility, OTP/MFA, CSRF defense,
  rate limit, anti-enumeration, dan secure logout.
- Authorization: tenant/outlet object-level authorization pada setiap read dan
  write; frontend hide bukan security control.
- Financial: maker-checker/step-up untuk rekening, payout, refund, dan export
  sensitif; idempotency dan immutable audit.
- Data: masking PII, minimisasi contact/customer data, retention/deletion,
  private document URL, encryption, access log, dan redaction.
- Upload: allowlist MIME/size/dimension, filename normalization, virus scan,
  storage isolation, signed URL expiry, dan content moderation bila relevan.
- Abuse: brute force, replay, duplicate command, cross-tenant IDOR, XSS/CSRF,
  CSV injection, webhook spoofing, and privilege escalation test.
- Compliance: legal/finance/security owner menentukan market policy, tax,
  food document, privacy notice, retention, and consent sebelum public launch.

## 13. Rollout dan delivery phases

### Phase 0 — Contract and proof preparation

- Finalisasi PRD, open questions, capability matrix, role matrix, state/event
  mapping, data dictionary, and API/error contract.
- Pastikan contract onboarding, RBAC, operating state, catalog, order, dan
  payment yang ada direferensikan; buat contract tambahan untuk settlement,
  notification/realtime, promo, review/quality bila diperlukan.
- Siapkan disposable merchant, customer, courier, staff, bank/payout fixture,
  dan observability dashboard tanpa credential/PII nyata.

### Phase 1 — P0 implementation

- Implement shell/context, dashboard, order, catalog, outlet, staff, finance,
  issue, notification/recovery, and security/accessibility.
- Setiap increment harus menyertakan API/DB tests dan browser tests sesuai
  requirement ID.

### Phase 2 — Closed UAT dan staging gate

- Jalankan cross-app E2E Customer → Merchant → Courier → settlement.
- Jalankan negative authorization, failure/recovery, reconciliation, migration,
  rollback, security, accessibility, dan performance evidence.
- Perbaiki seluruh P0 `FAIL`/`PARTIAL`; jangan mempromosikan capability yang
  hanya lewat mock atau screenshot.

### Phase 3 — P1/P2 bertahap

- P1 hanya dimulai setelah P0 release gate lulus.
- P2 membutuhkan business case, provider/data owner, legal/finance review,
  serta capacity dan operating model yang jelas.

## 14. Dependencies

- Merchant onboarding lifecycle dan Admin review.
- Merchant branch/staff/device RBAC.
- Merchant operating state dan schedule worker.
- Catalog governance, moderation, inventory/availability, dan search feed.
- Canonical order state dan food order transitions.
- Payment provider, finance ledger, settlement, payout, tax/invoice.
- Event outbox/notification/realtime delivery.
- Customer Android, Merchant Android, Courier Android, Admin, API Gateway,
  database migrations, Docker staging, CI security gates, dan observability.

## 15. Open questions sebelum implementation lock

Pertanyaan berikut harus dijawab oleh owner yang tercantum sebelum requirement
terkait dianggap locked.

| ID | Pertanyaan | Owner | Blocking |
|---|---|---|---|
| OQ-001 | Apakah merchant perorangan boleh login Portal Mitra atau selalu ke Android? | Product | P0 access |
| OQ-002 | Role final dan permission threshold untuk refund/payout/export seperti apa? | Product + Security + Finance | P0 RBAC/finance |
| OQ-003 | Provider payment/payout mana yang dianggap live untuk market pertama? | Finance + Engineering | P0 finance |
| OQ-004 | Settlement cadence, tax/invoice policy, timezone, dan currency per market? | Finance + Legal | P0 finance |
| OQ-005 | Apakah substitution memerlukan approval customer pada semua channel? | Product + Legal/Support | P0 order |
| OQ-006 | Channel realtime utama: websocket, SSE, push, atau kombinasi? | Engineering | P0 realtime |
| OQ-007 | SLA accept/prep/pickup dan escalation owner untuk tiap service area? | Operations | P0 order |
| OQ-008 | Integrasi POS/KDS/printer mana yang benar-benar masuk P1? | Product + Engineering | P1 integration |
| OQ-009 | Market/regional compliance dan food document apa yang wajib untuk launch? | Legal + Operations | P0 compliance |
| OQ-010 | KPI target final dan sumber baseline staging/UAT? | Product + Data | P0 measurement |

Jika keputusan belum tersedia, implementasi harus fail-closed pada capability
tersebut dan tidak boleh mengarang policy di frontend.

## 16. Traceability ke task dan contract

| PRD area | Backlog | Contract utama |
|---|---|---|
| Access/onboarding | `MWEB-P0-006`, `MWEB-P0-007`, `MWEB-PORTAL-P0-001` | onboarding, RBAC |
| Dashboard/outlet state | `MWEB-PORTAL-P0-002`, `MWEB-PORTAL-P0-005` | operating state |
| Order/issue/refund | `MWEB-PORTAL-P0-003`, `MWEB-PORTAL-P0-008` | order state, payment/ledger |
| Catalog/menu | `MWEB-PORTAL-P0-004` | catalog governance |
| Staff | `MWEB-PORTAL-P0-006` | branch/staff RBAC |
| Finance/payout | `MWEB-PORTAL-P0-007` | payment ledger + settlement contract to be completed |
| Realtime/recovery | `MWEB-PORTAL-P0-009` | notification/realtime contract to be completed |
| Release proof | `MWEB-PORTAL-P0-010` | all applicable contracts |
| Growth/integration | `MWEB-PORTAL-P1-001..P1-006` | promo, quality, integration contracts to be mapped |
| Enterprise | `MWEB-PORTAL-P2-001..P2-004` | market, accounting, API partner contracts to be defined |

## 17. Definition of Done PRD

PRD ini dianggap siap menjadi acuan implementasi bila:

- Product owner menyetujui problem, goals, non-goals, personas, scope, dan
  prioritization.
- Engineering menyetujui ownership, dependencies, canonical state, contract
  gaps, migration constraints, observability, dan rollback requirements.
- Design memetakan P0 requirements ke Figma flow, responsive states, copy,
  accessibility, dan component/token TEMBUS.
- Security/privacy menyetujui session, RBAC/ABAC, PII, upload, audit,
  retention, abuse cases, dan high-risk approval.
- Finance/legal menyetujui money, payout, tax/invoice, refund, campaign
  funding, market policy, dan compliance yang masuk scope.
- Data/operations menyetujui metric definition, freshness, SLA, alert,
  support escalation, dan runbook.
- Setiap requirement P0 memiliki trace ke task, contract, test plan, dan
  evidence path.

Setelah PRD disetujui, implementasi tetap berjalan per TASK-ID dan tidak boleh
menandai task complete hanya karena route, endpoint, migration, atau mock sudah
ada.

## 18. Cara menggunakan PRD dan backlog

PRD ini menjadi konteks produk; backlog menjadi unit eksekusi. Instruksi kerja
berikut berlaku untuk setiap pengerjaan berikutnya:

1. Sebutkan `TASK-ID` yang ingin dikerjakan, atau sebutkan area PRD bila task
   baru belum ada.
2. Sebelum coding, agent wajib membaca requirement PRD terkait, dependency,
   contract lintas service, dan bukti task sebelumnya yang relevan.
3. Implementasi harus memakai source of truth yang sudah ada. Data, status,
   nominal, permission, dan keberhasilan tidak boleh dibuat dari mock atau
   hardcode pada flow nyata.
4. Setiap task dikerjakan sampai semua pekerjaan lokal yang masih actionable
   selesai. Status `PARTIAL` bukan alasan untuk pindah ke task dependan.
5. Setiap task harus memiliki evidence di `docs/task-evidence/` yang mencatat
   implementasi, command/tool verifikasi, hasil aktual, batasan, dan sisa
   requirement.
6. Perubahan implementation maupun dokumentasi yang diminta untuk staging
   harus di-commit dan di-push ke branch `staging`. Push branch tidak otomatis
   berarti deployment, migrasi, CI, atau UAT staging sudah berhasil.
7. Task hanya boleh disebut `COMPLETE` setelah implementation, integration,
   tests, security/privacy, observability, rollback/recovery, dan bukti runtime
   yang relevan lulus. Jika ada dependency eksternal, tuliskan blocker dan
   langkah unblock yang spesifik.

Format instruksi yang direkomendasikan:

> Kerjakan `MWEB-PORTAL-P0-003` sesuai PRD Portal Mitra. Fokus pada [scope],
> verifikasi [scenario], lalu push ke `staging` dan laporkan evidence.

## 19. Referensi internal

- [Merchant Web Growth, Trust & Operational Readiness P0–P2](../../task-merchant-web-growth-p0-p2-2026.md)
- [Merchant onboarding contract](../contracts/merchant-onboarding-2026.md)
- [Merchant branch/staff RBAC contract](../contracts/merchant-branch-staff-rbac-2026.md)
- [Merchant operating state contract](../contracts/merchant-operating-state-2026.md)
- [Merchant catalog governance contract](../contracts/merchant-catalog-governance-2026.md)
- [Canonical order state contract](../contracts/order-state-contract-2026.md)
- [Payment balance and liability ledger contract](../contracts/payment-balance-ledger-2026.md)
