# TASK: Perbaikan Flow Mobile Apps Kurir

Tanggal audit: 2026-06-02
Area: `android-app` / TEMBUS Courier App
Status awal: cukup baik untuk MVP/staging, tetapi belum cukup rapi untuk standar enterprise field operations.

## Ringkasan Penilaian

Flow kurir saat ini sudah punya pondasi operasional yang kuat:

- Login, session, online/offline duty, FCM, sync order, update app, dan lokasi sudah tersedia.
- On-demand courier sudah punya flow utama: tawaran order, terima order, navigasi pickup, scan/foto pickup, antar, POD, selesai.
- Ada support operasional: chat, telepon, SOS, cancel pickup, pending sync, dan offline Room cache.
- Ada verifikasi pickup ganda lewat scan dan foto.

Kekurangan utama:

- Flow on-demand jauh lebih matang daripada flow regular.
- Detail order masih terasa sebagai kumpulan tombol, bukan step-by-step guided workflow.
- State navigasi dan verifikasi pickup masih terlalu banyak disimpan sebagai local UI state.
- Permission, update dialog, dan modal tawaran order perlu dibuat lebih kontekstual.
- Exception flow lapangan belum cukup lengkap: penerima tidak ada, alamat salah, paket rusak, jadwal ulang, return-to-hub, gagal antar.
- UI enterprise polish masih perlu dirapikan: CTA utama, visual hierarchy, empty/error/offline state, copywriting, dan konsistensi design system.

## Prinsip Implementasi

- Jangan mengubah fitur inti yang sudah berjalan tanpa kebutuhan kontrak yang jelas.
- Setiap order status harus punya satu "Next Best Action" utama.
- Kurir tidak boleh dipaksa memilih status teknis jika sistem bisa memandu tahap berikutnya.
- Semua progress penting harus survive app restart, process death, dan mode offline.
- UI harus jujur: jika data belum tersedia, tampilkan empty/error/stale state, bukan fallback palsu.
- Backend tetap menjadi sumber kebenaran untuk status transition, radius validasi, proof requirement, cancel reason, payout, dan route.

## P0 - Flow Operasional Utama

### [x] KURIR-FLOW-001: Definisikan state machine kurir end-to-end

Masalah:
Status order saat ini sudah ada, tetapi UI belum sepenuhnya menjadikan status sebagai state machine yang memandu aksi kurir.

Target:
Buat matriks state machine untuk regular dan on-demand courier.

State minimal:

- `pending_offer`
- `assigned`
- `going_to_pickup`
- `arrived_at_pickup`
- `pickup_scan_required`
- `pickup_photo_required`
- `pickup_verified`
- `in_transit`
- `arrived_at_dropoff`
- `delivery_pod_required`
- `delivered`
- `failed`
- `cancel_requested`
- `cancelled`
- `return_to_hub`

Output yang harus dibuat:

- Dokumentasi state machine di `docs/courier-flow-state-machine.md`.
- Mapping status backend ke stage UI.
- Mapping stage UI ke CTA utama.
- Mapping exception flow per stage.

Affected area:

- `android-app/app/src/main/java/com/tembus/courier/ui/screens/MainScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/OrderDetailScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/OrderViewModel.kt`
- Backend status transition policy jika kontrak belum cukup.

Acceptance criteria:

- Setiap status order punya satu stage UI yang jelas.
- Setiap stage punya maksimal satu primary CTA.
- Secondary action hanya untuk support: chat, telepon, navigasi, SOS, cancel/report issue.
- Tidak ada status teknis yang dipilih manual oleh kurir jika bisa digantikan dengan CTA berbasis tahap.

Verification:

- Unit test mapper status ke courier stage.
- Manual QA untuk flow on-demand dan regular.
- `android-app ./gradlew :app:assembleDebug`.

### [x] KURIR-FLOW-002: Buat "Next Best Action" pada detail order

Masalah:
Detail order masih menampilkan banyak aksi bersamaan. Ini membuat kurir harus memutuskan sendiri langkah yang benar.

Target:
Order detail harus menampilkan satu CTA utama berdasarkan stage saat ini.

Contoh CTA:

- `Terima Order`
- `Mulai Navigasi Pickup`
- `Saya Sudah di Pickup`
- `Scan Paket`
- `Foto Barang`
- `Mulai Antar`
- `Saya Sudah di Tujuan`
- `Upload Bukti Terima`
- `Selesaikan Pengiriman`

Affected area:

- `OrderDetailScreen.kt`
- `MainScreen.kt`
- `OrderViewModel.kt`

Acceptance criteria:

- CTA utama selalu terlihat di area bawah layar.
- CTA utama berubah otomatis setelah tahap selesai.
- Tombol lain tidak bersaing secara visual dengan CTA utama.
- Status dialog manual hanya tersedia untuk admin/debug atau fallback yang benar-benar diperlukan.

Verification:

- Screenshot QA untuk setiap stage.
- Test mapping CTA.
- Manual test back navigation dari scan, POD, chat, dan cancel dialog.

### [x] KURIR-FLOW-003: Samakan kualitas regular flow dengan on-demand flow

Masalah:
On-demand sudah punya guided pickup/delivery flow. Regular masih lebih generik dan terasa manual.

Target:
Regular courier juga memakai stepper dan CTA berbasis tahap.

Minimum flow regular:

1. Order diterima.
2. Navigasi ke pickup/gudang/customer.
3. Scan paket.
4. Foto pickup jika policy mewajibkan.
5. Mulai antar.
6. Navigasi ke penerima.
7. Upload POD.
8. Selesai.

Affected area:

- `OrderDetailScreen.kt`
- `OrderScreen.kt`
- `OrderViewModel.kt`
- Status transition policy backend.

Acceptance criteria:

- Regular courier tidak lagi hanya melihat "Perbarui Status Pesanan" sebagai aksi utama.
- Regular dan on-demand memakai bahasa UI yang konsisten.
- Proof requirement tetap mengikuti policy backend.

Verification:

- Manual QA regular order dari assigned sampai delivered.
- Test status transition policy regular.

## P0 - Persistence, Offline, dan Sync Safety

### [x] KURIR-FLOW-004: Persist progress verifikasi pickup secara kuat

Masalah:
Saat ini ada progress pickup scan dan pickup photo yang sebagian ditahan di UI local state. Jika app restart di tengah proses, pengalaman bisa desync.

Target:
Progress scan/foto pickup harus tersimpan di Room dan tersinkron ke backend.

Data minimal:

- `pickupScanVerified`
- `pickupPhotoVerified`
- `pickupScanSyncedAt`
- `pickupPhotoSyncedAt`
- `pickupScanLocation`
- `pickupPhotoLocation`
- `pickupEvidenceUpdatedAt`

Affected area:

- `MainScreen.kt`
- `OrderRepository.kt`
- `OrderDao.kt`
- `Order.kt`
- `OrderDatabase.kt`
- Backend scan/POD endpoint jika field belum tersedia.

Acceptance criteria:

- Setelah scan berhasil lalu app ditutup, order detail tetap menampilkan scan selesai.
- Setelah foto pickup berhasil lalu app ditutup, order detail tetap menampilkan foto selesai.
- Jika salah satu proof belum sync, UI menampilkan label pending sync.
- Tidak ada progress penting yang hanya hidup di memory Compose.

Verification:

- Test restart app setelah scan pickup.
- Test airplane mode saat foto pickup.
- Test pending sync lalu online kembali.
- Room migration test jika schema berubah.

### [x] KURIR-FLOW-005: Perjelas policy upload proof type

Masalah:
Pickup proof dan delivery POD harus punya tipe yang jelas agar backend tidak salah membaca bukti pickup sebagai bukti delivery.

Target:
Semua upload evidence memakai proof type eksplisit.

Proof type minimal:

- `pickup_scan`
- `pickup_photo`
- `delivery_pod_photo`
- `delivery_signature`
- `cancel_pickup_photo`
- `failed_delivery_photo`

Affected area:

- `ProofOfDeliveryScreen.kt`
- `ProofOfDeliveryViewModel.kt`
- `OrderRepository.kt`
- API upload proof endpoint.

Acceptance criteria:

- UI tidak memakai istilah POD untuk foto pickup.
- Backend menerima proof type eksplisit.
- Sync offline tidak mengirim pickup proof sebagai delivery proof.
- Riwayat order bisa membedakan bukti pickup, bukti antar, dan bukti pembatalan.

Verification:

- Unit test payload proof type.
- Manual test upload pickup photo dan delivery POD.

### [x] KURIR-FLOW-006: Hardening pending sync dan stale state

Masalah:
App sudah punya pending sync, tetapi flow kurir perlu sinyal yang lebih jelas ketika aksi sudah tersimpan lokal tapi belum diterima backend.

Target:
Tambahkan status visual untuk aksi pending sync di order detail.

State visual:

- `Tersimpan di perangkat`
- `Menunggu sinkronisasi`
- `Tersinkron`
- `Gagal sinkron, coba lagi`

Affected area:

- `OrderDetailScreen.kt`
- `OrderScreen.kt`
- `OrderViewModel.kt`
- `OrderRepository.kt`

Acceptance criteria:

- Kurir tahu apakah proof/status sudah aman tersimpan lokal.
- Retry sync tersedia untuk item gagal.
- Tidak ada aksi yang terlihat sukses penuh sebelum backend mengonfirmasi, kecuali diberi label pending sync.

Verification:

- Manual test offline scan, offline POD, lalu reconnect.
- Unit test sync state mapper.

## Verifikasi P0

- [x] `android-app ./gradlew :app:compileDebugKotlin :app:testDebugUnitTest --rerun-tasks --no-daemon`
- [x] `android-app ./gradlew :app:assembleDebug --no-daemon`
- [x] `backend/admin-service npm run build`

Catatan hasil:

- State machine kurir tersedia di `docs/courier-flow-state-machine.md`.
- Mapper fungsional tersedia di `CourierFlowResolver` dan sudah punya unit test.
- Detail order regular dan on-demand memakai primary CTA berbasis stage.
- Foto pickup dan bukti terima memakai proof type eksplisit.
- Pending scan/proof/status tampil sebagai sync notice di detail order.
- Backend menerima proof type eksplisit tanpa memutus alias lama `pickup` dan `delivery`.

## P1 - Permission, Update, dan Entry Flow

### [x] KURIR-FLOW-007: Buat permission request lebih kontekstual

Masalah:
Permission notification/location diminta terlalu awal bisa terasa agresif untuk kurir baru.

Target:
Permission diminta sesuai konteks.

Rekomendasi:

- Notification permission: setelah login, dengan alasan singkat bahwa order masuk dikirim lewat notifikasi.
- Foreground location: saat kurir menekan Online atau Mulai Navigasi.
- Background location: saat kurir mengaktifkan Online pertama kali dan sudah paham manfaatnya.
- Camera permission: saat masuk scan/foto proof.

Affected area:

- `MainActivity.kt`
- `MainScreen.kt`
- `ScanScreen.kt`
- `ProofOfDeliveryScreen.kt`

Acceptance criteria:

- Login tidak langsung terasa dibanjiri permission.
- Jika permission ditolak, app memberi next step yang jelas.
- Tombol Online menjelaskan kenapa lokasi dibutuhkan.

Verification:

- Fresh install QA.
- Permission denied QA.
- Permission granted after denied QA.

### [x] KURIR-FLOW-008: Rapikan update dialog agar tidak mengganggu login

Masalah:
Update dialog muncul di atas flow login dan bisa terasa mengganggu, terutama jika user belum siap masuk.

Target:
Atur prioritas update dialog.

Policy:

- Forced update: boleh muncul sebelum login.
- Optional update: tampil setelah login atau setelah home render.
- Jika update gagal karena permission/install issue, tampilkan solusi yang jelas.

Affected area:

- `MainActivity.kt`
- Update dialog/component.

Acceptance criteria:

- Forced update tidak bisa dilewati jika minimum version tidak terpenuhi.
- Optional update tidak memblokir login.
- Error update memakai Bahasa Indonesia yang rapi, bukan exception mentah Android.

Verification:

- QA forced update.
- QA optional update.
- QA update permission missing/regression.

## P1 - Offer, Assignment, dan Active Job

### [x] KURIR-FLOW-009: Ganti single offer dialog menjadi offer queue/list

Masalah:
On-demand offer saat ini cenderung mengambil tawaran pertama. Jika ada lebih dari satu tawaran, flow kurang scalable.

Target:
Buat daftar tawaran aktif dengan prioritas dan countdown.

Informasi minimal:

- Pickup area.
- Dropoff area.
- Estimasi jarak.
- Estimasi durasi.
- Payout.
- Service type.
- Deadline accept.
- Risiko: COD, fragile, heavy item.

Affected area:

- `MainScreen.kt`
- `OrderScreen.kt`
- `OrderViewModel.kt`
- Backend offer payload jika belum lengkap.

Acceptance criteria:

- Kurir bisa melihat lebih dari satu offer.
- Offer utama tetap bisa dipromosikan sebagai card paling atas.
- Offer expired hilang otomatis atau berubah status.
- Accept/reject punya feedback loading dan error.

Verification:

- QA multiple active offers.
- QA offer expired.
- QA accept one offer lalu offer lain refresh.

### [x] KURIR-FLOW-010: Batasi active job sesuai kapasitas courier

Masalah:
Flow harus jelas apakah kurir boleh memegang satu atau beberapa order aktif.

Target:
Kapasitas active job harus eksplisit dari backend policy.

Policy contoh:

- Motor on-demand: maksimal 1 active delivery.
- Kargo: bisa multi-drop jika backend mengizinkan.
- Regular route: bisa batch manifest.

Affected area:

- `MainScreen.kt`
- `OrderViewModel.kt`
- Capability profile backend.

Acceptance criteria:

- Jika kurir masih punya active job, offer baru mengikuti policy.
- Jika tidak boleh multi-job, app tidak menampilkan CTA accept offer baru.
- UI menjelaskan alasan offer tidak bisa diambil.

Verification:

- QA active job + incoming offer.
- Unit test capability policy mapper.

## P1 - Location, Navigation, dan Geofence

### [x] KURIR-FLOW-011: Jadikan location gate sebagai rule yang jelas

Masalah:
UI sudah menampilkan jarak ke titik pickup/tujuan, tetapi aksi proof perlu lebih eksplisit apakah diblokir atau hanya diberi peringatan.

Target:
Proof action mengikuti policy radius dari backend.

Policy:

- Jika di luar radius: tombol scan/foto tetap bisa nonaktif atau perlu override reason.
- Jika akurasi GPS buruk: minta ulang lokasi.
- Jika koordinat order tidak tersedia: tampilkan fallback flow dengan reason wajib.

Affected area:

- `OrderDetailScreen.kt`
- `ScanScreen.kt`
- `ProofOfDeliveryScreen.kt`
- Backend verification endpoint.

Acceptance criteria:

- Radius tidak hardcoded di UI jika backend sudah punya policy.
- Kurir mendapat pesan jelas saat belum di titik pickup/tujuan.
- Override di luar radius harus mencatat alasan, lokasi, akurasi, dan timestamp.

Verification:

- QA inside radius.
- QA outside radius.
- QA GPS accuracy buruk.
- QA coordinate missing.

### [x] KURIR-FLOW-012: Perbaiki navigasi dan route state

Masalah:
Navigasi harus konsisten antara pickup dan dropoff, serta jelas apakah route berasal dari backend atau fallback.

Target:
Order detail menampilkan route status yang dapat dipercaya.

State minimal:

- `Route tersedia`
- `Mengambil route`
- `Route belum tersedia`
- `Mode fallback text-only`
- `Provider maps bermasalah`

Affected area:

- `OrderDetailScreen.kt`
- `OrderViewModel.kt`
- Route preview API.

Acceptance criteria:

- Kurir tahu apakah peta/route valid.
- Jika peta gagal, tetap ada instruksi alamat dan tombol buka maps eksternal.
- Tidak ada garis lurus yang terlihat seperti route resmi.

Verification:

- QA route available.
- QA route provider unavailable.
- QA maps config text-only.

## P1 - Exception Flow Lapangan

### [x] KURIR-FLOW-013: Tambahkan flow penerima tidak ada

Masalah:
Kurir butuh flow resmi saat penerima tidak ada di lokasi.

Target:
Tambahkan exception "Penerima tidak ada".

Data wajib:

- Foto lokasi/paket.
- Catatan kurir.
- Lokasi GPS.
- Waktu kejadian.
- Opsi hubungi customer.
- Opsi jadwal ulang atau return.

Affected area:

- `OrderDetailScreen.kt`
- `ProofOfDeliveryScreen.kt` atau screen exception baru.
- Backend failed delivery endpoint/policy.

Acceptance criteria:

- Kurir tidak perlu memakai status generic failed tanpa bukti.
- Customer/admin mendapat alasan yang audit-friendly.
- Flow bisa lanjut ke reschedule atau return-to-hub sesuai policy.

Verification:

- Manual QA failed delivery.
- Backend payload validation.

### [x] KURIR-FLOW-014: Tambahkan flow alamat salah/tidak ditemukan

Masalah:
Alamat salah adalah kasus umum lapangan dan perlu flow yang berbeda dari penerima tidak ada.

Target:
Tambahkan exception "Alamat tidak ditemukan".

Data wajib:

- Lokasi aktual kurir.
- Foto sekitar lokasi.
- Catatan kurir.
- Upaya kontak customer.
- Rekomendasi: koreksi alamat, reschedule, atau return.

Acceptance criteria:

- Alamat salah tidak dicatat sebagai kegagalan kurir.
- Admin bisa melihat bukti dan lokasi aktual.

Verification:

- Manual QA address issue.

### [x] KURIR-FLOW-015: Tambahkan flow paket rusak/bermasalah

Masalah:
Paket rusak, bocor, tidak sesuai, atau label tidak terbaca perlu flow resmi.

Target:
Tambahkan exception "Paket bermasalah".

Data wajib:

- Foto paket.
- Jenis masalah.
- Catatan.
- Lokasi.
- Waktu.

Acceptance criteria:

- Kurir bisa melaporkan sebelum pickup, saat pickup, atau saat antar.
- Status order tidak langsung selesai/gagal tanpa policy.

Verification:

- Manual QA damaged package report.

### [x] KURIR-FLOW-016: Tambahkan return-to-hub / return-to-sender

Masalah:
Setelah gagal antar, app perlu instruksi lanjutan yang jelas.

Target:
Tambahkan flow return.

State minimal:

- `return_required`
- `return_in_transit`
- `returned_to_hub`
- `returned_to_sender`

Acceptance criteria:

- Setelah failed delivery, kurir tahu harus return ke mana.
- Ada scan/foto saat barang diterima hub/sender.
- Ledger/status tidak menganggap order delivered.

Verification:

- Manual QA failed delivery to return.

## Verifikasi P1

Status: selesai.

Implementasi utama:

- Permission lokasi dipindah ke konteks On Duty, notification setelah login, dan background location lewat dialog terpisah.
- Optional update hanya tampil setelah login/home; forced update tetap bisa muncul sebelum login.
- Offer on-demand menjadi queue/list dengan countdown, promoted offer, auto-expire reject, dan active-job capacity guard dari capability/service policy.
- Route state menampilkan loading, fallback, unavailable, text-only/provider issue, dan menegaskan garis fallback bukan rute resmi.
- Location gate menampilkan rule radius 150m dan akurasi 100m; percobaan invalid tetap diaudit backend proof endpoint.
- Exception lapangan dikirim end-to-end sebagai safety event dengan catatan, lokasi, akurasi, timestamp server, dan foto bukti private upload.
- Backend safety event di-hardening dengan whitelist event type, severity validation, message sanitization, ownership check, dan migration constraint event P1.

Verification:

- `android-app`: `./gradlew :app:compileDebugKotlin --no-daemon` sukses.
- `android-app`: `./gradlew :app:testDebugUnitTest --no-daemon` sukses.
- `android-app`: `./gradlew :app:assembleDebug --no-daemon` sukses.
- `backend/admin-service`: `npm run build` sukses.

## P2 - UI/UX Enterprise Polish

### [x] KURIR-FLOW-017: Rapikan visual hierarchy detail order

Masalah:
Detail order masih padat dan beberapa elemen visual belum konsisten dengan design guideline enterprise.

Target:
Detail order menjadi lebih mudah dipindai saat kurir sedang di lapangan.

Prioritas tampilan:

1. Current stage.
2. Next destination.
3. Primary CTA.
4. Distance/ETA/route status.
5. Proof/checklist.
6. Customer/contact/support.
7. Detail tambahan.

Acceptance criteria:

- Dalam 3 detik kurir paham harus melakukan apa.
- CTA utama tidak tenggelam oleh tombol sekunder.
- Warna mengikuti TEMBUS green/orange design system.
- Hindari border hitam tebal dan visual yang terlalu ramai.

Verification:

- Screenshot review untuk 5 stage utama.
- Accessibility contrast check.

### [x] KURIR-FLOW-018: Perbaiki microcopy agar lebih enterprise

Masalah:
Beberapa label/copy masih terdengar teknis atau terlalu generic.

Target:
Gunakan Bahasa Indonesia operasional yang jelas dan profesional.

Contoh penggantian:

- `Update Status` -> `Perbarui Tahap Pengiriman` atau hilangkan jika diganti CTA.
- `POD` -> `Bukti Terima` untuk user-facing copy.
- `Dropoff` -> `Tujuan` atau `Lokasi Penerima`.
- `Scan barcode` -> `Scan Kode Paket`.
- `Foto barang pickup` -> `Foto Barang Saat Pickup`.

Acceptance criteria:

- Tidak ada istilah internal yang muncul ke kurir.
- Copy konsisten antara on-demand dan regular.
- Error message tidak menampilkan exception mentah.

Verification:

- `rg -n "POD|Dropoff|Update Status|Exception|Error:" android-app/app/src/main/java/com/tembus/courier`

### [x] KURIR-FLOW-019: Tambahkan skeleton dan empty/error state yang konsisten

Masalah:
Enterprise app harus memberi feedback saat data sedang sync, kosong, stale, atau gagal.

Target:
Setiap screen utama punya state:

- Loading skeleton.
- Empty state.
- Error state dengan retry.
- Offline/stale state.

Affected screen:

- Beranda.
- Order.
- Detail order.
- Dompet.
- Profil.
- Offer list.
- Chat.

Acceptance criteria:

- Tidak ada blank screen tanpa konteks.
- Retry tersedia pada fetch penting.
- Offline cache diberi label waktu sync terakhir.

Verification:

- Matikan API staging/dev lalu QA app.
- Aktifkan airplane mode lalu buka app.

### [x] KURIR-FLOW-020: Perkuat accessibility untuk penggunaan lapangan

Masalah:
Kurir memakai app saat bergerak, kondisi cahaya berubah, dan butuh target sentuh besar.

Target:
Audit accessibility khusus mobile field usage.

Checklist:

- Touch target minimal 48dp.
- Font tidak terlalu kecil.
- Kontras WCAG AA.
- State tidak hanya dibedakan dengan warna.
- Content description untuk icon penting.
- Snackbar/toast tidak menjadi satu-satunya feedback untuk aksi kritis.

Acceptance criteria:

- Aksi utama mudah ditekan satu tangan.
- Informasi penting tetap terbaca di luar ruangan.
- Screen reader tidak membaca icon sebagai elemen kosong.

Verification:

- Accessibility scanner.
- Manual QA ukuran font besar.

## P2 - Architecture Cleanup

### [x] KURIR-FLOW-021: Pisahkan navigation state dari `MainScreen`

Masalah:
`MainScreen` memegang terlalu banyak boolean screen state seperti detail, scan, POD, chat, dan local verification state.

Target:
Gunakan model navigasi yang lebih stabil.

Opsional pendekatan:

- Compose Navigation dengan route typed.
- Single sealed class `CourierRoute`.
- Persist selected order id lewat `SavedStateHandle`.

Affected area:

- `MainScreen.kt`
- Screen detail/scan/POD/chat.

Acceptance criteria:

- Back stack lebih prediktif.
- Deep link dari notification membuka screen yang benar.
- Rotation/process death tidak menghilangkan konteks order.
- MainScreen lebih kecil dan mudah dites.

Verification:

- Manual QA notification deep link.
- Manual QA rotate/process recreate.
- Unit test route reducer jika memakai reducer.

### [x] KURIR-FLOW-022: Buat mapper/domain layer untuk courier stage

Masalah:
UI mencampur logika status order, role, proof requirement, dan CTA.

Target:
Buat mapper kecil:

- `CourierStageMapper`
- `CourierNextActionMapper`
- `CourierProofRequirementMapper`

Affected area:

- `ui/screens/order`
- `data/model`
- `domain` package baru jika sesuai struktur.

Acceptance criteria:

- Compose screen tidak berisi logika status kompleks.
- Mapper punya unit test.
- Policy backend tetap bisa mempengaruhi output mapper.

Verification:

- Unit test kombinasi role/status/proof policy.

## Verifikasi P2

Status: selesai.

Implementasi utama:

- Detail order regular dan on-demand dirapikan menjadi urutan stage, tujuan berikutnya, CTA utama, route/location state, checklist, lalu support/detail tambahan.
- Microcopy UI kurir dipoles ke Bahasa Indonesia operasional: `Bukti Terima`, `Tujuan`, `Scan Kode Paket`, `Foto Barang Saat Pickup`, dan `Koreksi Tahap`.
- Loading/empty/error state ditambah untuk order list, wallet ledger, chat, scan, proof, dan error sync utama.
- Aksi utama dan proof/scan dibuat lebih ramah penggunaan lapangan dengan target sentuh minimal 52-56dp dan feedback inline untuk error kritis.
- Navigation state detail/scan/proof/chat dipisahkan menjadi `CourierRouteState` + `CourierRouteReducer` dan disimpan lewat `rememberSaveable`.
- Mapper stage/next action/proof requirement tetap berada di domain layer dan ditambah test route reducer untuk deep link/back flow.

Verification:

- `android-app`: `./gradlew :app:compileDebugKotlin --no-daemon` sukses.
- `android-app`: `./gradlew :app:testDebugUnitTest --no-daemon` sukses.
- `android-app`: `./gradlew :app:assembleDebug --no-daemon` sukses.
- `backend/admin-service`: `npm run build` sukses.

## Urutan Eksekusi yang Disarankan

1. `KURIR-FLOW-001` - state machine.
2. `KURIR-FLOW-002` - Next Best Action di order detail.
3. `KURIR-FLOW-003` - parity regular flow.
4. `KURIR-FLOW-004` - persist pickup verification.
5. `KURIR-FLOW-005` - proof type eksplisit.
6. `KURIR-FLOW-011` - location gate policy.
7. `KURIR-FLOW-013` sampai `KURIR-FLOW-016` - exception flow lapangan.
8. `KURIR-FLOW-017` sampai `KURIR-FLOW-020` - UI/UX polish.
9. `KURIR-FLOW-021` sampai `KURIR-FLOW-022` - architecture cleanup.

## Definition of Done Global

- Flow regular dan on-demand sama-sama guided.
- Setiap stage punya satu CTA utama.
- Scan, pickup photo, delivery proof, cancel proof, dan failed proof memakai proof type eksplisit.
- Progress proof/status tetap muncul setelah app restart.
- Offline/pending sync terlihat jelas.
- Semua exception lapangan punya reason, proof, location, timestamp, dan audit trail.
- UI mengikuti design system TEMBUS: green primary, orange CTA, white surface, radius konsisten, whitespace cukup, dan copy profesional.
- Build/test minimal:
  - `cd android-app`
  - `./gradlew :app:assembleDebug`
  - `./gradlew :app:testDebugUnitTest`

## Catatan Diskusi Product

Keputusan yang perlu disepakati sebelum implementasi besar:

- Apakah regular courier boleh multi-order aktif atau selalu satu order?
- Apakah on-demand courier boleh menerima offer baru saat masih membawa paket?
- Radius validasi pickup/dropoff mengikuti policy berapa meter?
- Jika GPS buruk, apakah proof diblokir atau boleh override dengan alasan?
- Apakah pickup selalu wajib scan + foto, atau tergantung service/category?
- Apakah failed delivery langsung return, reschedule, atau menunggu keputusan admin?
- Istilah final user-facing: pakai `Bukti Terima` atau tetap `POD` di app kurir?
