# TEMBUS Scaling Roadmap: 1 Juta Order/Hari

Status: implementation foundation active. P1-P7 now have executable code/config artifacts; final production readiness still depends on real managed infrastructure, secrets, and load-test evidence.

## Target Kapasitas

Target default adalah 1 juta order sukses per hari, bukan 1 juta koneksi serentak.
Kapasitas awal dirancang untuk peak:

- 250 create order per detik.
- 2.500 quote/pricing per detik.
- 10.000 tracking ping per detik.
- 100.000 koneksi realtime aktif.

## Flow Kapasitas Resmi

1. Customer mobile/web mengambil konfigurasi maps runtime dan service aktif.
2. Customer meminta quote route/pricing untuk pickup, dropoff, kendaraan, service, dan tier paket.
3. Customer submit order dengan route snapshot final dan `X-Idempotency-Key`.
4. Payment dibuat dan dikonfirmasi dengan idempotency key berbeda.
5. Transactional outbox menulis event `order.created` dan `payment.paid`.
6. Worker dispatch membaca queue/outbox dan mengirim offer on-demand TTL 15 detik ke satu kurir terbaik.
7. Courier accept/reject memakai lock DB, unique active offer, dan status transition atomik.
8. Tracking masuk sebagai write ringan ke storage hot path lalu realtime fanout lewat Socket.IO Redis adapter.
9. Pickup proof, delivery POD, ledger earning, dan notification ditulis idempotent.
10. Customer mobile/web melakukan reconnect state sync saat socket reconnect atau FCM terlambat.

## P0 - Capacity Contract & Load Test

Load test menggunakan k6 dengan skenario campuran:

- Customer mobile quote dan create order.
- Customer web quote dan create order.
- Courier offer polling/accept.
- Tracking ping.
- Payment callback.

Acceptance:

- Report p95/p99 latency per endpoint.
- DB CPU dan lock wait tercatat.
- Redis ops/sec dan error rate tercatat.
- RabbitMQ queue depth dan DLQ tercatat.
- Websocket fanout dan auth failure tercatat.

## P1 - Database Production Foundation

Foundation yang sudah disiapkan:

- Pool Postgres configurable lewat env `PG_POOL_MAX`, `PG_READ_POOL_MAX`, `PG_STATEMENT_TIMEOUT_MS`, `PG_QUERY_TIMEOUT_MS`.
- `READ_DATABASE_URL` tetap kontrak nyata untuk read replica, bukan fallback production.
- Migration scale foundation menambahkan tabel `api_idempotency_keys`, `event_outbox`, dan indeks hot-path.
- Compose menyiapkan env pool dan Socket.IO Redis adapter.
- Kubernetes manifest awal tersedia di `deploy/k8s/admin-service.yaml` dan `deploy/k8s/hpa.yaml`.

Production follow-up:

- Read replica harus replika fisik/managed, bukan container kosong.
- PgBouncer dipasang di depan writer dan reader.
- Partition native Postgres untuk `orders`, `order_events`, `courier_locations`, proof, audit, dan tracking dilakukan lewat migration terencana per tabel dengan backfill window.

## P2 - Idempotent Order & Payment

Mutation kritikal wajib memakai `X-Idempotency-Key`:

- Create order.
- Payment init/confirm/callback.
- Courier accept/reject offer.
- Pickup proof.
- POD.
- Payout.

Semua nilai uang tetap integer rupiah. Tidak ada float untuk pricing, ledger, fee, payout, atau payment.

Implementasi saat ini:

- Middleware `requireIdempotencyKey()` menyimpan hash request, response body, status code, device id, IP hash, dan user-agent hash.
- Retry dengan payload sama me-replay response.
- Retry dengan payload berbeda mengembalikan `IDEMPOTENCY_KEY_CONFLICT`.
- Mobile customer, web customer, payment confirm/init, courier accept/reject, proof, POD, dan payout sudah punya jalur idempotency.

## P3 - Event Bus & Worker Scaling

Event standar:

- `order.created`
- `payment.paid`
- `dispatch.offer.created`
- `offer.expired`
- `proof.uploaded`
- `pod.completed`
- `ledger.created`

Transactional outbox adalah batas aman: API menulis state awal dan event di transaksi yang sama; worker yang melakukan fanout/dispatch berat.

Implementasi saat ini:

- `event_outbox` diproses oleh worker `event-outbox-worker`.
- Publisher RabbitMQ memakai exchange topic `tembus.events` saat `OUTBOX_RABBITMQ_ENABLED=true`.
- Saat RabbitMQ dimatikan di lokal, worker memakai publish noop terstruktur sehingga API tetap bisa dites.
- Event `order.created` dan `payment.paid` sudah ditulis dari jalur order/payment customer utama.

## P4 - Realtime & State Sync

Socket.IO harus memakai Redis adapter saat service direplikasi.
Client mobile/web wajib melakukan snapshot sync saat reconnect, bukan mengandalkan event realtime yang mungkin hilang.
FCM adalah fallback untuk background/killed app, bukan sumber kebenaran tunggal.

Implementasi saat ini:

- Socket.IO Redis adapter aktif lewat `SOCKET_REDIS_ADAPTER_ENABLED=true`.
- Health/readiness backend tetap tersedia di `/health`.
- Client mobile/web sudah punya endpoint snapshot tracking/order; validasi multi-node harus dilakukan di staging cluster.

## P5 - Route Pricing Scale

Quote route/pricing harus cacheable berdasarkan:

- Provider maps.
- Pickup/dropoff coordinate yang sudah di-round.
- Vehicle profile.
- Service code.
- Package tier.

Submit order memakai route snapshot final yang sudah disimpan, sehingga harga tidak berubah diam-diam saat checkout.

Implementasi saat ini:

- Route cache memakai TTL utama `ROUTE_PRICING_CACHE_TTL_SECONDS`.
- Stale cache fallback memakai `ROUTE_PRICING_STALE_CACHE_TTL_SECONDS`.
- Provider circuit breaker memakai `MAPS_PROVIDER_CIRCUIT_FAILURE_THRESHOLD` dan `MAPS_PROVIDER_CIRCUIT_OPEN_SECONDS`.
- Google quota guard menghentikan hit provider saat env quota remaining terlalu rendah.
- Submit order tetap menghitung ulang trusted price server-side dan menyimpan route snapshot final ke `orders.route_snapshot`.

## P6 - Runtime Horizontal

Boundary production:

- API gateway.
- Auth service.
- Customer order service.
- Dispatch worker.
- Tracking ingest.
- Notification service.
- Payment service.
- Admin service.

Setiap service wajib punya readiness/liveness probe, resource request/limit, correlation id, dan trace propagation.

Implementasi saat ini:

- Manifest `deploy/k8s/admin-service.yaml` mendefinisikan deployment non-root, probes, resource request/limit, dan rolling update.
- Manifest `deploy/k8s/hpa.yaml` mendefinisikan autoscaling CPU/memory.
- Request context middleware mengisi `request_id` dan `correlation_id`.

## P7 - Observability & Guardrail

Metric wajib:

- Order create latency.
- Quote latency dan route provider latency.
- Payment success/fail.
- Dispatch lag.
- Offer expiry rate.
- Courier accept rate.
- DB connection saturation dan lock wait.
- Queue backlog.
- Websocket auth failure.
- Idempotency conflict.

Alert wajib hidup sebelum traffic production besar:

- DB connection saturation.
- RabbitMQ backlog atau DLQ growth.
- Provider route failure spike.
- Payment callback delay.
- Websocket auth failure spike.
- Duplicate idempotency conflict spike.

Implementasi saat ini:

- Rule awal Prometheus tersedia di `deploy/observability/prometheus-rules.yaml`.
- Maps runtime sudah mencatat structured observation untuk provider, latency, cache hit, fallback, dan anomaly.
- Load test awal tersedia di `scripts/load/on-demand-1m-day.k6.js`.

## Deployment Checklist P1-P7

- Isi secret Kubernetes: `DATABASE_URL`, `READ_DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, Firebase service account, Midtrans, Google/OSM provider key.
- Aktifkan PgBouncer dan read replica managed sebelum traffic besar.
- Jalankan migration Goose pada writer utama.
- Deploy admin-service minimal 3 replica dengan Redis adapter aktif.
- Jalankan k6 baseline dan simpan report p95/p99, DB lock wait, Redis ops, RabbitMQ depth, dan websocket fanout.
- Aktifkan Prometheus rules dan dashboard capacity per zone/service.
