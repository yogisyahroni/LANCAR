# Tasks

## Active

No active on-demand readiness tasks.

## Waiting On

- [ ] **Secret/API key staging-production diisi operator** - infra sudah siap; isi `GOOGLE_MAPS_API_KEY`/`GOOGLE_DIRECTIONS_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, dan `FIREBASE_PROJECT_ID`.
- [ ] **Device/emulator staging login customer dan kurir** - diperlukan untuk test foreground/background/killed app setelah secret terisi.
- [ ] **P0 - Staging device test FCM real token** - code path, env wiring, readiness endpoint, dan checklist sudah siap; eksekusi device nyata menunggu Firebase staging credential dan login device.
  - Register token customer dan kurir dari app.
  - Trigger order on-demand dari customer sampai offer masuk ke kurir.
  - Verifikasi push muncul saat app foreground, background, dan killed jika memungkinkan.
  - Catat fallback behavior jika FCM gagal: socket/polling tetap menampilkan status.

## Someday

No someday on-demand readiness tasks.

## Done

- [x] **Someday - Realtime WebSocket scale test** - simulasi ribuan order on-demand aktif dan banyak kurir online sudah dikunci di test backend.
  - Test `onDemandRealtimeScale.test.ts` membangun 2.500 payload tracking dengan 5.000 kurir virtual.
  - Contract memastikan event, room id, customer id, courier id, dan location payload tidak berubah.

- [x] **Someday - Offline-first tracking replay** - replay lokasi kurir sudah aman untuk retry saat jaringan putus.
  - Aplikasi kurir mengirim `client_location_id` stabil per titik lokasi lokal.
  - Backend menyimpan `client_location_id` dan `device_id`, lalu men-skip duplicate replay tanpa membuat posisi ganda.
  - Response sync mengembalikan `acceptedCount`, `rejectedCount`, dan `duplicateCount`.

- [x] **Someday - Customer sharing public tracking link** - customer bisa membuat link tracking publik untuk penerima tanpa login setelah kurir menerima pekerjaan.
  - Endpoint: `POST /auth/web/orders/:id/public-tracking-link`.
  - Public page: `/track/:token`.
  - Link memakai token hash di database, TTL 12 jam, dan tidak mengekspos token asli di storage.

- [x] **Waiting On infra readiness prepared** - external key infra sudah siap dan tinggal diisi secret/API key.
  - Docker Compose sekarang meneruskan Google Directions dan Firebase Admin env ke `admin-service`.
  - Endpoint aman `GET /api/v1/system/on-demand-readiness` dibuat untuk cek status tanpa mengekspos secret.
  - Env template dan dokumen setup key dibuat: `docs/on-demand-external-keys-setup.md`.
  - FCM staging checklist dihubungkan ke readiness endpoint.

- [x] **P0 - Realtime contract hardening untuk on-demand** - semua event utama memakai payload `on_demand_event` stabil dan room `order:{order_id}` dengan legacy fallback event.
  - Event minimal selesai: offer_created, offer_accepted, courier_otw_pickup, pickup_verified, delivery_started, pod_completed, pickup_cancelled, chat_message, tracking_updated.
  - Backend contract test ditambahkan untuk tracking, chat, offer_created, dan token registration.

- [x] **P0 - Customer web realtime zero-refresh** - customer web order detail join/leave order room dan menerima tracking/chat/status tanpa manual refresh.
  - Tracking page web menerima `on_demand_event`, `tracking_updated`, `order_tracking_updated`, dan `tracking:update`.
  - Chat customer web memakai room order dengan de-duplication message id.
  - Polling lama tetap dipertahankan sebagai fallback.

- [x] **P0 - FCM registration hook readiness** - endpoint mobile/customer/courier token registration diverifikasi lewat unit test dan checklist staging dibuat.
  - Checklist: `docs/on-demand-fcm-staging-checklist.md`.

- [x] **P1 - ETA dan route polyline akurat** - tracking on-demand memakai route provider abstraction dengan Google Directions cache Redis dan fallback graceful.
  - Endpoint tracking mengembalikan `eta`, `eta_minutes`, `route_polyline`, `route_provider`, `target`, dan lokasi terakhir valid.
  - Cache route pendek aktif 60 detik saat `GOOGLE_MAPS_API_KEY`/`GOOGLE_DIRECTIONS_API_KEY` tersedia.
  - Tanpa API key/provider down, endpoint tetap mengirim ETA fallback haversine dan status perjalanan.

- [x] **P1 - Stage-aware tracking customer** - customer tracking sekarang punya stage dan timeline yang sama untuk mobile/web.
  - Fase selesai: mencari kurir, kurir menuju pickup, validasi pickup, menuju tujuan, selesai, dibatalkan.
  - Detail tracking mobile menyertakan `tracking`, `events`, dan `proofs`.
  - POD/cancellation proof tetap tersedia dari detail tracking/order.

- [x] **P1 - Location quality guard** - update lokasi kurir divalidasi sebelum tampil ke customer.
  - Lokasi mock, akurasi buruk, timestamp lama, koordinat invalid, dan loncatan tidak wajar ditandai.
  - Safety event otomatis dibuat di `courier_safety_events`.
  - Customer hanya melihat lokasi valid terakhir; data mencurigakan tidak dipublish ke room realtime.

- [x] **P2 - Full staging E2E scenario automation** - test otomatis customer order sampai ledger payout sudah dibuat di backend.
  - Test `onDemandCourierProof.e2e.test.ts` mengunci flow pickup scan wajib, pickup photo wajib, delivery POD, event customer/kurir, notifikasi customer, dan earning ledger setelah POD.
  - Test `onDemandRealtime.e2e.test.ts` tetap mengunci courier tracking, customer tracking, chat order room, dan offer realtime.
  - Backend test harus gagal kalau event lifecycle utama atau ledger credit hilang.

- [x] **P2 - Observability realtime on-demand** - log/metric untuk socket, push, tracking, chat, dan alert sudah ditambahkan.
  - Metric: socket connected/disconnected by role, join_order_room denied, notification socket, tracking update latency, FCM success/failure/skipped, event emit, chat delivery via on-demand emitter.
  - Alert: tracking update stale saat order aktif dan offer accepted tanpa customer-visible location update.
  - Alert order ditulis ke `order_events` sebagai `realtime_observability_alert`, plus structured log domain `on_demand_realtime`.

- [x] **P3 - Operational runbook on-demand incident** - runbook operasional untuk tracking/push/chat/POD/ledger on-demand sudah dibuat.
  - Dokumen: `docs/on-demand-incident-runbook.md`.
  - Berisi cara cek order room, token FCM, lokasi terakhir, safety event, proof, order event, dan ledger earning.
  - Berisi recovery aman tanpa merusak ledger, rollback rule append-only, escalation matrix, dan checklist sebelum deploy nasional.
