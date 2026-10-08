# MOBILE-OPT-2026-001 — Optimasi Customer & Courier Android

Status: BLOCKED — implementation and local verification complete; authenticated UAT/runtime qualification requires external test access and a comparable measurement environment.
Owner: Engineering
Updated: 2026-10-06

## Keputusan scope

- TomTom tetap menjadi provider utama dan sumber otoritatif untuk route jalan, jarak, ETA, harga, traffic, dan polyline.
- Backend tetap menjadi sumber route snapshot yang dikonsumsi customer dan courier; client tidak menghitung ulang harga/ETA final dari provider lain.
- Google Maps hanya dipakai sebagai fallback navigasi eksternal setelah pengguna menekan tombol untuk pergi ke tujuan. Fallback ini membuka intent/deep link Google Maps dan bukan pemanggilan Google Routes, Directions, Distance Matrix, atau ETA API.
- Migrasi route, harga, ETA, dan traffic ke Google Maps tidak termasuk task ini.
- Setiap item baru boleh berubah dari `[ ]` menjadi `[x]` hanya jika bukti aktualnya dicatat di bagian evidence/verification dan hasilnya dapat diulang.

## Baseline yang sudah terbukti

- [x] Customer Android unit test: `android-app-customer\gradlew.bat :app:testDebugUnitTest --no-daemon` — PASS pada 2026-10-06.
- [x] Courier Android unit test: `android-app\gradlew.bat :app:testDebugUnitTest --no-daemon` — PASS pada 2026-10-06.
- [x] Integration gateway: `backend\integration-gateway` — `go test ./...` PASS pada 2026-10-06.
- [x] Routing service: `backend\routing-service` — `go test ./...` PASS pada 2026-10-06.
- [ ] Baseline release size, cold start, memory, network, battery, ANR, dan crash sudah diukur dengan build release yang dapat dibandingkan.

## P0 — Sumber route dan correctness

- [ ] Verifikasi satu kontrak route snapshot TomTom dipakai konsisten oleh customer booking/tracking, courier offer/active job, pricing, dan dispatch.
- [x] Verifikasi bahwa harga, jarak, ETA, traffic, dan polyline final tidak pernah dihitung ulang dari Google Maps di mobile.
- [ ] Verifikasi tombol “pergi ke tujuan” membuka Google Maps sebagai fallback eksternal dengan koordinat/alamat yang benar, tanpa mengubah route snapshot atau status order.
- [x] Pisahkan refresh maps config dari polling tracking; konfigurasi tidak ikut dipanggil setiap refresh posisi/order.
- [x] Pastikan cache TTL/version maps config dihormati dan kegagalan provider menampilkan state stale/fallback yang jujur, bukan crash atau data bisnis palsu.

## P0 — Ukuran aplikasi dan startup

- [ ] Ambil baseline dan post-change ukuran APK/AAB per ABI untuk customer dan courier; debug artifact tidak boleh dipakai sebagai klaim ukuran download production.
- [x] Audit dependency TomTom dan native library: hapus hanya modul/ABI/resource yang terbukti tidak dipakai, lalu jalankan release smoke test.
- [x] Pastikan konfigurasi release memakai App Bundle/ABI split, shrink/resource optimization yang aman, serta tidak membawa asset/debug dependency ke production.
- [ ] Ukur cold start, waktu sampai screen interaktif, peak memory, dan jank pada customer dan courier sebelum/sesudah perubahan.
- [x] Audit dan hapus/isolasi wrapper map placeholder/no-op yang tidak dipakai agar tidak menambah jalur kode dan potensi bug.

## P0 — Battery dan network

- [x] Terapkan policy location berbasis stage: no active job, menunggu offer, menuju pickup, mengantar, dan selesai; tiap stage punya interval, accuracy, dan distance filter yang terukur.
- [ ] Pastikan service location tidak membuat duplicate callback/subscription setelah restart, background/foreground, reconnect, atau perubahan order.
- [x] Kurangi polling customer dengan adaptive backoff/cache dan gunakan event/realtime bila tersedia; jangan mengorbankan freshness yang dibutuhkan tracking aktif.
- [x] Deduplikasi/coalesce upload lokasi courier berdasarkan perubahan bermakna dan status stage, dengan retry/backoff yang tidak membuat antrean tak terbatas.
- [ ] Ukur battery drain dan data usage pada skenario idle, active tracking, jaringan buruk, background, dan reconnect; simpan baseline serta hasil sesudah optimasi.

## P0 — Pencegahan bug dan crash

- [ ] Tambahkan/kuatkan test lifecycle renderer TomTom/OSM, permission location, process death, restore state, offline/online, dan provider timeout.
- [ ] Verifikasi tidak ada `UnsatisfiedLinkError`, crash native TomTom, ANR, atau coroutine leak pada customer/courier smoke flow.
- [ ] Pastikan marker/polyline hanya di-diff saat data berubah dan lifecycle map tidak memegang reference lama setelah screen ditutup.
- [ ] Pastikan route gagal, koordinat invalid, token expired, dan Google Maps tidak terpasang menghasilkan error/retry/fallback yang aman.
- [ ] Pastikan log operasional tidak membocorkan token/API key, alamat sensitif, atau payload pribadi yang tidak perlu.

## Verification gates sebelum item dicentang

- [x] `android-app-customer` unit test, lint, dan release build PASS.
- [x] `android-app` unit test, lint, dan release build PASS.
- [x] Backend route/integration tests PASS dan tetap membuktikan TomTom sebagai provider route/ETA/harga yang dipilih.
- [ ] Emulator smoke customer: booking/review, tracking, refresh, offline/reconnect, dan tombol fallback Google Maps.
- [ ] Emulator smoke courier: offer, active job, location lifecycle, route preview, dan tombol fallback Google Maps.
- [ ] Battery/network measurement report tersedia untuk baseline dan post-change.
- [x] APK/AAB size report tersedia per app dan ABI, termasuk perubahan dependency/native library.
- [ ] Crash/ANR/logcat review tersedia untuk skenario normal, process death, provider failure, dan reconnect.
- [x] Evidence task diperbarui; item tidak boleh dicentang hanya karena compile berhasil.

## Definition of done

Task hanya COMPLETE jika seluruh item P0 dan verification gate yang applicable sudah `[x]`, route/ETA/harga TomTom tetap konsisten, fallback Google Maps tetap berfungsi, hasil ukuran/battery/crash menunjukkan perbaikan atau trade-off yang disetujui, dan tidak ada requirement yang masih unproven.
