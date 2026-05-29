# OpenTelemetry And Jaeger Foundation Tasks

Tanggal dibuat: 2026-05-29
Status: P0-P3 complete with local build, container runtime smoke, Jaeger trace, privacy, and collector-down verification
Target awal: VPS/staging TEMBUS

Dokumen ini adalah backlog penambahan fondasi observability dengan OpenTelemetry dan Jaeger. Tujuannya bukan langsung membuat sistem observability enterprise yang berat, tetapi menyiapkan standar tracing, request correlation, dan collector boundary supaya nanti bisa naik ke Grafana Tempo, SigNoz, Datadog, New Relic, atau cloud managed observability tanpa bongkar besar.

## Latest P3 Verification Notes

- `node scripts/ci/observability-guard.mjs` lulus dan memblokir attribute/log/artifact observability yang jelas membawa secret atau payload user.
- `npm run test:observability` di `backend/api-gateway` lulus, termasuk propagasi `request_id`, `trace_id`, dan `span_id`.
- `npm test -- --runInBand src/security/logRedaction.test.ts` di `backend/admin-service` lulus, termasuk preservasi ID observability yang aman dan redaction request/response body.
- `go test -v -timeout 5m ./...` lulus untuk `backend/auth-service` dan `backend/routing-service`.
- `docker run ... otel/opentelemetry-collector-contrib:0.128.0 validate --config=/etc/otelcol/config.yml` lulus untuk collector config.
- `docker compose config --quiet` lulus.
- `docker compose -f docker-compose.prod.yml config --quiet` lulus dengan dummy production env yang hanya dipakai untuk validasi struktur compose.
- Runtime smoke 2026-05-29 lulus setelah rebuild `api-gateway`, `auth-service`, `routing-service`, `otel-collector`, dan `jaeger`.
- Auth-service smoke `20260529232427`: invalid login `401`, customer register `200`, customer login `200`, direct auth spoof `401`, semua request ID terlihat di Jaeger dengan `service.name=auth-service`.
- Routing-service smoke `20260529232530`: direct route model request `200` dengan body `{"success":true,"model":"P2P"}` dan request ID terlihat di Jaeger dengan `service.name=routing-service`.
- Privacy smoke memastikan marker token, cookie, password/body, query `access_token`, dan spoofed internal header tidak muncul mentah di Jaeger trace JSON.
- Collector-down smoke `20260529232636`: `otel-collector` dimatikan, `api-gateway`, `auth-service`, dan `routing-service` direstart, lalu tetap melayani `/health`, invalid auth login `401`, dan route model `200`; collector berhasil kembali `running healthy`.
- `:app:compileDebugKotlin` lulus untuk mobile courier dan customer dengan JDK 17.
- Warning Android `org.gradle.api.plugins.Convention type has been deprecated` berasal dari Gradle/plugin compatibility menuju Gradle 9.0. Ini bukan security/runtime issue untuk release saat ini dan tidak perlu menaikkan SDK/Gradle sekarang.
- Warning Node `DEP0060 util._extend` berasal dari dependency proxy transitive dan bukan leak/security blocker; perlu dipantau saat upgrade dependency, tetapi tidak menghalangi runtime observability saat ini.
- Warning auth `auth_failure_recorded` pada log berasal dari invalid-login smoke yang disengaja, dengan identifier/IP sudah di-hash.
- Warning collector `unavailable` muncul tepat saat uji collector-down disengaja dan hilang setelah collector kembali healthy.

## Prinsip Implementasi

- OpenTelemetry SDK hanya mengirim data ke OpenTelemetry Collector melalui OTLP.
- Service aplikasi tidak boleh mengirim trace langsung ke Jaeger.
- Jaeger dipakai sebagai viewer tracing awal untuk VPS/staging.
- Collector menjadi satu-satunya tempat routing/exporter trace.
- Trace tidak boleh membawa token, password, cookie, OTP, alamat lengkap, nomor HP lengkap, email lengkap, raw request body, raw response body, atau koordinat GPS presisi tinggi.
- Observability tidak boleh membuat service utama gagal melayani request jika collector/Jaeger sedang down.
- Production sampling harus bisa dikontrol via environment variable.
- Mobile app tidak wajib full OpenTelemetry pada fase awal; mobile cukup membawa `X-Request-ID` dan mengirim crash/error context aman.

## Proposed Stack

- OpenTelemetry Collector: menerima OTLP HTTP/gRPC dari service.
- Jaeger: trace viewer awal di VPS/staging.
- Backend Node/TypeScript:
  - `@opentelemetry/sdk-node`
  - `@opentelemetry/auto-instrumentations-node`
  - OTLP exporter
- Backend Go:
  - `go.opentelemetry.io/otel`
  - `otelhttp`
  - OTLP exporter
- Web/admin/mobile:
  - Request correlation via `X-Request-ID`
  - Browser/mobile full tracing ditunda sampai privacy, sampling, dan data policy siap.

## Non-Goal Fase Ini

- Tidak memakai vendor observability berbayar dulu.
- Tidak membuat dashboard kompleks untuk semua metrik.
- Tidak melakukan tracing detail ke semua endpoint kecil.
- Tidak memasang OpenTelemetry penuh di mobile app.
- Tidak mengirim payload request/response mentah ke trace.
- Tidak menjadikan Jaeger sebagai dependency wajib agar aplikasi bisa start.

---

## P0 - Correlation Foundation

P0 adalah fondasi wajib sebelum distributed tracing penuh. Ini membuat log dan error dari mobile, gateway, service, dan database bisa dicari dengan satu ID.

### Contract: `X-Request-ID`, `traceparent`, And `X-Trace-ID`

- `X-Request-ID` adalah kode referensi support yang aman ditampilkan ke user. Nilainya tidak boleh berisi PII dan dibatasi karakter aman.
- `traceparent` adalah header W3C Trace Context untuk menyambungkan trace antar service. Jika client mengirim format invalid, gateway/service menggantinya dengan nilai baru yang valid.
- `X-Trace-ID` adalah bagian trace ID dari `traceparent`. Header ini dikembalikan untuk debugging, tetapi UI hanya perlu menampilkan `X-Request-ID`.
- `X-Correlation-ID` tetap dipertahankan untuk kompatibilitas log lama, tetapi default-nya mengikuti `X-Request-ID`.
- P0 hanya membuat kontrak dan propagation. Span aktual di Jaeger dimulai pada P1 saat SDK OpenTelemetry dan collector diaktifkan.

### OTEL-P0-01 Request ID Standardization

Problem:

Saat ada error seperti login kurir 500, debugging masih bergantung pada log per service. Tanpa request correlation, sulit melacak alur `mobile -> api-gateway -> auth-service -> database`.

Tasks:

- [x] Tetapkan header publik standar: `X-Request-ID`.
- [x] Gateway membuat request ID baru jika client tidak mengirim.
- [x] Gateway mengganti request ID yang terlalu panjang, mengandung karakter aneh, atau tidak sesuai format aman.
- [x] Gateway meneruskan request ID ke downstream service.
- [x] Semua response dari gateway mengembalikan `X-Request-ID`.
- [x] Admin-service membaca dan menulis request ID ke structured log.
- [x] Auth-service membaca dan menulis request ID ke structured log.
- [x] Routing-service membaca dan menulis request ID ke structured log.
- [x] Mobile courier dan mobile customer menyimpan request ID dari response error untuk debugging.
- [x] Customer web dan admin dashboard menampilkan kode referensi error berbasis request ID pada error state yang aman.

Acceptance criteria:

- Setiap request masuk punya request ID.
- Error 4xx/5xx dapat dicari di log backend memakai request ID yang sama.
- Request ID tidak mengandung PII.
- Request ID tetap ada walaupun OpenTelemetry Collector sedang mati.

Verification code/local:

- [x] Gateway observability unit test memastikan response punya `X-Request-ID`.
- [x] Gateway observability unit test memastikan request ID yang dikirim client diteruskan ke downstream proxy header.
- [x] Admin-service, auth-service, routing-service, customer web, admin dashboard, courier mobile, dan customer mobile berhasil build/compile setelah perubahan P0.
- [x] Negative test: kirim `X-Request-ID` panjang/aneh dan pastikan gateway mengganti sesuai policy lewat `npm run test:observability`.

Runtime smoke setelah image/container terbaru dijalankan:

- [x] Hit endpoint login customer via gateway dan pastikan response punya `X-Request-ID` setelah image/container terbaru dijalankan.
- [x] Hit endpoint login courier via mobile/dev client dan pastikan error state menyimpan kode referensi setelah image/container terbaru dijalankan.
- [x] Cek log gateway dan downstream service punya request ID yang sama setelah image/container terbaru dijalankan.

Files likely affected:

- `backend/api-gateway/src/index.ts`
- `backend/admin-service/src/middlewares.ts`
- `backend/auth-service`
- `backend/routing-service`
- `frontend/src/lib/api.ts`
- `admin-dashboard/src/lib/api.ts`
- `android-app/app/src/main/java/com/tembus/courier/di/NetworkModule.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/di/NetworkModule.kt`

### OTEL-P0-02 Trace Context Contract

Problem:

OpenTelemetry membutuhkan propagation standar agar trace antar service menyambung. Jika tiap service membuat trace sendiri, Jaeger akan menampilkan potongan trace yang tidak terhubung.

Tasks:

- [x] Tetapkan `traceparent` sebagai propagation header utama.
- [x] Gateway menerima `traceparent` hanya jika format valid.
- [x] Gateway membuat root trace context untuk request publik. Root span aktual dibuat pada P1 saat SDK OTel dipasang.
- [x] Gateway meneruskan `traceparent` ke service downstream.
- [x] Service internal hanya memakai `traceparent` yang sudah disanitasi, dengan boundary trust tetap di gateway/internal auth.
- [x] Dokumentasikan hubungan `X-Request-ID` dan `trace_id`.
- [x] Dokumentasikan allowlist attribute aman untuk P1 saat SDK OTel dipasang:
  - `service.name`
  - `deployment.environment`
  - `http.method`
  - `http.route`
  - `http.status_code`
  - `request.id`
- [x] Larang attribute berisi token, cookie, password, OTP, email lengkap, phone lengkap, alamat lengkap, atau raw body pada kontrak P0.

Acceptance criteria:

- Trace dari gateway ke downstream service tersambung dalam satu trace ID.
- Log tetap bisa dicari memakai request ID.
- Trace tidak membocorkan PII atau secret.

Verification code/local:

- [x] Kirim request middleware gateway dan cek `X-Trace-ID` muncul di response lewat `npm run test:observability`.
- [x] Cek kontrak P0 melarang token/cookie/body/PII pada trace/log attributes.
- [x] Cek direct service call tetap melewati sanitasi header di service yang sudah dipasang middleware P0.

Verification P1 saat SDK OTel aktif:

- [x] Cek span attributes tidak mengandung token/cookie/body setelah P1 SDK OTel aktif.
- [x] Cek direct service call tanpa gateway tidak bisa menyalahgunakan internal header pada span instrumentation.

Files likely affected:

- `backend/api-gateway/src/index.ts`
- `backend/admin-service/src/middlewares.ts`
- `backend/auth-service`
- `backend/routing-service`
- `docs/PRODUCTION_SECURITY_VERIFICATION_CHECKLIST.md`

### OTEL-P0-03 Observability Environment Contract

Problem:

Observability config harus bisa dikontrol dari `.env`, GitHub Actions Variables, dan VPS tanpa hardcoded endpoint. Namun service tidak boleh gagal total hanya karena collector down.

Tasks:

- [x] Tambahkan env contract:
  - `OTEL_ENABLED`
  - `OTEL_SERVICE_NAME`
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - `OTEL_EXPORTER_OTLP_PROTOCOL`
  - `OTEL_DEPLOYMENT_ENVIRONMENT`
  - `OTEL_TRACES_SAMPLER`
  - `OTEL_TRACES_SAMPLER_ARG`
- [x] Default development boleh `OTEL_ENABLED=false`.
- [x] Staging boleh enable dengan collector lokal Docker network.
- [x] Production enable hanya jika collector endpoint internal tersedia.
- [x] Jika collector down, service tetap start dan request tetap jalan karena P0 hanya memvalidasi format endpoint, bukan melakukan network dial.
- [x] Tambahkan dokumentasi env di production checklist.
- [x] Tambahkan contoh `.env.example` tanpa secret.

Acceptance criteria:

- Observability bisa dimatikan tanpa ubah kode.
- Endpoint collector tidak hardcoded di source.
- Service tetap fail-fast untuk secret utama, tetapi tidak fail-fast hanya karena Jaeger/collector unreachable.

Verification code/local:

- [x] Build service dengan `OTEL_ENABLED=false` default.
- [x] Build service dengan `OTEL_ENABLED=true` tetap tidak melakukan network dial ke collector pada P0.

Verification P1/runtime setelah collector tersedia:

- [x] Run service dengan `OTEL_ENABLED=true` dan collector aktif.
- [x] Run service dengan `OTEL_ENABLED=true` dan collector mati, pastikan service tetap melayani request.

Files likely affected:

- `.env.example`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `docs/PRODUCTION_SECURITY_VERIFICATION_CHECKLIST.md`

---

## P1 - VPS Collector And Jaeger Baseline

P1 menambahkan collector dan Jaeger di environment Docker supaya tracing bisa dilihat di staging/VPS.

### OTEL-P1-01 Add OpenTelemetry Collector To Compose

Problem:

Service butuh endpoint internal yang stabil untuk mengirim trace. Collector harus berada di private Docker network agar tidak terbuka publik.

Tasks:

- [x] Tambahkan service `otel-collector` ke Docker Compose development/staging.
- [x] Tambahkan config file collector, misalnya `observability/otel-collector-config.yml`.
- [x] Enable OTLP receiver:
  - gRPC `4317`
  - HTTP `4318`
- [x] Export traces dari collector ke Jaeger.
- [x] Jangan expose OTLP port ke internet pada production compose.
- [x] Tambahkan healthcheck collector.
- [x] Tambahkan resource limit collector yang realistis untuk VPS.

Acceptance criteria:

- Service backend dapat mengirim trace ke collector via Docker network.
- Collector tidak membutuhkan credential hardcoded.
- Collector tidak mengekspos port publik kecuali memang dibutuhkan untuk development lokal.

Verification:

- [x] `docker compose config` valid.
- [x] `docker compose up otel-collector jaeger` berhasil.
- [x] Collector healthcheck healthy.
- [x] Port OTLP tidak terbuka publik pada compose production.

Files likely affected:

- `docker-compose.yml`
- `docker-compose.prod.yml`
- `observability/otel-collector-config.yml`

### OTEL-P1-02 Add Jaeger To Compose

Problem:

Tim butuh viewer trace sederhana untuk debugging tanpa membeli vendor observability.

Tasks:

- [x] Tambahkan service `jaeger` untuk staging/development.
- [x] Expose Jaeger UI hanya untuk localhost/VPN/internal admin network.
- [x] Pastikan Jaeger menerima trace dari collector, bukan langsung dari app.
- [x] Tambahkan volume jika retention dibutuhkan.
- [x] Dokumentasikan URL UI Jaeger dan cara akses aman di VPS.
- [x] Tambahkan catatan bahwa Jaeger UI tidak boleh public tanpa auth/reverse proxy.

Acceptance criteria:

- Trace dapat dilihat di Jaeger UI.
- Jaeger tidak menjadi jalur data publik.
- Jaeger dapat diganti Tempo/SigNoz nanti hanya dengan mengubah collector exporter.

Verification:

- [x] Buka Jaeger UI lokal/VPS internal.
- [x] Cari trace berdasarkan service name.
- [x] Cari trace berdasarkan request ID attribute.

Files likely affected:

- `docker-compose.yml`
- `docker-compose.prod.yml`
- `docs/PRODUCTION_SECURITY_VERIFICATION_CHECKLIST.md`
- `docs/VPS_SECURITY_RUNBOOK.md`

P1 implementation note:

- Jaeger retention awal sengaja memakai storage in-memory/all-in-one tanpa volume persisten. Ini cukup untuk staging/VPS awal dan mencegah trace data lama menumpuk sebelum ada retention policy. Jika nanti butuh audit trail trace jangka panjang, pindahkan exporter collector ke Tempo/SigNoz/vendor yang punya retention, auth, dan storage policy.
- Jaeger UI dibind ke `127.0.0.1` secara default. Akses VPS harus melalui SSH tunnel, VPN, atau reverse proxy yang diberi auth.
- App mengirim trace hanya ke OpenTelemetry Collector. App tidak mengirim trace langsung ke Jaeger.

### OTEL-P1-03 Gateway Tracing First

Problem:

Gateway adalah entry point request publik. Instrumentasi di gateway memberi nilai debugging paling cepat dengan scope kecil.

Tasks:

- [x] Tambahkan OpenTelemetry bootstrap di `api-gateway`.
- [x] Instrument incoming HTTP request.
- [x] Instrument outgoing HTTP proxy/downstream request.
- [x] Set `service.name=api-gateway`.
- [x] Tambahkan `deployment.environment`.
- [x] Tambahkan request ID sebagai span attribute.
- [x] Pastikan CORS dan internal auth header hardening tetap tidak berubah.
- [x] Tambahkan graceful shutdown untuk OTel SDK.

Acceptance criteria:

- Request publik muncul sebagai root span di Jaeger.
- Downstream call dari gateway muncul sebagai child span jika downstream sudah terinstrumentasi.
- Gateway tetap berjalan jika collector tidak tersedia.

Verification:

- [x] `backend/api-gateway npm run build` lulus.
- [x] Hit `/health` dan satu endpoint API melalui gateway.
- [x] Trace gateway muncul di Jaeger.
- [x] Matikan collector dan pastikan gateway tetap melayani request.

Files likely affected:

- `backend/api-gateway/src/index.ts`
- `backend/api-gateway/package.json`
- `backend/api-gateway/package-lock.json`

### OTEL-P1-04 Admin-Service Tracing

Problem:

Admin-service memegang banyak endpoint operasional, upload, customer order, notification, dan audit. Ini perlu trace agar error admin/customer web cepat ditemukan.

Tasks:

- [x] Tambahkan OpenTelemetry bootstrap di admin-service.
- [x] Instrument Express middleware.
- [x] Instrument outbound HTTP jika ada.
- [x] Instrument Postgres query secara aman jika library mendukung.
- [x] Instrument Redis jika dipakai.
- [x] Set `service.name=admin-service`.
- [x] Propagate trace context dari gateway.
- [x] Pastikan log redaction test tetap lulus.

Acceptance criteria:

- Request dari gateway ke admin-service muncul dalam trace yang sama.
- Query database terlihat sebagai span tanpa SQL parameter sensitif.
- Tidak ada PII/secret dalam span attributes.

Verification:

- [x] `backend/admin-service npm run build` lulus.
- [x] `backend/admin-service npm test -- --runInBand` lulus.
- [x] Trace admin-service muncul di Jaeger.
- [x] Redaction test tetap hijau.

Files likely affected:

- `backend/admin-service/src`
- `backend/admin-service/package.json`
- `backend/admin-service/package-lock.json`

P1 verification notes:

- `docker compose config --quiet` lulus untuk compose development.
- `docker compose -f docker-compose.prod.yml config --quiet` lulus dengan dummy production env di proses shell, memastikan struktur production compose valid tanpa menulis secret ke repo.
- `docker compose up -d jaeger otel-collector` lulus; keduanya `healthy`.
- Gateway trace muncul di Jaeger untuk service smoke unik.
- Admin-service trace muncul di Jaeger untuk service smoke unik.
- Trace lintas `api-gateway -> admin-service` muncul dalam satu trace saat request `/api/v1/maps/config` lewat gateway.
- Privacy smoke test memastikan nilai unik `token`, `password`, `otp`, `Authorization`, dan `Cookie` tidak muncul mentah di Jaeger. `http.target`, `http.url`, dan `url.full` berisi marker `%5BREDACTED%5D`.
- Simulasi collector down memastikan gateway dan admin-service tetap melayani `/health`.
- Warning runtime yang tersisa: `DEP0060 util._extend` berasal dari dependency upstream `http-proxy@1.18.1` yang dipakai `http-proxy-middleware`. Versi `http-proxy` tersebut masih latest di npm; warning ini bukan leak/security issue dan tidak memblokir runtime, tetapi perlu dipantau saat upgrade Node besar berikutnya.
- Local smoke admin-service sempat mencatat `event_outbox_worker_error` karena database lokal belum punya tabel `event_outbox`. Tabelnya sudah ada di migration `20260522000001_scale_foundation_idempotency_outbox.sql`; jalankan migration lokal atau set `EVENT_OUTBOX_WORKER_ENABLED=false` untuk smoke yang tidak menguji outbox.

---

## P2 - Critical Service Instrumentation

P2 memperluas tracing ke service Go dan alur bisnis penting setelah gateway/admin-service stabil.

### OTEL-P2-01 Auth-Service Tracing

Problem:

Login customer, login kurir, OTP, refresh token, dan session exchange adalah flow paling sering menjadi sumber incident.

Tasks:

- [x] Tambahkan OTel Go SDK ke auth-service.
- [x] Instrument HTTP handler dengan `otelhttp`.
- [x] Propagate `traceparent` dari gateway.
- [x] Tambahkan `service.name=auth-service`.
- [x] Tambahkan span untuk login, OTP verification, refresh token, dan customer credential lookup.
- [x] Pastikan password, OTP, token, phone, dan email lengkap tidak pernah masuk span.
- [x] Tambahkan shutdown exporter yang aman.

Acceptance criteria:

- Flow login dari gateway ke auth-service terlihat dalam satu trace.
- Error login 4xx/5xx punya request ID dan trace ID.
- Tidak ada secret/PII dalam attributes.

Verification code/local:

- [x] `cd backend/auth-service && go test -v -timeout 5m ./...` lulus.
- [x] `docker run --rm -v "${PWD}:/workspace" -w /workspace/backend/auth-service golang:1.25-bookworm go test -v -race -timeout 5m ./...` lulus.
- [x] `cd backend/auth-service && go mod verify` lulus.
- [x] Unit test memastikan `OTEL_ENABLED=true` tidak melakukan network dial ke collector saat startup.
- [x] Unit test memastikan production menolak `localhost` sebagai collector endpoint.
- [x] Static review span attributes hanya memakai tipe identifier, role, boolean, status generik, dan tidak memasukkan password, OTP value, token value, phone/email lengkap, cookie, atau body.

Runtime smoke setelah image/container terbaru dijalankan:

- [x] Login sukses dan gagal terlihat di Jaeger dengan `service.name=auth-service`.
- [x] Collector mati tidak membuat auth-service gagal start atau gagal melayani request.

Files likely affected:

- `backend/auth-service`
- `backend/auth-service/internal/observability/tracing.go`
- `backend/auth-service/internal/observability/tracing_test.go`
- `backend/auth-service/cmd/api/main.go`
- `backend/auth-service/internal/middleware/base_middleware.go`
- `backend/auth-service/internal/service/auth_service.go`

### OTEL-P2-02 Routing-Service Tracing

Problem:

Route, pricing, maps config, dan zone resolution rawan lambat atau gagal karena provider eksternal/database geospatial.

Tasks:

- [x] Tambahkan OTel Go SDK ke routing-service.
- [x] Instrument HTTP handler dengan `otelhttp`.
- [x] Tambahkan span untuk route calculation.
- [x] Tambahkan span untuk zone resolver/PostGIS lookup.
- [x] Tambahkan attribute aman:
  - `route.provider`
  - `route.distance_bucket`
  - `route.cache_hit`
  - `zone.resolved`
- [x] Jangan simpan koordinat presisi tinggi dalam trace.
- [x] Propagate request ID dan traceparent.

Acceptance criteria:

- Latency route/pricing bisa dilihat di trace.
- Zone lookup error bisa dicari dengan request ID.
- Koordinat user tidak bocor.

Verification code/local:

- [x] `cd backend/routing-service && go test -v -timeout 5m ./...` lulus.
- [x] `docker run --rm -v "${PWD}:/workspace" -w /workspace/backend/routing-service golang:1.25-bookworm go test -v -race -timeout 5m ./...` lulus.
- [x] `cd backend/routing-service && go mod verify` lulus.
- [x] Unit test memastikan `OTEL_ENABLED=true` tidak melakukan network dial ke collector saat startup.
- [x] Unit test memastikan production menolak `localhost` sebagai collector endpoint.
- [x] Unit test memastikan `route.distance_bucket` memakai label kasar, bukan koordinat atau jarak presisi.
- [x] Static review span attributes tidak mengandung raw lat/lng detail.

Runtime smoke setelah image/container terbaru dijalankan:

- [x] Route request muncul di Jaeger dengan `service.name=routing-service`.

Files likely affected:

- `backend/routing-service`
- `backend/routing-service/internal/observability/tracing.go`
- `backend/routing-service/internal/observability/tracing_test.go`
- `backend/routing-service/main.go`
- `backend/routing-service/internal/routing/selector.go`
- `backend/routing-service/internal/routing/selector_test.go`
- `backend/routing-service/internal/routing/zone_resolver.go`

### OTEL-P2-03 Order And Payment Flow Readiness

Problem:

Create order, accept offer, payment, payout, upload POD, dan webhook adalah flow kritis. Instrumentasi perlu direncanakan agar nanti mudah dilanjutkan.

Tasks:

- [x] Identifikasi service pemilik order create, order status, payment, payout, webhook, dan POD upload.
- [x] Tambahkan task lanjutan per service setelah gateway/auth/admin/routing stabil.
- [x] Standarkan span name untuk:
  - `order.create`
  - `order.calculate_price`
  - `courier.offer.accept`
  - `payment.snap.create`
  - `payment.webhook.verify`
  - `payout.request.create`
  - `pod.upload`
- [x] Pastikan amount boleh dicatat sebagai bucket/range, bukan nilai detail jika risk policy meminta.
- [x] Pastikan provider reference ID tidak masuk trace jika dianggap sensitif.

Acceptance criteria:

- Ada kontrak span name untuk flow bisnis utama.
- Implementasi berikutnya tidak membuat naming trace liar antar service.
- Payment/webhook tidak membocorkan signature, token, atau payload mentah.

Verification:

- [x] Review kontrak span name dengan endpoint matrix.
- [x] Tambahkan dokumentasi flow trace order/payment.

Files likely affected:

- `backend/order-service`
- `backend/payment-service`
- `backend/admin-service`
- `docs/PRODUCTION_SECURITY_VERIFICATION_CHECKLIST.md`

Order/payment trace contract:

| Flow | Owner | Standard span name | Safe attributes | Forbidden attributes |
|---|---|---|---|---|
| Customer creates order | `backend/order-service` | `order.create` | `order.type`, `order.status`, `order.distance_bucket`, `request.id` | Full pickup/dropoff address, raw lat/lng, customer phone/email |
| Price calculation | `backend/order-service` with routing dependency | `order.calculate_price` | `pricing.currency`, `pricing.amount_bucket`, `route.distance_bucket`, `route.provider` | Exact amount if policy disallows it, promo secret, provider raw payload |
| Courier accepts offer | `backend/order-service` | `courier.offer.accept` | `courier.mode`, `offer.status`, `request.id` | Courier phone/email, exact current location, device token |
| Midtrans Snap creation | `backend/payment-service` or admin payment boundary | `payment.snap.create` | `payment.provider`, `payment.status`, `pricing.amount_bucket` | Midtrans server key, Snap token, card/customer PII, raw provider response |
| Payment webhook verification | `backend/payment-service` | `payment.webhook.verify` | `payment.provider`, `webhook.verified`, `payment.status` | Signature key, signature value, raw webhook body, provider reference if policy marks it sensitive |
| Courier payout request | `backend/admin-service` / payout boundary | `payout.request.create` | `payout.status`, `pricing.amount_bucket`, `request.id` | Bank account number, KTP/PII, exact payout provider reference |
| Proof of delivery upload | `backend/order-service` / upload boundary | `pod.upload` | `pod.file_type`, `pod.size_bucket`, `upload.status` | File bytes, public URL with token, customer address detail |

P2 implementation notes:

- Auth-service dan routing-service memakai OTLP HTTP exporter dengan endpoint internal default `http://otel-collector:4318`.
- `OTEL_ENABLED=false` tetap menjadi default aman, jadi service tidak bergantung pada collector untuk start.
- Production menolak collector endpoint `localhost` saat tracing aktif agar container VPS tidak salah mengirim trace ke dirinya sendiri.
- Runtime spans tidak menggunakan `RecordError(err)` untuk validasi yang berpotensi mengandung koordinat, token, atau identifier mentah. Status error dicatat sebagai string generik.
- Warning lokal `go test -race` di Windows disebabkan `CGO_ENABLED=0` atau tidak adanya `gcc` di `%PATH%`. Ini bukan bug aplikasi. Race gate berhasil lewat container Linux `golang:1.25-bookworm`.
- `docker compose config --quiet` lulus untuk compose development.
- `docker compose -f docker-compose.prod.yml config --quiet` lulus saat dummy production env yang kuat disuntik hanya pada proses shell. Tanpa env production, compose memang fail-fast dan itu perilaku yang diinginkan.

---

## P3 - Metrics, Logs, Mobile Correlation, And CI Gates

P3 menaikkan observability dari trace viewer menjadi operasi harian yang lebih siap production.

### OTEL-P3-01 Basic Metrics Readiness

Problem:

Tracing bagus untuk debugging request individual, tetapi operasi production juga perlu error rate, latency, traffic, dan saturation.

Tasks:

- [x] Definisikan metrics minimum:
  - request count
  - request duration
  - error count
  - active request
  - DB query duration
  - external provider duration
- [x] Putuskan apakah metrics dikirim via OTel Collector ke Prometheus atau tetap native Prometheus exporter.
- [x] Tambahkan label rendah cardinality:
  - service
  - route template
  - method
  - status class
  - environment
- [x] Larang label `user_id`, `order_id`, email, phone, token, dan full URL dengan query.

Acceptance criteria:

- Metrics tidak menyebabkan cardinality explosion.
- Metrics bisa masuk Grafana/Prometheus nanti tanpa ubah instrumentasi besar.

Verification:

- [x] Review metric labels.
- [x] Jalankan collector config lint jika tersedia.

Implementation notes:

- Keputusan awal adalah hybrid yang ringan: metrics runtime yang sudah ada tetap memakai native Prometheus endpoint untuk gateway, sementara OpenTelemetry Collector sudah siap menerima OTLP metrics untuk service yang nanti memakai SDK metrics.
- Collector P3 menambahkan pipeline `metrics` dengan `debug/metrics` exporter `basic`. Ini memvalidasi kontrak OTLP metrics tanpa membuka storage/endpoint Prometheus baru sebelum Grafana/Prometheus siap.
- Minimum labels yang diizinkan: `service`, `route`, `method`, `status_class`, dan `environment`. Label user/order/device/email/phone/token/full URL dilarang.
- Jika nanti Prometheus/Grafana siap, route upgrade yang disarankan adalah menambahkan exporter Prometheus di Collector atau scrape native endpoint yang sudah ada, bukan menaruh high-cardinality labels di aplikasi.

Files likely affected:

- `observability/otel-collector-config.yml`
- `backend/*`

### OTEL-P3-02 Log Correlation With Trace ID

Problem:

Jaeger membantu melihat trace, tetapi log tetap menjadi sumber detail error. Log perlu punya `trace_id`, `span_id`, dan `request_id`.

Tasks:

- [x] Tambahkan trace ID ke structured logs jika context tersedia.
- [x] Tambahkan span ID ke structured logs jika context tersedia.
- [x] Pastikan log redaction tetap berjalan setelah menambah field observability.
- [x] Tambahkan query contoh untuk mencari log berdasarkan request ID.
- [x] Siapkan path naik kelas ke Loki/Grafana Alloy tanpa ubah struktur log.

Acceptance criteria:

- Dari Jaeger trace bisa lompat ke log via request ID/trace ID secara manual.
- Log tidak membocorkan PII.
- Format JSON log tetap stabil.

Verification:

- [x] Trigger error test dan cari log berdasarkan request ID.
- [x] Cek log punya trace ID ketika request melalui OTel.
- [x] Cek log tetap punya request ID ketika OTel mati.

Implementation notes:

- `api-gateway`, `admin-service`, `auth-service`, dan `routing-service` sekarang menulis `request_id`, `trace_id`, dan `span_id` ke structured logs saat context tersedia.
- `span_id` tidak dikembalikan ke public response. Public clients cukup memakai `X-Request-ID` dan `X-Trace-ID`.
- Admin-service redaction mempertahankan observability IDs yang valid, tetapi tetap meredaksi `authorization`, `cookie`, password, OTP, token, raw request body, dan raw response body.
- Query Docker log manual:

```bash
REQUEST_ID=tmb-example
docker compose logs api-gateway admin-service auth-service routing-service | grep "$REQUEST_ID"
```

- Query Loki/Grafana nanti dapat memakai label `service` lalu filter JSON field `request_id` atau `trace_id`, tanpa mengubah format log aplikasi.

Files likely affected:

- `backend/api-gateway/src/index.ts`
- `backend/admin-service/src/middlewares.ts`
- `backend/auth-service`
- `backend/routing-service`

### OTEL-P3-03 Mobile Error Correlation

Problem:

Mobile tidak perlu full OTel sekarang, tetapi ketika user melapor error, tim harus bisa mencari backend request terkait.

Tasks:

- [x] Courier app membaca `X-Request-ID` dari response error.
- [x] Customer app membaca `X-Request-ID` dari response error.
- [x] Error UI menampilkan kode referensi pendek, bukan stack trace.
- [x] Crashlytics menambahkan request ID terakhir sebagai custom key yang aman.
- [x] Jangan kirim token, phone, email, alamat, atau koordinat mentah ke Crashlytics.
- [x] Tambahkan smoke test mobile untuk error reference code.

Acceptance criteria:

- User dapat mengirim kode error ke support.
- Support bisa mencari request ID tersebut di backend log.
- Mobile tidak mengirim PII tambahan.

Verification:

- [x] Simulasikan login gagal dan cek UI punya kode referensi.
- [x] Simulasikan endpoint 500 dan cek Crashlytics/log aman.
- [x] Cek backend log punya request ID yang sama.

Implementation notes:

- Courier dan customer mobile memakai `NetworkRequestReferenceStore` untuk menyimpan request ID terakhir dan membuat format UI `Ref XXXXX`.
- Store yang sama sekarang mengisi Crashlytics custom key `last_backend_request_id`. Nilainya hanya request ID atau `none`, bukan payload, token, phone, email, alamat, atau koordinat.
- Smoke checklist mobile menambahkan C-23 dan U-23 untuk validasi error reference di release/internal testing build.

Files likely affected:

- `android-app/app/src/main/java/com/tembus/courier`
- `android-app-customer/app/src/main/java/com/tembus/customer`
- `docs/MOBILE_SMOKE_TEST_CHECKLIST.md`

### OTEL-P3-04 CI And Security Guards

Problem:

Observability code sering tanpa sengaja membawa raw body, Authorization header, cookie, atau PII ke attributes/log.

Tasks:

- [x] Tambahkan static grep guard untuk attribute/log berbahaya:
  - `authorization`
  - `cookie`
  - `password`
  - `otp`
  - `token`
  - `rawBody`
  - `request.body`
  - `response.body`
- [x] Tambahkan unit test redaction untuk trace/log attributes.
- [x] Tambahkan workflow check agar collector config valid.
- [x] Tambahkan Docker Compose config check untuk observability service.
- [x] Tambahkan dokumentasi bahwa GitHub Actions tidak boleh upload trace artifact yang berisi data user.

Acceptance criteria:

- CI mencegah instrumentasi yang jelas-jelas membocorkan secret/PII.
- Collector config broken tidak lolos CI.
- Observability artifact tidak mengandung data user.

Verification:

- [x] Jalankan static guard lokal.
- [x] Jalankan unit test redaction.
- [x] Jalankan `docker compose config`.

Implementation notes:

- Static guard berada di `scripts/ci/observability-guard.mjs`.
- CI staging dan PR quality sekarang menjalankan guard, validasi collector config dengan image `otel/opentelemetry-collector-contrib:0.128.0`, dan `docker compose config --quiet`.
- Workflow guard juga menolak upload artifact trace/Jaeger/OTel supaya GitHub Actions tidak menyimpan data user di artifact.

Files likely affected:

- `.github/workflows/staging.yml`
- `.github/workflows/pr-quality.yml`
- `scripts/ci`
- `observability/otel-collector-config.yml`

### OTEL-P3-05 Production Runbook

Problem:

Tracing hanya berguna jika tim tahu cara memakainya saat incident.

Tasks:

- [x] Tambahkan runbook "cara cari error berdasarkan request ID".
- [x] Tambahkan runbook "cara buka Jaeger di VPS dengan aman".
- [x] Tambahkan runbook "cara cek collector down".
- [x] Tambahkan runbook "cara menurunkan sampling saat traffic tinggi".
- [x] Tambahkan runbook "cara disable OTel sementara".
- [x] Tambahkan checklist privacy sebelum enable mobile/browser tracing.

Acceptance criteria:

- Developer/support bisa mengikuti langkah debugging tanpa menebak.
- Ada prosedur aman untuk disable/enable tracing.
- Ada jalur upgrade ke Grafana Tempo/SigNoz/vendor tanpa ubah aplikasi.

Verification:

- [x] Dry run debugging error login memakai request ID.
- [x] Dry run collector restart.
- [x] Dry run Jaeger UI access dari VPS.

Files likely affected:

- `docs/VPS_SECURITY_RUNBOOK.md`
- `docs/PRODUCTION_SECURITY_VERIFICATION_CHECKLIST.md`
- `docs/OPENTELEMETRY_JAEGER_TASKS.md`

---

## Recommended Execution Order

1. OTEL-P0-01 Request ID Standardization
2. OTEL-P0-02 Trace Context Contract
3. OTEL-P0-03 Observability Environment Contract
4. OTEL-P1-01 Add OpenTelemetry Collector To Compose
5. OTEL-P1-02 Add Jaeger To Compose
6. OTEL-P1-03 Gateway Tracing First
7. OTEL-P1-04 Admin-Service Tracing
8. OTEL-P2-01 Auth-Service Tracing
9. OTEL-P2-02 Routing-Service Tracing
10. OTEL-P3-02 Log Correlation With Trace ID
11. OTEL-P3-03 Mobile Error Correlation
12. OTEL-P3-04 CI And Security Guards
13. OTEL-P3-05 Production Runbook

## P0 Definition Of Done

- [x] Request ID distandardkan di gateway, admin-service, auth-service, routing-service, web/admin client, dan mobile client.
- [x] Request ID dan trace context disanitasi agar input client yang tidak aman tidak dipercaya mentah.
- [x] Gateway unit test memastikan `X-Request-ID`, `traceparent`, dan `X-Trace-ID` tersedia serta diteruskan ke downstream header.
- [x] Log/error envelope backend membawa `request_id` dan `trace_id` tanpa menambahkan raw token, cookie, password, OTP, body, email/phone lengkap, alamat lengkap, atau koordinat presisi.
- [x] Mobile/web/admin memiliki jalur kode untuk menampilkan kode referensi error aman berbasis `X-Request-ID`.
- [x] Observability environment contract tersedia di `.env.example`, `.env.production.example`, dan production checklist.
- [x] Build/test lokal P0 lulus untuk service dan aplikasi yang terkena perubahan.
- [x] Runtime smoke request ID di container/image terbaru setelah rebuild/deploy.

## Full Observability Definition Of Done

- Evidence 2026-05-29:
  - Runtime container terbaru sudah diverifikasi melalui `docker compose up -d --build api-gateway auth-service admin-service routing-service frontend admin-dashboard`.
  - Smoke request `tmb-full-dod-20260529225132` menghasilkan `X-Request-ID` pada response `/health` dan invalid customer login.
  - Request ID yang sama muncul 2 kali di log `api-gateway` dan 1 kali di log `auth-service`.
  - Courier login smoke `tmb-courier-mobile-dod-20260529230300` menghasilkan response 401 dengan `X-Request-ID`; mobile error helper menambahkan request reference ke error state dari header tersebut.
  - Mobile courier/customer error helper sudah menambahkan support reference dari `X-Request-ID` pada login, order, payment, address/profile, scan, dan PoD error path.
  - Customer web dan admin dashboard tetap memakai axios interceptor untuk menambahkan `Ref ...` dari `X-Request-ID` ke error message aman.
  - Warning verifikasi Android: Gradle deprecation menuju Gradle 9.0 muncul, tetapi `:app:compileDebugKotlin` courier dan customer lulus dengan JDK 17; warning ini bukan leak/security blocker saat ini.

- [x] Request ID tersedia di semua response publik pada runtime container terbaru.
- [x] Request ID muncul di log gateway dan service downstream pada runtime container terbaru.
- [x] Trace dari gateway ke minimal satu downstream service terlihat di Jaeger.
- [x] Collector/Jaeger berjalan di Docker network internal.
- [x] Service tetap berjalan saat collector/Jaeger down.
- [x] Tidak ada PII/secret di span attributes setelah SDK OTel aktif.
- [x] Mobile/web/admin bisa menampilkan kode referensi error aman pada smoke test runtime.
- [x] Runbook debugging request ID tersedia.
- [x] CI guard mencegah observability leak yang jelas.
