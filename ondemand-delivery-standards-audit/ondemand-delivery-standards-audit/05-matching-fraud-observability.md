# Matching Algorithm, Fraud Handling, Notification, & Observability

---

## A. Matching Algorithm — Jantung Bisnis Logistik

Ini bagian yang paling sering diremehkan karena "gak kelihatan" di UI,
tapi paling menentukan kualitas layanan.

### A.1 Strategi Pencarian Kurir

| Aspek | Pertanyaan yang Harus Dijawab Kode | Rekomendasi Standar |
|---|---|---|
| Radius pencarian awal | Berapa km radius awal cari kurir terdekat? | Mulai kecil (1-2km), expand otomatis tiap beberapa detik kalau belum ada yang accept |
| Urutan penawaran | Order ditawarkan ke 1 kurir dulu (sequential) atau ke beberapa sekaligus (broadcast)? | Sequential ke kurir terdekat lebih simpel; broadcast lebih cepat match tapi butuh locking mechanism biar gak double-accept |
| Locking saat ditawarkan | Apakah kurir lain di radius yang sama bisa ditawari order lain dulu sementara 1 kurir masih mikir? | Idealnya order yang sedang `OFFERED` ke kurir A tetap available ditawarkan ke kurir B kalau pakai broadcast — tapi harus ada distributed lock di backend supaya gak 2 kurir accept order yang sama bersamaan (race condition) |
| Fairness distribusi | Apakah kurir yang baru online dapat order, atau selalu kurir yang sama (paling dekat) yang keterusan dapat? | Pertimbangkan scoring gabungan: jarak + idle time (kurir yang lebih lama nunggu diprioritaskan sedikit) — supaya gak ada kurir yang "kebanjiran" order sementara yang lain nganggur terus |
| Fallback kalau radius awal kosong | Apa yang terjadi kalau gak ada kurir online di radius manapun? | Order masuk status `NO_DRIVER_FOUND`, customer diberi opsi tunggu/naikkan tarif/cancel — sudah disebut di file 01, pastikan backend-nya benar2 ada retry loop, bukan dead silence |
| Rating minimum kurir untuk ditawari | Apakah kurir rating rendah tetap dapat order normal, atau dibatasi? | Pertimbangkan threshold (misal rating < 4.0 dapat order lebih sedikit / harus ikut program perbaikan) |

### A.2 Hal yang Wajib Dicek di Backend (Go/Fiber)

- Apakah ada **race condition protection** saat 2 kurir tap accept
  bersamaan untuk order yang sama? (idealnya pakai DB transaction dengan
  `SELECT ... FOR UPDATE`, atau Redis distributed lock)
- Apakah algoritma matching berjalan sebagai **background job/worker**
  (bukan blocking di request handler), supaya gak nge-block API customer
  saat sedang cari kurir?
- Apakah ada **circuit breaker** kalau service matching down — order
  gak boleh stuck selamanya di status `SEARCHING_DRIVER` tanpa timeout.

---

## B. Fraud & Abuse Handling

Model 3-pihak (customer-kurir-platform) dengan insentif finansial selalu
punya celah fraud. Berikut vector yang harus diantisipasi:

### B.1 Fraud dari Sisi Kurir

| Jenis Fraud | Cara Deteksi | Mitigasi UX/Sistem |
|---|---|---|
| GPS spoofing (fake location) | Deteksi mock location API di Android/iOS, cek konsistensi speed (kalau lokasi "lompat" terlalu jauh dalam waktu terlalu singkat) | Block akun, minta verifikasi ulang |
| Delivery fiktif (tap "selesai" tanpa benar-benar antar) | Cross-check GPS kurir vs koordinat titik antar saat status `DELIVERED` di-trigger — kalau jarak masih jauh, flag untuk review manual | Wajib foto/OTP delivery (sudah ada di file 02) + validasi GPS proximity sebelum tombol "Selesai" aktif |
| Kolusi kurir-customer (order fiktif untuk farming insentif) | Pattern detection: order berulang antar 2 akun yang sama dengan rute pendek/aneh dalam frekuensi tinggi | Rate limit & flagging otomatis untuk review tim fraud/ops |
| Multi-akun kurir (1 orang, banyak device/akun untuk hindari suspend) | Device fingerprinting, cek kesamaan dokumen KYC | Verifikasi dokumen unik per akun |

### B.2 Fraud dari Sisi Customer

| Jenis Fraud | Cara Deteksi | Mitigasi |
|---|---|---|
| Promo abuse (akun ganda untuk klaim voucher new-user berulang) | Device ID + nomor HP + verifikasi unik, deteksi pola registrasi massal dari device/IP yang sama | Limit klaim promo per device/nomor, bukan cuma per akun |
| False claim "barang tidak diterima" untuk refund | Cross-check foto/OTP proof of delivery sebelum approve refund | Refund manual review kalau ada proof of delivery valid, bukan auto-approve |
| Chargeback/payment fraud | Tergantung payment gateway, tapi pastikan ada reconciliation harian antara status pembayaran di gateway vs status order |

### B.3 Fraud/Manipulasi Rating & Review

| Jenis | Mitigasi |
|---|---|
| Rating dipaksa oleh kurir (intimidasi soft ke customer minta bintang 5) | Anonymous reporting channel terpisah dari rating biasa |
| Review/rating bot atau manipulasi massal | Hanya order yang benar-benar `COMPLETED` boleh kasih rating, 1 rating per order |

**Catatan untuk audit**: cek apakah sistem fraud detection ini sudah ada
sebagai *rule-based flagging* minimal (bukan harus ML dulu di tahap awal
— rule-based sudah cukup untuk early stage <50 order/hari seperti
kondisi Tembus sekarang). Yang penting ada **flag/alert ke admin**, bukan
sistem yang buta total terhadap pola anomali.

---

## C. Notification & Communication Architecture

### C.1 Push Notification

| Aspek | Rekomendasi |
|---|---|
| Provider | FCM (Android) + APNs (iOS) — pastikan ada fallback kalau salah satu down |
| Kategori notifikasi | Transactional (status order — harus selalu terkirim, prioritas tinggi) vs Marketing (promo — bisa di-skip kalau user opt-out) |
| Retry mechanism | Kalau push gagal terkirim (device offline), apakah ada fallback ke in-app notification center saat user buka app lagi? |
| Notification center in-app | List riwayat notifikasi tersimpan, bukan cuma push yang hilang begitu di-dismiss |
| Deep linking | Tap notifikasi "Kurir tiba" harus langsung buka screen tracking order terkait, bukan cuma buka halaman home |

### C.2 In-App Customer Support (Customer App)

Ini gap yang disebut sebelumnya — belum ada di file 01:

| Fitur | Prioritas | Feature Flag? |
|---|---|---|
| FAQ/Help Center in-app | MUST | Tidak perlu |
| Live chat ke CS (atau minimal WhatsApp deep link) | MUST | `feature_live_chat_cs` |
| Status tiket komplain yang pernah diajukan customer | SHOULD | Tidak perlu |
| "Lapor masalah" langsung dari detail order (bukan harus cari menu CS terpisah) | MUST | Tidak perlu |

---

## D. Onboarding & First-Time User Experience

| Fitur | Prioritas | Detail UX |
|---|---|---|
| Permission request dengan konteks (bukan native prompt mentah duluan) | MUST | Tampilkan screen edukasi "Kenapa kami butuh lokasi kamu" SEBELUM native system prompt muncul — meningkatkan grant rate signifikan |
| Walkthrough/tutorial ringan (3-4 slide max) | SHOULD | `feature_onboarding_tutorial` — bisa di-skip, jangan blocking |
| Empty state halaman utama sebelum order pertama | MUST | CTA jelas "Buat order pertama", bukan halaman kosong |
| Progressive permission request | MUST | Jangan minta semua permission (lokasi+notifikasi+kamera) sekaligus di awal — minta saat fitur terkait benar-benar dibutuhkan |

---

## E. API Versioning & Backward Compatibility

Krusial karena Tembus punya 4 client (Android, iOS, web admin, web
customer) yang rilis updatenya gak akan pernah serentak.

| Aspek | Rekomendasi |
|---|---|
| Strategi versioning | URL-based (`/v1/orders`) atau header-based (`Accept-Version`) — pilih satu, konsisten di semua endpoint |
| Breaking change policy | Endpoint lama tetap hidup minimal X minggu setelah versi baru rilis, supaya user yang belum update app gak langsung error |
| Force update mechanism | Sudah disebut sebagai flag di file 01 — pastikan ada juga "soft update" (notif non-blocking "ada versi baru") sebelum eskalasi ke force update |
| Field deprecation | Tandai field API yang akan dihapus dengan jelas di dokumentasi internal, jangan hapus langsung tanpa transisi |

---

## F. Observability & Monitoring

Beda dari security — ini soal **tahu sistem sehat atau gak tanpa nunggu
komplain user.**

### F.1 Structured Logging

- Apakah log backend pakai format terstruktur (JSON) dengan `request_id`/
  `order_id`/`user_id` konsisten di semua service, supaya bisa di-trace
  end-to-end satu order dari customer app → backend → courier app?
- Apakah ada log level yang jelas (debug/info/warn/error), bukan semua
  pakai `print`/`fmt.Println` mentah?

### F.2 Error Tracking

- Apakah ada tool seperti Sentry/Bugsnag terpasang di mobile app (Kotlin/
  Swift) dan backend (Go)? Crash di kurir app yang gak ke-track = lo gak
  akan pernah tahu kenapa kurir tiba-tiba banyak yang offline.

### F.3 Business/Operational Metrics (SLA Monitoring)

| Metrik | Kenapa Penting |
|---|---|
| Rata-rata waktu `SEARCHING_DRIVER` → `DRIVER_ASSIGNED` | Indikator kesehatan supply kurir real-time |
| % order yang masuk `NO_DRIVER_FOUND` | Kalau tinggi, ada masalah supply/area coverage |
| Rata-rata waktu pickup → delivery vs estimasi | Akurasi ETA yang ditampilkan ke customer |
| % order cancelled (by customer vs by driver vs by system) | Breakdown ini penting — cancel by driver tinggi = masalah di matching/insentif |
| Crash-free session rate (mobile) | Standar industri minimal >99% |
| API latency p50/p95/p99 per endpoint | Endpoint lambat = UX jelek meski semua fitur "ada" |

### F.4 Alerting

- Apakah ada alert otomatis (Slack/Telegram/email) kalau metrik di atas
  keluar dari threshold normal? Misal: kalau >10% order masuk
  `NO_DRIVER_FOUND` dalam 1 jam terakhir, ops harus tau **sebelum**
  customer ramai komplain di social media.

---

## G. Cek Tambahan untuk Laporan Audit

Tambahkan baris ini ke tabel skor di `04-uiux-detail.md` bagian C:

| Domain | Total Item |
|---|---|
| Matching Algorithm | 6 |
| Fraud & Abuse Handling | 9 |
| Notification & CS | 8 |
| Onboarding | 4 |
| API Versioning | 4 |
| Observability | sesuai jumlah metrik yang dicek |
