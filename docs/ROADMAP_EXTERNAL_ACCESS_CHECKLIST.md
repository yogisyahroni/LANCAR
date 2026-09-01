# Roadmap 2026 — Checklist Akses Eksternal

Dokumen ini adalah runbook untuk **17 item roadmap yang implementasi lokalnya sudah ada tetapi belum dapat dinyatakan DONE tanpa akses eksternal**: staging, perangkat fisik, Firebase/provider, partner, atau role matrix resmi.

Sumber utama: [TEMBUS_ROADMAP_TO_2026.md](./TEMBUS_ROADMAP_TO_2026.md).

## Cara memakai dokumen ini

1. Kerjakan item menggunakan environment **staging**, bukan production.
2. Isi owner, waktu, environment, versi build, dan hasil aktual pada bagian item terkait.
3. Lampirkan evidence yang disebutkan. Redact token, password, email/nomor telepon customer, dan koordinat sensitif.
4. Ubah status hanya sesuai bukti:
   - `TODO`: belum dimulai.
   - `RUNNING`: sedang dieksekusi, evidence belum lengkap.
   - `BLOCKED`: akses eksternal belum tersedia; tulis blocker dan pemilik tindak lanjut.
   - `PASS`: exit gate terpenuhi dan evidence sudah dilampirkan.
5. Roadmap boleh diubah menjadi `[x]`/`DONE` hanya setelah status `PASS`, bukan hanya karena kode sudah tersedia.

## Aturan keamanan

- Jangan commit API key, Firebase service-account JSON, Apple private key, credential partner, atau data PII.
- Gunakan secret manager/CI secret dan berikan hanya nama variable pada evidence.
- Semua load test memakai endpoint dan data staging yang memang disediakan untuk pengujian.
- Gunakan akun uji dengan role minimum yang diperlukan.
- Screenshot wajib menutupi token, email/telepon, alamat lengkap, order ID sensitif, dan data pembayaran.
- Setelah pengujian selesai, cabut credential sementara dan hapus data uji yang memang diminta oleh owner environment.

## Ringkasan 17 item

| No | Item roadmap | Akses eksternal yang dibutuhkan | Owner yang diminta | Evidence minimum | Status |
|---:|---|---|---|---|---|
| 1 | Customer App — unit/API/Android routing + device E2E | Staging API, 1 akun admin, 1 akun kurir, 2 perangkat/emulator | QA + Backend | video/log admin kirim → kurir terima | TODO |
| 2 | Broadcast load test 5k–10k recipient | Load-test environment, dataset recipient, izin traffic | SRE + Backend | report k6 dan dashboard metric | TODO |
| 3 | Google/Apple Sign-In | Google OAuth client, Apple Services ID/Bundle ID, Apple Team/Key | Auth owner | callback, session, logout, dan error evidence | TODO |
| 4 | Customer TalkBack critical path | Perangkat Android fisik + TalkBack | Mobile QA | checklist booking/tracking/payment/POD | TODO |
| 5 | Customer pull-to-refresh | Perangkat Android fisik, network profile | Mobile QA | video refresh dan timestamp data | TODO |
| 6 | Customer Android 15 | Perangkat/API 35 atau emulator resmi | Mobile QA | smoke report edge-to-edge/back/photo picker | TODO |
| 7 | Customer haptic | Perangkat fisik dengan vibration | Mobile QA | video/QA checklist action penting | TODO |
| 8 | Towing partner + insurance provider | Kontrak/API sandbox dan credential provider | Ops + Legal + Backend | booking/ack/claim/reconciliation | TODO |
| 9 | Per-app language lengkap | Reviewer native ID/EN + perangkat visual | Product + QA | audit string dan screenshot dua locale | TODO |
| 10 | Courier Broadcast Center E2E | Firebase project, staging admin/courier, perangkat | SRE + Mobile QA | push foreground/background/killed | TODO |
| 11 | Courier Android 15 + haptic + refresh | Perangkat courier Android 15 | Mobile QA | matrix tiga capability | TODO |
| 12 | Courier TalkBack | Perangkat fisik + TalkBack | Accessibility QA | walkthrough critical path | TODO |
| 13 | Merchant order alert | Firebase project/credential merchant | SRE + Merchant owner | FCM foreground/background/killed | TODO |
| 14 | Merchant staff role & permission | Akun owner, manager, cashier/staff, role matrix | Merchant Ops + Security | allow/deny matrix dan audit | TODO |
| 15 | Merchant bulk import + analytics | Dataset staging realistis dan order history | QA + Merchant Ops | import result + KPI reconciliation | TODO |
| 16 | Admin Broadcast Center penuh | Staging admin/courier + FCM + device | Admin Ops + SRE | composer→delivery report→audit | TODO |
| 17 | Admin RBAC multi-role | Akun ops/finance/support/superadmin | Security + Admin Ops | role matrix, negative test, audit | TODO |

## Persiapan bersama

Catat metadata berikut sebelum setiap eksekusi:

```text
Tanggal/waktu:
Executor:
Environment/base URL:
Commit/build version:
Device model + Android version:
Account alias (tanpa password/token):
Ticket/approval akses:
Link evidence:
```

Checklist staging:

- [ ] Backend, database, worker, FCM, dan websocket staging healthy.
- [ ] Seed data dibuat melalui API/migration resmi, bukan hardcode UI.
- [ ] Clock/timezone perangkat dan server disamakan.
- [ ] Network profile dan kondisi offline/online dicatat.
- [ ] Log correlation ID tersedia.
- [ ] Monitoring/alerting aktif selama pengujian.
- [ ] Tidak ada secret atau PII di screenshot, log, atau artefak.

---

## Runbook per item

### 1. Customer device E2E: admin → courier

**Prasyarat:** staging API sehat, akun admin dan kurir aktif, satu order/broadcast test, akses log backend, dan perangkat customer/courier atau emulator.

**Langkah:**

1. Login sebagai admin dan kirim satu broadcast/order event ke target kurir uji.
2. Verifikasi backend mencatat `sent`, target, timestamp, dan correlation ID.
3. Uji aplikasi kurir pada foreground, background, lalu killed.
4. Tap notifikasi dan pastikan deep link membuka Inbox/order yang benar.
5. Ulangi dengan network loss singkat dan pastikan retry/fallback tidak menggandakan event.

**Exit gate:** event diterima pada tiga lifecycle state, deep link benar, audit/delivery report konsisten, dan tidak ada regression order aktif.

**Evidence:** video tanpa PII, log correlation ID yang sudah disensor, dan test report.

### 2. Load test broadcast 5k–10k recipient

**Prasyarat:** izin traffic, environment load-test, dataset recipient sintetis/approved, observability dashboard, dan runbook rollback.

Script tersedia di `scripts/load/admin-broadcast.k6.js` dan `scripts/load/on-demand-1m-day.k6.js`.

**Langkah:**

1. Jalankan smoke test kecil.
2. Naikkan beban bertahap, misalnya 5k lalu 10k recipient.
3. Pantau latency p95/p99, error rate, queue depth, CPU/memory, DB pool, dan FCM response.
4. Verifikasi rate-limit, retry, invalid-token cleanup, dan tidak ada OOM/timeout cascade.
5. Simpan hasil k6 dan dashboard window yang sama.

**Exit gate:** threshold disetujui SRE tercapai, tidak ada kehilangan event yang tidak terjelaskan, dan tidak ada incident pada service terkait.

**Evidence:** command tanpa secret, summary k6, dashboard metrics, dan approval SRE.

### 3. Google/Apple Sign-In web

**Prasyarat:** Google OAuth client redirect staging; Apple Services ID/Bundle ID, Team ID, Key ID, private key melalui secret manager; domain/redirect terverifikasi; akun uji provider.

Variable yang perlu diisi melalui secret manager (jangan tulis nilainya di repo):

```text
APPLE_CUSTOMER_WEB_CLIENT_ID
APPLE_CUSTOMER_ANDROID_CLIENT_ID
APPLE_TEAM_ID
APPLE_KEY_ID
APPLE_PRIVATE_KEY
```

**Langkah:**

1. Isi konfigurasi provider pada staging dan aktifkan feature flag customer Apple.
2. Uji login baru, login akun existing, consent/callback, session exchange, refresh, logout, dan session expiry.
3. Uji cancel/error provider dan email relay Apple.
4. Pastikan account linking tidak membuat duplicate customer dan tidak menerima nonce/state invalid.
5. Uji web dan Android client yang memang terdaftar pada provider.

**Exit gate:** seluruh happy path dan negative path pass pada staging; cookie/session aman; audit login tercatat; tidak ada secret di log.

**Evidence:** provider configuration checklist (tanpa value), callback log tersensor, screenshot, dan test report.

### 4. Customer TalkBack

**Prasyarat:** perangkat fisik, TalkBack terbaru, akun uji, dan checklist aksesibilitas.

**Langkah:** jalankan booking, tracking, payment, dispute/POD dengan TalkBack aktif; cek urutan fokus, label kontrol, role/state, error validation, dialog, loading, dan target sentuh.

**Exit gate:** tidak ada action critical yang tidak terumumkan/tidak dapat dioperasikan; focus order logis; error dan status perubahan terbaca; defect severity tinggi = 0.

**Evidence:** checklist per screen, video singkat, daftar defect dan retest.

### 5. Customer pull-to-refresh

**Prasyarat:** perangkat Android fisik, akun dengan data yang berubah dari server, network on/off.

**Langkah:** uji dashboard, history, tracking, favorites, address book, notifications, food home, nearby courier, referral, detail service, dan chat; lakukan refresh normal, refresh berulang, dan refresh saat offline.

**Exit gate:** indikator loading tampil, data benar-benar diambil ulang, gesture tidak mengganggu scroll/form, error/offline jujur, dan tidak ada duplicate request berbahaya.

**Evidence:** video per kelompok screen dan log request/timestamp.

### 6. Customer Android 15

**Prasyarat:** device/emulator Android 15, build release-like, permission state bersih.

**Langkah:** smoke login, booking, tracking, payment, notification, Credential Manager, Photo Picker, edge-to-edge, rotasi/background, dan predictive back.

**Exit gate:** tidak ada crash/layout clipping/back navigation broken; permission sesuai; screenshot menunjukkan konten aman di area system bars.

**Evidence:** device matrix, logcat tersaring, screenshot/video.

### 7. Customer haptic

**Prasyarat:** perangkat fisik dengan vibration aktif dan accessibility setting yang relevan.

**Langkah:** verifikasi haptic pada booking confirmation dan action penting customer; uji vibration off, silent mode, rapid tap, dan lifecycle background.

**Exit gate:** feedback terasa tepat satu kali untuk action sukses/critical, tidak mengganggu, dan tidak menjadi satu-satunya indikator status.

**Evidence:** QA checklist device, video, serta hasil dengan vibration disabled.

### 8. Towing partner dan insurance provider

**Prasyarat:** kontrak partner/insurance disetujui, sandbox endpoint, credential, webhook signing key, SLA, mapping status, serta owner rekonsiliasi.

**Langkah:** uji quote/booking towing, acknowledgement, assignment, cancellation, timeout, damage report, before/after proof, claim intake, claim approval/rejection, webhook duplicate, dan reconciliation.

**Exit gate:** status mapping idempotent, signature tervalidasi, timeout/rollback jelas, amount/coverage cocok dengan kontrak, dan audit lengkap.

**Evidence:** kontrak/API version, sandbox transaction IDs, webhook log tersensor, reconciliation report, approval Legal/Ops.

### 9. Per-app language ID/EN

**Prasyarat:** reviewer native/locale owner dan perangkat untuk visual validation.

**Langkah:** audit seluruh screen customer, merchant, courier; ganti string yang masih hardcode pada auth/brand, label/title/placeholder, content description, error, dialog, permission, dan notification; uji locale switch serta cold start.

**Exit gate:** tidak ada string user-facing yang salah locale/terpotong; technical labels yang sengaja tidak diterjemahkan didokumentasikan; TalkBack membaca locale yang benar.

**Evidence:** string audit, screenshot ID/EN, device matrix, dan sign-off reviewer.

### 10. Courier Broadcast Center E2E

**Prasyarat:** Firebase staging, credential server, token perangkat kurir, akun admin, topic permission, dan perangkat.

**Langkah:** kirim broadcast targeted dan topic (`courier_all`, `courier_online`, `courier_zone_{zoneId}`); uji foreground/background/killed, image valid/invalid, priority, deep link Inbox, mark read, dan duplicate delivery.

**Exit gate:** target tepat, delivery report cocok, image/priority fallback aman, deep link benar, topic lama ter-unsubscribe, dan order alert tidak terganggu.

**Evidence:** FCM message ID, admin delivery report, courier video, log topic/token tersensor.

### 11. Courier Android 15 + haptic + refresh

**Prasyarat:** perangkat courier Android 15 dengan vibration dan network profile.

**Langkah:** uji order list/inbox, active order, service/POD, SOS, notification, predictive back, edge-to-edge, haptic critical action, dan pull-to-refresh saat data berubah/offline.

**Exit gate:** ketiga capability pass pada device; tidak ada crash/clipping; refresh idempotent; SOS/order action tetap usable saat vibration off.

**Evidence:** matrix hasil per screen, logcat, video, defect retest.

### 12. Courier TalkBack

**Prasyarat:** perangkat fisik, TalkBack, akun kurir, order test dan POD test.

**Langkah:** walkthrough accept order, route/stop, status update, proof before/after, chat, earnings, dan SOS; uji dialog/error/loading.

**Exit gate:** semua action critical dapat ditemukan dan dioperasikan tanpa sighted assistance; status order/POD terbaca jelas.

**Evidence:** accessibility checklist, video, dan sign-off QA.

### 13. Merchant order alert FCM

**Prasyarat:** Firebase merchant project, Android app registration, `google-services`/credential staging, device token, background/killed test, dan notification channel approval.

**Langkah:** konfigurasi secret staging, login merchant, register token, buat order dari customer, lalu uji foreground/background/killed; tap notifikasi dan verifikasi order detail; uji token invalid, duplicate, logout, dan polling fallback.

**Exit gate:** alert tiba sesuai SLA, tidak duplicate, deep link benar, token invalid dibersihkan, dan fallback polling tidak membuat order ganda.

**Evidence:** FCM message ID, server delivery log, video tiga lifecycle state, dan Firebase console screenshot tanpa credential.

### 14. Merchant staff role & permission

**Prasyarat:** role matrix resmi dan akun owner/manager/cashier/staff; data merchant staging.

**Langkah:** uji setiap role untuk order accept/reject/ready, menu, promo, settlement, reports, staff management, settings, printer, dan refund; uji akses langsung ke API/UI, perubahan permission, revoke, session lama, dan audit actor.

**Exit gate:** allow/deny sesuai matrix pada UI **dan** backend; least privilege; perubahan role efektif sesuai kebijakan; semua mutation diaudit.

**Evidence:** matriks hasil, API response code, screenshot, audit event IDs, approval Merchant Ops/Security.

### 15. Merchant bulk import dan advanced analytics

**Prasyarat:** dataset staging realistis yang disetujui, CSV template, expected totals dari DB/query owner, dan akun merchant.

**Langkah:** import valid, invalid, duplicate, quoted field, unicode, empty row, unavailable item, dan large file; verifikasi preview/error summary/API persistence. Cocokkan repeat customer, peak hour, accepted→ready, order/status/revenue dengan query sumber.

**Exit gate:** tidak ada partial write yang tidak dilaporkan, invalid row jelas, retry aman, angka analytics cocok dengan source-of-truth dalam toleransi yang disepakati.

**Evidence:** file input non-PII, import summary, DB reconciliation query/result, analytics screenshot.

### 16. Admin Broadcast Center penuh

**Prasyarat:** staging admin/courier, Firebase, topic/zone data, approval template, dan akses audit/metrics.

**Langkah:** uji create draft, edit, preview, schedule, cancel, send now, target zone/role/online/capability/manual, image, deep link, rate limit, delivery report, history, dan audit.

**Exit gate:** end-to-end admin→FCM→courier pass; cancel/schedule idempotent; target estimate dan actual delivery terukur; unauthorized role ditolak; audit lengkap.

**Evidence:** test run IDs, delivery report, courier device video, audit events, metrics window.

### 17. Admin RBAC multi-role

**Prasyarat:** role matrix disetujui, akun ops/finance/support/superadmin, MFA/TOTP jika diwajibkan, dan staging data.

**Langkah:** uji menu visibility, route guard, API guard, read/write/export/force action per role; uji direct URL/API, expired session, role change, revoke, TOTP, dan audit.

**Exit gate:** tidak ada privilege escalation; UI dan backend konsisten; superadmin-only action terlindungi; seluruh deny path menghasilkan error aman dan tercatat.

**Evidence:** signed role matrix, automated/manual result, request/response status tanpa token, audit IDs, Security sign-off.

---

## Template evidence report

Salin template ini untuk setiap item:

```markdown
# Evidence — Roadmap item <nomor>

- Item:
- Owner:
- Executor:
- Date/time:
- Environment/build:
- Device/provider:
- Status: TODO | RUNNING | BLOCKED | PASS
- External access used (names only, no secrets):
- Approval/ticket:

## Steps executed
- [ ] Prerequisites verified
- [ ] Happy path
- [ ] Negative/error path
- [ ] Offline/retry/lifecycle path (jika relevan)
- [ ] Security/PII review

## Result
- Expected:
- Actual:
- Defects:
- Correlation/test IDs:

## Attachments
- Link video/log/report:
- Screenshot(s) redacted:

## Exit gate
- [ ] Semua gate item terpenuhi
- [ ] Evidence lengkap dan dapat direproduksi
- [ ] Owner sign-off
```

## Status dan tindak lanjut

Saat dokumen ini dibuat, 17 item sengaja berstatus `TODO` karena akses eksternalnya belum disediakan. Setelah kamu memprosesnya, ubah status item terkait menjadi `RUNNING`, `BLOCKED`, atau `PASS` dan salin ringkasannya ke roadmap utama. Item `BLOCKED` harus berisi siapa yang perlu memberikan akses dan apa yang kurang; item tersebut belum boleh ditandai `DONE`.

