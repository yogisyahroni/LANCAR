# Admin Web Dashboard — Spesifikasi Flow & Fitur Detail

---

## A. Struktur Navigasi (Information Architecture)

Best practice: sidebar navigation dengan grouping per fungsi, bukan flat
menu. Standar dashboard ops (mirip pattern internal tools Gojek/Grab Ops):

```
├── Dashboard (overview real-time)
├── Operasional
│   ├── Live Map & Order Monitoring
│   ├── Order Management (list, detail, manual assign)
│   └── Dispute & Complaint Queue
├── Mitra (Driver Management)
│   ├── Verifikasi Mitra Baru (KYC queue)
│   ├── Daftar Mitra Aktif
│   └── Suspend/Banned List
├── Customer
│   ├── Daftar Customer
│   └── Customer Support Tools
├── Finance
│   ├── Reconciliation Dashboard
│   ├── Payout Mitra
│   └── Refund & Adjustment
├── Pricing & Promo
│   ├── Konfigurasi Tarif
│   ├── Promo/Voucher Management
│   └── Surge Pricing Rules
├── Feature Flags & Config
│   └── Toggle fitur per environment/kota
└── Reports & Analytics
```

---

## B. Fitur Detail per Modul

### B.1 Dashboard Overview

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Live counter: order aktif, kurir online, order completed hari ini | MUST | Tidak perlu | Card metric di atas, update tiap beberapa detik via WebSocket/polling |
| Grafik tren order per jam/hari | SHOULD | Tidak perlu | Line/bar chart, bantu ops lihat pola demand |
| Alert panel (kurir offline mendadak banyak, order stuck) | SHOULD | `feature_ops_alerts` | Notifikasi otomatis kalau ada anomali (misal order > 10 menit masih `SEARCHING_DRIVER`) |

### B.2 Live Map & Order Monitoring

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Map dengan semua kurir aktif (cluster kalau terlalu banyak marker) | MUST | Tidak perlu | Marker warna beda per status (idle/on-order) |
| Klik order → detail panel slide-in (bukan halaman baru) | MUST | Tidak perlu | Ops butuh konteks cepat tanpa kehilangan view map |
| Manual assign kurir ke order | MUST | Tidak perlu | Untuk kasus auto-matching gagal/edge case, dengan log siapa yang assign manual & alasan |
| Filter by status/area/kurir | MUST | Tidak perlu | Filter bar di atas map |

### B.3 Order Management

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| List order dengan search & filter lengkap | MUST | Tidak perlu | Filter: status, tanggal, area, customer, kurir |
| Detail order: full timeline status + foto pickup/delivery | MUST | Tidak perlu | Timeline vertikal dengan timestamp tiap transisi — penting untuk dispute investigation |
| Force cancel/refund dari admin | MUST | Tidak perlu | Dengan reason wajib diisi + audit log otomatis |
| Export order data (CSV) | SHOULD | Tidak perlu | Untuk laporan eksternal/akuntansi |

### B.4 Dispute & Complaint Queue

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Queue dengan prioritas (SLA timer visible) | MUST | Tidak perlu | Tiket lebih dari X jam tanpa respon di-highlight merah |
| Linked ke detail order otomatis (foto POD, chat history) | MUST | Tidak perlu | Admin gak perlu pindah-pindah tab cari konteks |
| Status tiket: open/in_progress/resolved/escalated | MUST | Tidak perlu | |
| Template respon cepat | NICE | `feature_cs_templates` | Mempercepat handling komplain repetitif |

### B.5 Verifikasi Mitra (Driver KYC)

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Queue dokumen pending (KTP, SIM, STNK, foto kendaraan) | MUST | Tidak perlu | Preview dokumen langsung di panel, jangan harus download dulu |
| Approve/reject dengan reason | MUST | Tidak perlu | Reject harus kasih alasan jelas yang otomatis terkirim ke kurir (notifikasi apa yang harus diperbaiki) |
| Background check status (kalau ada integrasi pihak ketiga) | NICE | `feature_background_check` | |
| Re-verification berkala (SIM/STNK expired) | SHOULD | `feature_periodic_reverification` | Reminder otomatis sebelum dokumen expired |

### B.6 Finance — Reconciliation

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Dashboard margin platform (20%) vs payout mitra (80%) per periode | MUST | Tidak perlu | Sesuai formula pricing lo — harus match persis antara apa yang ditagih customer & yang dibayar ke kurir |
| Reconciliation COD (cash collection tracking) | MUST jika ada COD | Tidak perlu | Kurir input cash diterima, sistem cocokkan dengan expected amount |
| Infra cost allocation tracking (Rp1.500/order) | SHOULD | Tidak perlu | Visibility kemana cost ini terpakai (server, OTP Zenziva, maps API) |
| Export laporan finance (CSV/Excel) | MUST | Tidak perlu | |
| Audit log semua manual adjustment | MUST | Tidak perlu | Siapa, kapan, kenapa — wajib untuk akuntabilitas finansial |

### B.7 Pricing & Promo Configuration

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Form konfigurasi base fare/distance fare per kota | MUST | Tidak perlu | **Jangan hardcode di backend** — harus configurable dari admin tanpa deploy |
| Surge pricing rules (multiplier berdasarkan demand) | SHOULD | `pricing_surge_multiplier_enabled` | Kill-switch wajib ada kalau surge bermasalah |
| Promo/voucher builder (persentase/nominal, syarat min order, kuota) | SHOULD | `feature_promo` | |
| Preview kalkulasi harga sebelum publish perubahan tarif | SHOULD | Tidak perlu | Mencegah typo config yang langsung berdampak ke seluruh order live |

### B.8 Feature Flag Management

| Fitur | Prioritas | Detail UX |
|---|---|---|
| Toggle on/off per environment (dev/staging/prod) | MUST | |
| Toggle per kota/region (rollout bertahap) | SHOULD | Relevan kalau Tembus mau ekspansi kota bertahap |
| Percentage rollout (A/B test) | NICE | |
| History perubahan flag (siapa ubah, kapan) | MUST | Audit trail — flag yang salah toggle bisa bikin outage |

### B.9 Role-Based Access Control

| Role Contoh | Akses |
|---|---|
| Super Admin | Semua modul |
| Ops | Live map, order management, dispute queue — tidak bisa ubah pricing/finance |
| Finance | Reconciliation, payout, refund — tidak bisa lihat live map ops |
| Customer Support | Dispute queue, customer detail — tidak bisa ubah pricing |
| Read-only/Viewer | Dashboard & reports only (untuk co-founder yang butuh visibility tanpa akses edit) |

**Cek di codebase**: apakah RBAC ini benar-benar enforced di level API
(backend check role di setiap endpoint), bukan cuma hide/show di frontend
React. Frontend-only RBAC adalah **security hole serius** — siapapun yang
tahu endpoint bisa bypass via curl/Postman kalau backend gak validasi role.
