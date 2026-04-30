# TASK BREAKDOWN — DEVELOPMENT ROADMAP
## Platform Logistik Hyperlocal Relay
### Versi 1.1 | Sprint-based Agile | April 2026

> **Changelog v1.1 (29 April 2026):** Ditambahkan 9 task baru untuk implementasi Feature Flag Management (FF-DB-001 s/d FF-QA-001). Total +38 SP dari 410 SP menjadi 448 SP. Dampak timeline <2%.

---

## OVERVIEW TIMELINE

| Fase | Durasi | Sprint | Deliverable |
|---|---|---|---|
| **Fase 0: Foundation** | 3 minggu | Sprint 0-1 | Infrastruktur, setup, CI/CD |
| **Fase 1: Core Backend** | 5 minggu | Sprint 2-4 | Auth, Order, Pricing, Payment + **FF-DB, FF-BACK** |
| **Fase 2: Mobile MVP** | 6 minggu | Sprint 5-7 | Customer App + Courier App + **FF-MOB** |
| **Fase 3: Advanced Features** | 4 minggu | Sprint 8-9 | Scanning, Relay, Dynamic Pricing |
| **Fase 4: Admin Dashboard** | 3 minggu | Sprint 10-11 | Web Dashboard + **FF-WEB** |
| **Fase 5: QA & Hardening** | 3 minggu | Sprint 12 | Testing, Security + **FF-QA** |
| **Fase 6: Pilot Launch** | Ongoing | — | Go-live, monitoring |

**Total Estimasi:** ~24 minggu (6 bulan) untuk MVP + Pilot  
**Story Points:** 410 SP (v1.0) + 38 SP (Feature Flags v1.1) = **448 SP total**  
**Team Size:** 10 orang (sesuai jumlah founder)

---

## TEAM ROLES & ASSIGNMENT

| Role | Jumlah | Tanggung Jawab |
|---|---|---|
| Tech Lead / Architect | 1 (CTO) | Arsitektur, code review, tech decisions |
| Backend Engineer | 3 | Node.js/Go microservices, API, DB |
| Mobile Engineer | 2 | Flutter (Customer + Courier app) |
| Frontend Engineer | 1 | React.js Admin Dashboard |
| ML Engineer | 1 | Volumetric scanning model |
| DevOps Engineer | 1 | Infrastructure, CI/CD, monitoring |
| QA Engineer | 1 | Testing, automation, security |

---

## FASE 0: FOUNDATION (Minggu 1-3)

### Sprint 0: Infrastructure & DevOps Setup

#### INFRA-001: Cloud Infrastructure Setup
**Assignee:** DevOps  
**Estimasi:** 3 hari  
**Priority:** P0 — Blocker untuk semua task lain

Subtask:
- [ ] Buat AWS/GCP account + organization structure
- [ ] Setup VPC dengan subnet public/private
- [ ] Provision server environments:
  - Development: 1 vCPU, 2GB RAM
  - Staging: 1 vCPU, 2GB RAM  
  - Production: 2 vCPU, 4GB RAM, 50GB SSD
- [ ] Setup managed PostgreSQL (RDS atau Cloud SQL) + enable PostGIS
- [ ] Setup Redis Cluster (ElastiCache atau Redis Cloud)
- [ ] Setup S3/GCS bucket dengan lifecycle policy
- [ ] Setup CloudFront/CDN untuk static assets
- [ ] Configure domain + SSL certificate (Let's Encrypt atau ACM)

---

#### INFRA-002: CI/CD Pipeline
**Assignee:** DevOps  
**Estimasi:** 2 hari

Subtask:
- [x] Setup GitHub repository (monorepo atau multi-repo)
- [x] Branching strategy: `main` → `staging` → `develop` → feature branches
- [x] GitHub Actions pipeline untuk setiap service:
  - [x] Lint + unit test
  - [x] Build Docker image
  - [x] Push ke container registry
  - [x] Deploy ke staging (auto) / production (manual approval)
- [ ] Pre-commit hooks: ESLint, Prettier, Husky
- [ ] Automated database migration runner (Flyway atau Knex)
- [ ] Slack notifications untuk deploy events

---

#### INFRA-003: Monitoring & Observability
**Assignee:** DevOps  
**Estimasi:** 2 hari

Subtask:
- [ ] Setup centralized logging: ELK Stack atau Datadog Logs
- [ ] Application metrics: Prometheus + Grafana
- [ ] Uptime monitoring: UptimeRobot atau Pingdom
- [ ] Error tracking: Sentry (backend + mobile)
- [ ] APM: Datadog APM atau New Relic
- [ ] Setup alerting: PagerDuty / OpsGenie untuk on-call
- [ ] Dashboard Grafana: server metrics, API latency, DB connections

---

#### INFRA-004: Security Baseline
**Assignee:** DevOps + Backend Lead  
**Estimasi:** 2 hari

Subtask:
- [ ] Setup WAF (AWS WAF atau Cloudflare) — butuh server
- [x] Configure security headers (HSTS, CSP, X-Frame-Options) — implemented di auth-service middleware
- [ ] Secrets management: AWS Secrets Manager atau HashiCorp Vault — butuh server
- [ ] Setup VPN untuk akses database production — butuh server
- [ ] Enable database encryption at rest — butuh cloud DB
- [ ] Setup backup otomatis: database (daily, 30 hari retensi), S3 (versioning) — butuh server
- [x] Dependency vulnerability scanning: govulncheck + gosec (Go) + npm audit (Node) di CI/CD pipeline

---

#### INFRA-005: Development Environment
**Assignee:** Tech Lead  
**Estimasi:** 1 hari

Subtask:
- [x] Docker Compose file untuk local development (semua services) — `docker-compose.yml`: PostgreSQL+PostGIS, Redis, auth+admin+routing service, health checks
- [x] `.env.example` dengan semua environment variables terdokumentasi — lengkap: DB, JWT, payment, maps, notifs, storage
- [x] Makefile/scripts untuk common tasks (migrate, seed, test, lint) — `Makefile`: make dev, migrate, test, lint, sec-audit, build
- [ ] README lengkap: setup instructions, architecture overview
- [ ] API documentation framework: Swagger/OpenAPI 3.0

---

### Sprint 1: Database & Core Architecture

#### [x] DB-001: Database Schema Initialization (PostgreSQL)  
- [x] DB-002: Migration & Seeding Strategy  
**Estimasi:** 4 hari

Subtask:
- [x] Buat semua migrasi database sesuai ERD (00008_missing_tables.sql — sla_logs, relay_score_history, weather_logs, notifications, payouts, ratings, vouchers, referrals, GPS logs, insurance, SLA configs)
- [x] Setup migration runner — goose digunakan, migration-test job di CI/CD (goose up + down di PostGIS container)
- [x] Buat seed data untuk development:
  - [x] 5 zona Jakarta (Timur, Barat, Pusat, Utara, Selatan) — dengan PostGIS polygon
  - [x] 10 meeting points — tersebar di 5 zona
  - [x] SLA config default — per model per leg
  - [x] Pricing config default — semua 3 model
  - [x] Feature flags default — semua 15 flags (00009_full_seed.sql)
- [x] Buat DB indexes sesuai query pattern (00010_db_indexes.sql — 17 partial indexes)
- [ ] Test query performance untuk order listing, courier matching, GPS queries
- [x] Setup database connection pool (db.SetMaxOpenConns(25) di auth-service main.go)
- [ ] Setup read replica untuk analytics queries

---

#### ARCH-001: API Gateway & Base Service
**Assignee:** Backend Lead  
**Estimasi:** 3 hari

Subtask:
- [ ] Setup API Gateway (Kong atau custom Express middleware)
- [x] Rate limiting middleware: Redis-backed, per user + per IP — `rate_limiter.go`: 4 policies (global 100/60s, OTP send 3/5min, OTP verify 5/10min, auth 20/60s) + RFC 6585 headers + 8 unit tests (all PASS)
- [x] Request logging middleware (correlation ID per request — `base_middleware.go`: CorrelationIDMiddleware + RequestLoggerMiddleware)
- [x] Error handling middleware (standar error response format — `WriteError`/`WriteSuccess` JSON)
- [ ] Request validation middleware (Joi atau Zod)
- [x] CORS configuration (`CORSMiddleware` dengan allowlist origin)
- [x] Health check endpoint `/health` dan `/ready` (`health_handler.go` — DB ping check)
- [x] API versioning strategy (`/api/v1/` — semua route di-prefix, legacy redirect 301)

---

#### ARCH-002: Event Bus & Message Queue
**Assignee:** Backend  
**Estimasi:** 2 hari

Subtask:
- [x] Setup Redis Pub/Sub untuk real-time events (Redis EventBus implemented)
- [ ] Setup RabbitMQ atau AWS SQS untuk async jobs:
  - Payout processing
  - Notification sending
  - Report generation
  - Score recalculation
- [x] Define event schema (JSON Schema) untuk semua event (domain.OrderEvent defined)
- [ ] Dead letter queue (DLQ) untuk failed jobs
- [ ] Job retry dengan exponential backoff

---

#### ARCH-003: WebSocket Server
**Assignee:** Backend  
**Estimasi:** 2 hari

Subtask:
- [x] Setup Socket.IO server (atau native WebSocket) (Gorilla WebSocket implemented)
- [x] Room-based architecture: per order, per courier, per admin zone (Implemented in WSHandler)
- [x] JWT authentication untuk WebSocket handshake (Integrated with AuthMiddleware)
- [x] Redis adapter untuk multi-instance WebSocket (horizontal scaling) (Redis Pub/Sub integration)
- [ ] Fallback ke HTTP polling (30s interval) jika WebSocket disconnect
- [x] Connection lifecycle management (reconnect, cleanup stale connections) (Implemented in read/write pumps)

---

## FASE 1: CORE BACKEND (Minggu 4-8)

### Sprint 2: Auth & User Management

#### [x] AUTH-001: Authentication Service (OTP-based)  
#### [x] AUTH-002: User Registration & Profile 
**Estimasi:** 7 hari (4 + 3)

Subtask:
- [x] POST /auth/otp/send — kirim OTP via WhatsApp (WATI/Twilio) + SMS fallback
- [x] POST /auth/otp/verify — verifikasi OTP, return JWT pair
- [x] POST /auth/refresh — refresh access token
- [x] POST /auth/logout — invalidate refresh token
- [x] JWT structure: `{ user_id, role, device_id, exp }`
- [x] Refresh token rotation (setiap refresh, token lama diinvalidate)
- [x] OTP: 6 digit, expire 5 menit, max 3 attempts, cooldown 60 detik
- [x] Device management: simpan device_id + device info per user

---

#### [x] AUTH-002: User Registration & Profile
**Assignee:** Backend  
**Estimasi:** 3 hari

Subtask:
- [x] POST /auth/register — registrasi customer baru (Update Profile)
- [x] GET /users/me — profil sendiri
- [x] PATCH /users/me — update profil
- [ ] POST /users/me/photo — upload foto profil ke S3
- [x] PIN management: set PIN, change PIN, reset PIN via OTP
- [ ] Referral code generation saat registrasi
- [ ] Google OAuth integration (optional, untuk customer)
- [ ] Apple Sign In integration (optional, untuk iOS customer)

---

#### AUTH-003: Courier Registration & Verification
**Assignee:** Backend  
**Estimasi:** 3 hari

Subtask:
- [x] POST /couriers/register — registrasi kurir baru (multi-step)
- [x] POST /couriers/documents — upload KTP, SIM, STNK, selfie ke S3
- [x] GET /couriers/me — profil kurir lengkap
- [x] GET /admin/couriers — list semua kurir (admin only)
- [x] PATCH /admin/couriers/:id/verify — approve/reject kurir
- [x] POST /admin/couriers/:id/suspend — suspend kurir
- [x] Zone assignment: POST /admin/couriers/:id/zones
- [ ] Liveness detection integration (cek apakah selfie adalah orang sungguhan, bukan foto)

---

#### AUTH-004: RBAC & Admin Management
**Assignee:** Backend  
**Estimasi:** 2 hari

Subtask:
- [x] RBAC middleware: decorator/guard untuk setiap endpoint
- [ ] Role permissions matrix (siapa bisa akses apa)
- [ ] POST /admin/users — buat akun admin baru (super_admin only)
- [x] PATCH /admin/users/:id/role — ubah role
- [x] GET /admin/audit-logs — audit log semua aksi admin
- [ ] 2FA TOTP setup untuk super_admin dan finance (Google Authenticator)
- [x] Session management: force logout dari device lain

---

### Sprint 3: Order, Pricing & Routing

#### ORDER-001: Order Creation
**Assignee:** Backend  
**Estimasi:** 4 hari

Subtask:
- [x] POST /pricing/estimate — estimasi harga sebelum order (tidak buat order)
  - [x] Input: pickup_coords, dropoff_coords, package_details
  - [x] Output: price_breakdown, model_selected, eta, surge_info
- [x] POST /orders — buat order baru
  - [x] Validasi semua field
  - [x] Hitung jarak via Google Maps Distance Matrix API
  - [x] Pilih model (P2P/2-Kaki/3-Kaki) berdasarkan jarak + zona
  - [x] Hitung harga final (base + volumetric + dynamic)
  - [x] Buat payment intent
  - [x] Return order_id + QR code URL
- [x] Order number generation: `RLY-YYYYMMDD-XXXXX` (sequential per hari)
- [x] Caching rute populer (zona-ke-zona, 5 menit TTL)

#### ORDER-002: Order State Machine
**Assignee:** Backend  
**Estimasi:** 3 hari

Subtask:
- [x] Implementasi state machine (XState atau custom)
- [x] PATCH /orders/:id/status — update status dengan validasi transisi
- [x] Event emit ke WebSocket setiap status change (via EventBus)
- [x] Audit log setiap transisi (siapa, kapan, dari mana ke mana)
- [x] Scheduler: auto-cancel order `pending_payment` setelah 15 menit
- [ ] Scheduler: alert admin jika `pending_assignment` >10 menit
- [x] GET /orders/:id — detail order lengkap (semua leg, proofs, timeline)
- [x] GET /orders — list order dengan filter + pagination

#### ORDER-003: Courier Matching Engine
**Assignee:** Backend (Go preferred untuk performa)  
**Estimasi:** 4 hari

Subtask:
- [x] PostGIS query: cari kurir online di radius X km dari pickup
- [ ] Scoring kurir: `score = (relay_score × 0.5) + (proximity_score × 0.3) + (acceptance_rate × 0.2)`
- [ ] Untuk relay: match 3 kurir sekaligus (atomic, hindari race condition)
- [ ] Dispatch dengan timer 30 detik per kurir (jika tidak accept, skip ke berikutnya)
- [x] Cascade fallback: expand radius jika tidak ada kurir
- [ ] Notify kurir via WebSocket + push notification
- [ ] Cancel assignment jika semua kurir decline → notify customer
- [x] Mutex/lock untuk hindari double-assign kurir ke 2 order sekaligus

#### ORDER-004: Meeting Point Engine
**Assignee:** Backend  
**Estimasi:** 2 hari

Subtask:
- [ ] GET /meeting-points/suggest — saran titik temu terbaik berdasarkan:
  - Zona pickup dan dropoff
  - Kondisi lalu lintas real-time (Google Maps Traffic API)
  - Availability kurir di masing-masing sisi
- [ ] Fallback titik temu: jika kondisi macet parah, suggest titik alternatif
- [ ] POST /admin/meeting-points — CRUD meeting point oleh admin
- [ ] Meeting point analytics: berapa sering digunakan, rata-rata wait time

#### PRICE-001: Pricing Engine
**Assignee:** Backend (Go untuk performa)  
**Estimasi:** 3 hari

Subtask:
- [x] Base price calculator: jarak × harga per km (P2P) atau flat per leg (relay)
- [x] Volumetric surcharge calculator: berdasarkan charged_weight
- [ ] Weight bracket surcharge calculator
- [x] Dynamic pricing multiplier aggregator:
  - [x] Baca `pricing:multiplier:{zone_id}` dari Redis
  - [x] Apply semua faktor sesuai formula
  - [x] Cap total surge di +40%
- [ ] Loyalty discount calculator berdasarkan tier
- [x] Price locking: simpan harga final di order, tidak bisa berubah setelah konfirmasi
- [ ] GET /admin/pricing/config — baca config harga
- [ ] PUT /admin/pricing/config — update config harga (dengan preview sebelum save)
- [ ] Price simulation endpoint untuk admin

---

#### PRICE-002: Dynamic Pricing Workers
**Assignee:** Backend  
**Estimasi:** 3 hari

Subtask:
- [x] **Jam Sibuk Worker**: update Redis multiplier setiap menit berdasarkan jam saat ini
- [ ] **Cuaca Worker**: 
  - Poll BMKG API setiap 15 menit per zona aktif
  - Fallback ke Open-Meteo jika BMKG gagal
  - Parse intensitas hujan → hitung multiplier → update Redis
  - Log weather_logs ke DB
- [ ] **Demand-Supply Worker**:
  - Hitung rasio `available_couriers / pending_orders` per zona setiap 2 menit
  - Update Redis multiplier
- [ ] **Surge Notification**: jika surge aktif, badge muncul di customer app
- [ ] Admin dashboard: real-time tampilkan multiplier aktif per zona
- [ ] Config: enable/disable setiap faktor dynamic pricing dari admin

---

### Sprint 4: Payment, SLA & Notifications

#### PAY-001: Payment Gateway Integration
**Assignee:** Backend  
**Estimasi:** 3 hari

Subtask:
- [ ] Integrate Midtrans atau Xendit SDK
- [ ] POST /payments/create — buat QRIS transaction
  - Generate QR code
  - Set expiry 15 menit
  - Simpan ke DB
- [ ] POST /payments/webhook — terima dan verifikasi webhook dari gateway
  - Signature verification (HMAC)
  - Idempotency check (hindari double-process)
  - Trigger order → status: `pending_assignment`
  - Trigger fund splitting (async job)
- [ ] Fund splitting logic:
  - Hitung MDR, PPN, cuaca reserve, operasional
  - Catat ke payments table
- [ ] GET /payments/:id — status payment
- [ ] Simulate payment untuk testing (test mode)

---

#### PAY-002: Payout System
**Assignee:** Backend  
**Estimasi:** 3 hari

Subtask:
- [ ] Payout calculation per order leg selesai:
  - `net = assigned_fee - penalty + idle_compensation`
- [ ] Batch payout: agregasi payout per kurir per hari
- [ ] Integrate transfer bank API (Xendit Disbursement atau Flip)
- [ ] POST /admin/payouts/trigger — manual trigger payout
- [ ] GET /couriers/me/earnings — ringkasan penghasilan kurir
- [ ] Payout history dengan status (pending/processing/completed/failed)
- [ ] Retry otomatis jika payout gagal (max 3x, lalu alert admin)
- [ ] PPh Pasal 21 calculation untuk kurir dengan penghasilan >Rp2.5jt/bulan

---

#### PAY-003: Refund System
**Assignee:** Backend  
**Estimasi:** 2 hari

Subtask:
- [ ] POST /orders/:id/cancel — cancel order dengan validasi policy
  - Sebelum assigned: refund 100%
  - Setelah assigned, belum pickup: refund 80%
  - Setelah pickup: tidak bisa cancel
- [ ] Trigger refund ke payment gateway
- [ ] SLA breach automatic refund: voucher ke customer (bukan cash)
- [ ] GET /refunds/:id — status refund
- [ ] Admin: manual trigger refund untuk kasus khusus

---

#### SLA-001: SLA Engine
**Assignee:** Backend  
**Estimasi:** 2 hari

Subtask:
- [ ] Set SLA deadline per leg saat kurir di-assign
- [ ] Scheduled job (setiap menit): cek semua leg yang mendekati SLA
- [ ] Alert 5 menit sebelum SLA habis: push ke kurir + admin
- [ ] SLA breach processing:
  - Hitung breach_minutes
  - Hitung penalty (20% fee)
  - Distribute ke kurir berikutnya atau voucher customer
  - Update relay score kurir
  - Log ke sla_logs
- [ ] Idle compensation: jika kurir di titik temu >10 menit, auto-kompensasi
- [ ] SLA dashboard untuk admin: compliance rate per zona per hari

---

#### NOTIF-001: Notification Service
**Assignee:** Backend  
**Estimasi:** 3 hari

Subtask:
- [ ] FCM integration (Android push notification)
- [ ] APNs integration (iOS push notification)
- [ ] WhatsApp Business API integration (Twilio atau WATI)
  - Template messages untuk order confirmed, delivered
- [ ] SMS fallback (Twilio SMS atau Nexmo)
- [ ] Notification templates management (admin configurable)
- [ ] Notification queue: async sending via message queue
- [ ] Delivery tracking: simpan status sent/delivered/failed ke DB
- [ ] GET /notifications — inbox notification user (in-app)
- [ ] PATCH /notifications/read — mark as read
- [ ] User preference: customer bisa pilih channel aktif

---

#### TRACK-001: GPS Tracking Service
**Assignee:** Backend (Go preferred)  
**Estimasi:** 3 hari

Subtask:
- [ ] POST /tracking/location — terima GPS update dari courier app
  - Rate: setiap 10 detik saat on-delivery
  - Validasi: lat/lng range, timestamp freshness
  - Kalman filter untuk smooth GPS noise
  - Velocity check: jika speed >150km/h → flag as spoofed
  - Simpan ke `courier_locations` (partitioned table)
  - Update `courier_profiles.current_location` (PostGIS)
  - Publish ke Redis Pub/Sub untuk real-time broadcast
- [ ] GET /tracking/:order_id — live tracking data untuk customer
  - Return: courier current location, ETA, route_polyline
- [ ] Geofencing: alert jika kurir keluar zona >5 menit
- [ ] GPS trail recording per leg: simpan di `courier_gps_logs`
- [ ] Auto-offline: jika tidak ada GPS update >15 menit, set kurir offline

---

## FASE 2: MOBILE MVP (Minggu 9-14)

### Sprint 5: Customer App — Core Features

#### CUST-001: Project Setup & Architecture
**Assignee:** Mobile Engineer  
**Estimasi:** 2 hari

Subtask:
- [ ] Flutter project setup dengan flavor (dev/staging/prod)
- [ ] State management: Riverpod atau Bloc
- [ ] Navigation: GoRouter
- [ ] HTTP client: Dio dengan interceptors (auth, logging, retry)
- [ ] WebSocket client: socket_io_client
- [ ] Local storage: Hive atau SQLite (untuk cache offline)
- [ ] Dependency injection: get_it
- [ ] Base widget library: design system (warna, tipografi, komponen)
- [ ] Sentry integration untuk crash reporting
- [ ] Analytics: Firebase Analytics atau Mixpanel
- [ ] Deep link setup (untuk notifikasi → buka order tertentu)

---

#### CUST-002: Auth Flow (Customer)
**Assignee:** Mobile Engineer  
**Estimasi:** 2 hari

Subtask:
- [ ] Splash screen + onboarding (3 slide pertama kali buka)
- [ ] Screen: input nomor HP
- [ ] Screen: input OTP (6 digit, auto-paste dari SMS/WhatsApp)
- [ ] Screen: input nama + (opsional) email
- [ ] Screen: setup PIN 6 digit
- [ ] Biometric authentication (fingerprint/face) sebagai alternatif PIN
- [ ] Google Sign In integration
- [ ] Persistent session: simpan JWT di secure storage
- [ ] Auto-refresh token di background

---

#### CUST-003: Home & Order Booking
**Assignee:** Mobile Engineer  
**Estimasi:** 4 hari

Subtask:
- [ ] Home screen: quick booking shortcut, active orders, promo banner
- [ ] Screen: input alamat pickup (Google Places autocomplete + peta + GPS current location)
- [ ] Screen: input alamat tujuan (sama seperti pickup)
- [ ] Screen: input detail paket:
  - Nama barang, kategori
  - Input berat aktual (kg)
  - **Tombol "Scan Dimensi Barang"** → flow ke SCAN-001
- [ ] Screen: price preview:
  - Model yang dipilih (P2P/2-Kaki/3-Kaki)
  - Breakdown harga (base + surcharge + dynamic)
  - Badge SURGE PRICING jika aktif
  - ETA estimasi
  - Toggle asuransi (+ nilai barang + preview premi)
  - Catatan untuk kurir
- [ ] Screen: konfirmasi order (review semua detail)
- [ ] Saved addresses: CRUD daftar alamat tersimpan

---

#### CUST-004: Payment Flow
**Assignee:** Mobile Engineer  
**Estimasi:** 2 hari

Subtask:
- [ ] Screen: payment (tampilkan QR code QRIS)
- [ ] Countdown timer 15 menit
- [ ] Auto-check payment status setiap 5 detik (polling)
- [ ] WebSocket listener untuk payment confirmation
- [ ] Sukses → animasi + redirect ke tracking
- [ ] Gagal/expire → opsi coba lagi atau batalkan
- [ ] Input kode voucher (field + validasi real-time)
- [ ] Tampilkan breakdown potongan voucher di payment screen

---

#### CUST-005: Order Tracking
**Assignee:** Mobile Engineer  
**Estimasi:** 4 hari

Subtask:
- [ ] Screen: tracking aktif:
  - Google Maps dengan marker kurir (update real-time via WebSocket)
  - Polyline rute dari kurir ke tujuan
  - ETA countdown
  - Informasi kurir aktif (nama, foto, plat, relay score)
- [ ] Timeline status order (stepper vertikal)
  - Ikon per stage, timestamp
  - Foto pickup dan delivery (tap untuk lihat besar)
- [ ] In-app chat per order (masked number)
- [ ] Tombol hubungi kurir (via masked phone)
- [ ] Panic button untuk laporkan masalah
- [ ] Notifikasi push → deep link ke halaman tracking

---

#### CUST-006: Post-Delivery & History
**Assignee:** Mobile Engineer  
**Estimasi:** 2 hari

Subtask:
- [ ] Screen: rating kurir (bintang 1-5 + komentar, per kurir untuk relay)
- [ ] Screen: buka dispute (kategori, deskripsi, upload foto)
- [ ] Screen: riwayat order (list + filter)
- [ ] Screen: detail order historis (sama seperti tracking, tapi static)
- [ ] Download bukti kirim PDF
- [ ] Reorder button (copy detail order lama ke booking baru)

---

#### CUST-007: Profile & Settings
**Assignee:** Mobile Engineer  
**Estimasi:** 2 hari

Subtask:
- [ ] Screen: profil (foto, nama, nomor HP, loyalty tier)
- [ ] Screen: daftar alamat tersimpan
- [ ] Screen: wallet & riwayat transaksi
- [ ] Screen: voucher aktif + input kode promo
- [ ] Screen: referral (kode unik + share link + reward status)
- [ ] Screen: notifikasi preference
- [ ] Screen: bantuan (FAQ + hubungi CS)
- [ ] Screen: pengaturan (bahasa, tema, biometric)

---

### Sprint 6: Courier App — Core Features

#### COUR-001: Project Setup (Courier App)
**Assignee:** Mobile Engineer  
**Estimasi:** 1 hari

Subtask:
- [ ] Flutter project setup (bisa shared codebase dengan customer atau separate)
- [ ] Shared packages: API client, auth, utils, design system
- [ ] Background GPS tracking: flutter_background_geolocation atau Geolocator
- [ ] Camera: camera plugin + image_picker
- [ ] QR scanner: mobile_scanner
- [ ] Root detection: flutter_jailbreak_detection + Google Play Integrity API
- [ ] Secure storage: flutter_secure_storage

---

#### COUR-002: Auth & Onboarding (Courier)
**Assignee:** Mobile Engineer  
**Estimasi:** 3 hari

Subtask:
- [ ] Screen: registrasi kurir (multi-step form):
  - Step 1: nomor HP + OTP
  - Step 2: data diri (nama, email)
  - Step 3: upload dokumen (KTP, SIM, STNK — camera atau gallery)
  - Step 4: selfie liveness detection
  - Step 5: pilih kendaraan dan zona
- [ ] Liveness detection: check apakah selfie bukan foto dari foto
- [ ] Screen: status verifikasi (menunggu review, 24 jam)
- [ ] In-app training onboarding (5 modul):
  - Modul 1: Cara kerja P2P, 2-Kaki, 3-Kaki
  - Modul 2: Cara relay handover yang benar
  - Modul 3: Cara scan QR dan dimensi barang
  - Modul 4: Aturan SLA dan penalti
  - Modul 5: Tips meningkatkan relay score
- [ ] Quiz setelah tiap modul (minimal 80% benar untuk lanjut)
- [ ] Sertifikat digital setelah lulus training

---

#### COUR-003: Home & Order Management
**Assignee:** Mobile Engineer  
**Estimasi:** 3 hari

Subtask:
- [ ] Screen: home kurir:
  - Toggle online/offline (dengan GPS permission check)
  - Earnings hari ini
  - Relay score saat ini
  - Order aktif (jika ada)
  - Order history singkat
- [ ] Screen: notifikasi order masuk (full screen popup):
  - Detail paket (jarak, model, fee, dimensi paket)
  - Preview peta (pickup → dropoff)
  - Timer 30 detik countdown
  - Tombol Accept / Decline
- [ ] Decline reasons (dropdown): motor rusak, area berbahaya, paket terlalu besar, lainnya
- [ ] Warning jika decline rate >30% dalam 1 jam
- [ ] Screen: order aktif (detail lengkap + tombol aksi)

---

#### COUR-004: Navigation & Pickup
**Assignee:** Mobile Engineer  
**Estimasi:** 3 hari

Subtask:
- [ ] Navigasi ke pickup: deep link ke Google Maps / Waze
- [ ] Background GPS: kirim koordinat setiap 10 detik ke backend
- [ ] Screen: konfirmasi pickup:
  - Tombol "Saya Sudah di Lokasi" (GPS validation radius 100m)
  - Wajib foto paket (kamera terbuka otomatis)
  - Scan dimensi (lihat SCAN-002 untuk courier flow)
  - Input berat aktual (opsional)
  - Scan QR paket (generate QR atau scan QR yang ada)
  - Preview semua yang di-capture sebelum konfirmasi
- [ ] Timer SLA mulai berjalan setelah pickup dikonfirmasi (tampil di app)

---

#### COUR-005: Relay Handover
**Assignee:** Mobile Engineer  
**Estimasi:** 3 hari

Subtask:
- [ ] Screen: navigasi ke titik temu (peta + ETA partner)
- [ ] Notifikasi ketika partner mendekati (<5 menit ETA)
- [ ] Screen handover — kurir pengirim:
  - Tampilkan QR code besar (untuk di-scan partner)
  - Tombol mulai rekam video handover
  - Konfirmasi setelah partner scan berhasil
- [ ] Screen handover — kurir penerima:
  - QR scanner aktif
  - Setelah scan berhasil: konfirmasi kondisi paket (OK / Rusak)
  - Jika rusak: foto + deskripsi (mandatory)
  - Accept handover
- [ ] Idle timer: tampil counter waktu tunggu, info kompensasi
- [ ] Tombol "Partner Tidak Datang" → opsi cancel relay (muncul setelah 30 menit)
- [ ] Alert jika titik temu macet: tampil opsi titik temu alternatif

---

#### COUR-006: Delivery & Earnings
**Assignee:** Mobile Engineer  
**Estimasi:** 2 hari

Subtask:
- [ ] Screen: navigasi ke tujuan
- [ ] Screen: konfirmasi delivery:
  - Foto barang di depan pintu / penerima memegang
  - E-signature pad (tanda tangan digital)
  - Input nama penerima
  - Scan QR paket (chain of custody closing)
- [ ] Jika tidak ada orang: opsi (coba lagi, titipkan tetangga, return to sender)
- [ ] Screen: earnings:
  - Dashboard penghasilan (hari ini, minggu, bulan)
  - Breakdown per order
  - Status payout dengan tombol cek status
- [ ] Screen: relay score:
  - Skor dan komponen breakdown
  - History 30 hari (grafik)
  - Tips tingkatkan skor
  - Badge tier display

---

### Sprint 7: Scanning Feature

#### SCAN-001: Volumetric Scanning — Customer Side
**Assignee:** Mobile Engineer + ML Engineer  
**Estimasi:** 5 hari

Subtask:
- [ ] **[ML]** Pilih atau train model computer vision untuk estimasi dimensi:
  - Option A: Google ML Kit Object Detection
  - Option B: Custom TFLite model (MobileNetV3)
  - Referensi objek: kartu standar (85.6×54mm)
- [ ] **[ML]** Buat pipeline inference:
  - Input: 1-2 gambar dari berbagai sudut
  - Deteksi tepi objek (edge detection)
  - Estimasi dimensi berdasarkan referensi
  - Output: P×L×T dalam cm + confidence score
- [ ] **[Mobile]** Camera screen untuk scanning:
  - Overlay grid helper
  - Bounding box detection real-time
  - Instruksi posisi paket dan referensi kartu
  - Progress indicator saat proses
- [ ] **[Mobile]** Hasil scan screen:
  - Tampilkan dimensi + berat volumetrik
  - Confidence indicator (tinggi/sedang/rendah)
  - Tombol konfirmasi / scan ulang / input manual
- [ ] **[Mobile]** Input manual fallback (3 field: P, L, T dalam cm)
- [ ] **[Backend]** POST /scan/analyze:
  - Terima base64 image
  - Run ML inference (atau delegate ke scanning-service Python)
  - Return dimensi + confidence
  - Simpan ke package_scans table

---

#### SCAN-002: Volumetric Scanning — Courier Side
**Assignee:** Mobile Engineer  
**Estimasi:** 2 hari

Subtask:
- [ ] Tampilkan dimensi dari scan customer (jika ada) di halaman pickup
- [ ] Tombol "Verifikasi" (jika dimensi tampak sama) atau "Scan Ulang"
- [ ] Jika override: wajib alasan, foto paket sebelum dan sesudah
- [ ] Jika selisih harga >Rp10.000: sistem kirim notifikasi ke customer, minta approval
- [ ] Timeout approval customer 5 menit, jika tidak respons → ikuti dimensi kurir
- [ ] Log semua scan ke package_scans table dengan flag `is_manual_override`

---

#### SCAN-003: ARCore Enhancement (Optional Phase 2)
**Assignee:** ML Engineer + Mobile Engineer  
**Estimasi:** 4 hari (fase 2, opsional)

Subtask:
- [ ] Detect apakah device support ARCore (Android) atau LiDAR (iOS 12 Pro+)
- [ ] Jika ya: gunakan depth sensor untuk pengukuran lebih akurat
- [ ] Fallback otomatis ke ML model jika device tidak support
- [ ] A/B test: bandingkan akurasi ARCore vs ML-only
- [ ] Kirim data akurasi (confidence + selisih vs override) ke analytics

---

## FASE 3: ADVANCED FEATURES (Minggu 15-18)

### Sprint 8: Relay System & Insurance

#### RELAY-001: Advanced Relay Orchestration
**Assignee:** Backend  
**Estimasi:** 4 hari

Subtask:
- [ ] Atomic 3-courier matching dengan Redis distributed lock
- [ ] ETA synchronization: pastikan semua kurir tiba di titik temu dalam window waktu yang sama (±10 menit)
- [ ] Jika ETA mismatch: delay dispatch kurir yang lebih cepat, atau percepat routing kurir yang lambat
- [ ] Relay cancellation flow: jika 1 kurir drop out, find replacement tanpa ganggu leg lain
- [ ] Meeting point conflict resolution: jika 2 relay butuh meeting point yang sama di waktu sama
- [ ] Relay performance analytics: success rate, average wait time, breakdown per zona

---

#### RELAY-002: Relay Score System
**Assignee:** Backend  
**Estimasi:** 2 hari

Subtask:
- [ ] Score calculation job (jalankan setiap malam atau setelah setiap order):
  ```
  relay_score = (ontime_pct × 0.40) +
                (documentation_completeness × 0.30) +
                (partner_ratings_avg × 0.20) +
                (complaint_ratio_inverse × 0.10)
  ```
- [ ] History tracking di `relay_score_history`
- [ ] Tier promotion/demotion otomatis (Regular → Mitra → Elite)
- [ ] Notification ke kurir jika score berubah signifikan (±0.3)
- [ ] Score <3.5: flag wajib retraining di sistem
- [ ] Score <3.0: auto-suspend pending review admin
- [ ] Admin override: bisa adjust skor dengan alasan tertulis

---

#### INS-001: Insurance Integration
**Assignee:** Backend  
**Estimasi:** 3 hari

Subtask:
- [ ] BPJS TK enrollment flow untuk kurir baru (via API BPJS jika tersedia, atau manual form)
- [ ] Tracking iuran BPJS per kurir (company share vs courier share)
- [ ] Micro insurance partner integration (via API asuransi mikro — e.g., PasarPolis)
- [ ] Package insurance (barang):
  - Kalkulasi premi saat order dibuat
  - Catat di `courier_insurance` table
- [ ] Insurance claim trigger dari dispute resolution
- [ ] GET /admin/insurance — dashboard asuransi (total covered, claims, premium)
- [ ] Reminder perpanjangan asuransi kurir (30, 14, 7 hari sebelum expire)

---

### Sprint 9: Analytics, Reporting & Admin Features

#### ANALYTICS-001: Metrics & Reporting Backend
**Assignee:** Backend  
**Estimasi:** 4 hari

Subtask:
- [ ] Analytics queries (gunakan read replica):
  - Revenue per hari/minggu/bulan/zona/model
  - SLA compliance rate per zona dan per kurir
  - Courier utilization (jam aktif / total order per jam)
  - Customer retention (% yang order lagi dalam 30 hari)
  - Order funnel (berapa % dari estimate → order → payment → delivery)
  - Dynamic pricing impact (revenue lift dari surge)
  - Scan accuracy rate (confidence distribution)
- [ ] Materialized views untuk query berat (refresh setiap jam)
- [ ] Export endpoints: GET /admin/reports?type=X&from=&to= → CSV / PDF
- [ ] PDF generation: Puppeteer atau WeasyPrint
- [ ] Scheduled report email ke finance team (bulanan)

---

## FASE 4: ADMIN DASHBOARD (Minggu 19-21)

### Sprint 10: Admin Web — Core

#### ADMIN-001: Project Setup (Web)
**Assignee:** Frontend Engineer  
**Estimasi:** 2 hari

Subtask:
- [ ] React.js + TypeScript + Vite project setup
- [ ] State management: Zustand atau Redux Toolkit
- [ ] UI library: Ant Design atau MUI + custom theme
- [ ] Map: react-google-maps atau deck.gl untuk heatmap
- [ ] Charts: Recharts atau Chart.js
- [ ] HTTP: Axios + React Query untuk data fetching + caching
- [ ] WebSocket: socket.io-client untuk real-time updates
- [ ] Auth: JWT stored in httpOnly cookie
- [ ] Route guard: redirect ke login jika unauthenticated
- [ ] Responsive: prioritas desktop, tablet OK

---

#### ADMIN-002: Live Operations Dashboard
**Assignee:** Frontend Engineer  
**Estimasi:** 4 hari

Subtask:
- [ ] Peta dengan marker semua kurir aktif (update 10 detik via WebSocket)
- [ ] Heatmap volume order per zona (toggle)
- [ ] Panel order aktif: tabel dengan filter + search + real-time update
- [ ] Panel statistics: order/jam, kurir aktif, SLA compliance rate, avg ETA
- [ ] Alert panel: semua alert SLA breach, GPS spoofing, server error
- [ ] Order detail modal: klik order → full detail (timeline, peta trail, foto, dll)
- [ ] Manual reassign kurir: dropdown pilih kurir pengganti

---

#### ADMIN-003: Order & Courier Management
**Assignee:** Frontend Engineer  
**Estimasi:** 3 hari

Subtask:
- [ ] Halaman order management: tabel + filter + export CSV
- [ ] Halaman courier management: list + filter + profile detail
- [ ] Courier profile halaman: dokumen viewer, statistik, riwayat, asuransi status
- [ ] Verify/reject kurir (dengan form alasan reject)
- [ ] Suspend/unsuspend kurir
- [ ] Dispute management: list dispute + assign ke CS + update status + resolve

---

#### ADMIN-004: Configuration & Settings
**Assignee:** Frontend Engineer  
**Estimasi:** 3 hari

Subtask:
- [ ] Zone management: peta interaktif, gambar/edit polygon zona, manage meeting points
- [ ] Pricing configuration form (dengan preview simulasi)
- [ ] Dynamic pricing rules editor (peak hour, weather threshold, demand-supply)
- [ ] SLA config (per model, per leg)
- [ ] Voucher management: create/edit/monitor voucher
- [ ] Feature flags UI: enable/disable fitur dengan 1 toggle
- [ ] Notification templates editor

---

### Sprint 11: Admin Web — Finance & Analytics

#### ADMIN-005: Financial Dashboard
**Assignee:** Frontend Engineer  
**Estimasi:** 3 hari

Subtask:
- [ ] Revenue chart (daily/weekly/monthly dengan date picker)
- [ ] Revenue breakdown: donut chart per model (P2P/2-Kaki/3-Kaki)
- [ ] Cost breakdown: kurir, teknologi, marketing, asuransi
- [ ] Laba bersih trend line chart
- [ ] Settlement management: tabel payout pending + tombol trigger
- [ ] PPN tracking: total per masa + tombol export untuk setor pajak
- [ ] Dana cuaca darurat: saldo + usage history + top-up form
- [ ] Unit economics table: CAC, LTV, margin per model

---

#### ADMIN-006: Analytics & Reports
**Assignee:** Frontend Engineer  
**Estimasi:** 3 hari

Subtask:
- [ ] SLA compliance chart: line chart per zona per hari
- [ ] Courier performance: scatter plot (relay score vs earnings)
- [ ] Customer analytics: retention cohort table
- [ ] Dynamic pricing analytics: surge frequency + revenue impact
- [ ] Volumetric scan accuracy: confidence distribution histogram
- [ ] Custom report builder: pilih metrik, dimensi, filter, preview + export
- [ ] Scheduled report setup: pilih frekuensi + email penerima

---

## FASE 5: QA & HARDENING (Minggu 22-24)

### Sprint 12: Testing, Security & Performance

#### QA-001: Unit Testing
**Assignee:** Semua Engineer  
**Estimasi:** 4 hari (paralel)

Subtask:
- [ ] Backend: unit test semua business logic (pricing, routing, SLA, scoring)
  - Coverage target: ≥80%
  - Tools: Jest (Node.js), Go testing package
- [ ] Mobile: unit test semua use cases dan state management
  - Tools: flutter_test
- [ ] Frontend: unit test semua util functions dan state
  - Tools: Jest + React Testing Library
- [ ] Mock semua external services (Google Maps, BMKG, payment gateway, BPJS)

---

#### QA-002: Integration Testing
**Assignee:** QA Engineer  
**Estimasi:** 5 hari

Subtask:
- [ ] End-to-end order flow test (P2P, 2-Kaki, 3-Kaki) di staging environment
- [ ] Payment flow test (test mode dengan Midtrans sandbox)
- [ ] Relay handover test dengan 3 device sekaligus
- [ ] SLA breach dan penalti test
- [ ] Dynamic pricing test: simulasi jam sibuk, hujan, surge
- [ ] Notification delivery test
- [ ] Voucher dan referral test
- [ ] Dispute dan refund test
- [ ] GPS spoofing detection test

---

#### QA-003: Performance Testing
**Assignee:** QA Engineer + DevOps  
**Estimasi:** 3 hari

Subtask:
- [ ] Load test: simulasi 1.000 concurrent users (k6 atau JMeter)
- [ ] GPS ingestion stress test: 500 kurir kirim GPS setiap 10 detik
- [ ] WebSocket stress test: 2.000 concurrent connections
- [ ] Order matching latency test: target <5 detik
- [ ] Database query optimization (EXPLAIN ANALYZE untuk semua query penting)
- [ ] API response time profiling: target P95 <300ms
- [ ] Mobile app performance: startup time, memory usage, battery drain

---

#### QA-004: Security Testing
**Assignee:** QA Engineer + External Auditor  
**Estimasi:** 4 hari

Subtask:
- [ ] OWASP Top 10 vulnerability scan (OWASP ZAP atau Burp Suite)
- [ ] SQL injection testing pada semua input
- [ ] JWT security: algorithm confusion, token forgery
- [ ] Rate limiting bypass testing
- [ ] GPS spoofing simulation + verify detection works
- [ ] Root detection bypass testing pada courier app
- [ ] Certificate pinning verify
- [ ] Sensitive data exposure audit (apakah ada data sensitif di logs)
- [ ] GDPR/UU PDP compliance audit
- [ ] Penetration test oleh pihak ketiga (opsional tapi direkomendasikan)

---

#### QA-005: Mobile Device Testing
**Assignee:** QA Engineer  
**Estimasi:** 3 hari

Subtask:
- [ ] Test di minimum 10 device berbeda:
  - Low-end Android (RAM 3GB, Android 8-9)
  - Mid-range Android (RAM 6GB, Android 11-12)
  - High-end Android (RAM 8GB, Android 13+)
  - iPhone SE, iPhone 14, iPhone 15 Pro (untuk LiDAR scan)
- [ ] Offline mode testing: kehilangan koneksi mid-delivery
- [ ] Background GPS test: apakah GPS tetap jalan saat app di-minimize
- [ ] Scanning accuracy test di berbagai kondisi cahaya
- [ ] Camera permission edge cases
- [ ] Localization test (Bahasa Indonesia)

---

#### QA-006: Accessibility & UX Audit
**Assignee:** QA Engineer  
**Estimasi:** 2 hari

Subtask:
- [ ] Font size accessibility (support device font scaling)
- [ ] Color contrast check (WCAG AA minimum)
- [ ] Touch target size (minimum 44×44 dp)
- [ ] Screen reader compatibility (TalkBack Android, VoiceOver iOS)
- [ ] Error messages: pastikan semua pesan error informatif dan helpful
- [ ] Loading states: semua operasi async punya loading indicator
- [ ] Empty states: semua list kosong punya empty state yang informatif

---

## FASE 6: PILOT LAUNCH

### PRE-LAUNCH CHECKLIST

#### LAUNCH-001: Production Deployment
**Assignee:** DevOps  
**Estimasi:** 2 hari

Subtask:
- [ ] Production infrastructure final check
- [ ] Database migration: apply semua migration ke production
- [ ] Load test production environment
- [ ] SSL certificate valid untuk semua domain
- [ ] CDN configured untuk static assets
- [ ] Monitoring & alerting all green
- [ ] Backup tested dan verified (restore test)
- [ ] Rollback plan documented

---

#### LAUNCH-002: Data Setup
**Assignee:** Backend + Ops  
**Estimasi:** 1 hari

Subtask:
- [ ] 5 zona Jakarta di-setup dengan polygon akurat
- [ ] 20+ meeting points di-setup dan diverifikasi di lapangan
- [ ] Pricing config pilot sesuai business plan
- [ ] SLA config sesuai business plan
- [ ] Feature flags: disable fitur yang belum ready untuk pilot
- [ ] Onboard 25-30 kurir pilot (data, dokumen, training)
- [ ] Onboard 5-10 UMKM anchor (akun, briefing, MoU)

---

#### LAUNCH-003: Operational Readiness
**Assignee:** COO + CS  
**Estimasi:** 3 hari (paralel dengan development)

Subtask:
- [ ] SOP operasional disiapkan (handling dispute, kurir tidak responsif, dll)
- [ ] CS helpdesk siap (WhatsApp atau ticketing system)
- [ ] Admin dashboard training untuk tim ops
- [ ] War room setup selama launch week (dedicated Slack channel + video call)
- [ ] Incident response plan diketahui semua anggota tim
- [ ] Legal: pastikan semua kontrak kurir dan UMKM sudah ditandatangani

---

### POST-LAUNCH MONITORING

#### MONITOR-001: Launch Week Monitoring
**Assignee:** Semua  
**Estimasi:** Ongoing

Subtask:
- [ ] Daily standup fokus pada: error rate, SLA compliance, customer complaints
- [ ] Monitor Sentry untuk crash dan errors real-time
- [ ] Monitor Grafana: API latency, server load, DB connections
- [ ] Collect feedback dari kurir (survei mingguan) dan UMKM
- [ ] Adjust pricing/SLA config berdasarkan data aktual vs proyeksi
- [ ] Daily report ke founder: order count, revenue, issues

---

---

## FEATURE FLAGS — TASK DETAIL (v1.1)

> Task-task berikut disisipkan ke sprint yang sudah ada di atas.
> Lihat tabel ringkasan dan dependency map di akhir dokumen.

---

## SPRINT 1 — DATABASE [BARU v1.1]

---

### FF-DB-001 — Feature Flags Schema
**Assignee:** Backend Lead
**Estimasi:** 2 hari
**Priority:** P0 — Blocker untuk semua task FF lainnya
**Sprint:** 1 (sisipkan setelah DB-001 selesai)

#### Subtask:

- [ ] Buat migrasi tabel `feature_flags` sesuai skema ERD v1.1:
  ```sql
  -- Kolom baru vs ERD v1.0:
  -- + category VARCHAR(50) -- 'model' | 'pricing' | 'feature' | 'system'
  -- + require_checklist BOOLEAN DEFAULT FALSE
  ```

- [ ] Buat migrasi tabel `feature_flag_logs` (immutable audit trail):
  ```sql
  -- Tabel baru, tidak ada di ERD v1.0
  -- Include: DB trigger untuk prevent UPDATE/DELETE
  ```

- [ ] Buat seed data semua 15 feature flags dengan nilai default:
  - `model_p2p` → **ON**, require_checklist: FALSE
  - `model_two_legs` → **ON**, require_checklist: FALSE
  - `model_three_legs` → **OFF**, require_checklist: **TRUE**
  - `dynamic_pricing_peak_hour` → ON
  - `dynamic_pricing_weather` → ON
  - `dynamic_pricing_demand_supply` → ON
  - `volumetric_scanning` → ON
  - `arcore_scanning` → OFF
  - `package_insurance` → ON
  - `in_app_chat` → ON
  - `loyalty_program` → ON
  - `referral_program` → ON
  - `scheduled_delivery` → OFF
  - `multi_zone_courier` → ON
  - `courier_leaderboard` → ON

- [ ] Test DB trigger immutability: coba UPDATE/DELETE di `feature_flag_logs` → harus error
- [ ] Tambahkan indexes: `key (UNIQUE)`, `category`, `is_enabled`
- [ ] Dokumentasikan config JSON schema per flag di README teknis

**Acceptance Criteria:**
```
✅ Semua 15 flag terseed dengan nilai default yang benar
✅ Trigger immutable bekerja (test UPDATE → error)
✅ Query GET flag by key < 5ms (dengan index)
✅ Seed bisa dijalankan ulang (idempotent)
```

---

## SPRINT 3 — CORE BACKEND [BARU v1.1]

---

### FF-BACK-001 — Flag Reader + Routing Engine Update
**Assignee:** Backend (Go — routing-service)
**Estimasi:** 3 hari
**Priority:** P0 — Blocker untuk ORDER-001
**Sprint:** 3 (sebelum ORDER-001 dimulai, atau paralel hari 1–2)

#### Context

Routing engine di ORDER-003 (TASKS v1.0) perlu diupdate: **sebelum memilih model, selalu baca feature flag dari Redis/DB.** Ini mengubah flow dari deterministic rule-based menjadi flag-aware rule-based.

#### Subtask:

**[Flag Reader Service]**
- [ ] Buat `FlagReader` struct dengan interface:
  ```go
  type FlagReader interface {
      GetFlag(ctx context.Context, key string) (*FeatureFlag, error)
      GetFlags(ctx context.Context, keys []string) (map[string]*FeatureFlag, error)
      InvalidateCache(ctx context.Context, key string) error
  }
  ```

- [ ] Implementasi caching strategy:
  - Redis GET dulu (cache key: `flag:{key}`, TTL 60 detik)
  - Cache miss → query PostgreSQL → simpan ke Redis
  - Cache HIT rate target: >95% (flag jarang berubah)

- [ ] Handle Redis unavailable: fallback langsung ke DB (tidak gagal total)
- [ ] Handle DB unavailable: return last known cached value + alert (graceful degradation)
- [ ] Unit test: mock Redis + DB, test semua code path

**[Routing Engine Update — Model Selector]**
- [ ] Refactor `SelectModel()` function untuk baca flags sebelum pilih model:
  ```go
  // SEBELUM (v1.0):
  if dist < 15 { return P2P }
  
  // SESUDAH (v1.1):
  flags := readModelFlagsParallel(ctx)  // paralel read 3 flags
  if dist < 15 && flags.P2P.IsEnabled && zoneActive(flags.P2P, zone) {
      return P2P
  }
  ```

- [ ] Baca 3 model flags secara paralel (goroutine) untuk minimasi latency:
  ```go
  // Target: total flag read < 10ms (dari Redis cache)
  var wg sync.WaitGroup
  wg.Add(3)
  go func() { defer wg.Done(); p2pFlag = reader.GetFlag("model_p2p") }()
  go func() { defer wg.Done(); twoFlag = reader.GetFlag("model_two_legs") }()
  go func() { defer wg.Done(); threeFlag = reader.GetFlag("model_three_legs") }()
  wg.Wait()
  ```

- [ ] Implementasi zone active check:
  ```go
  // cek apakah zona customer ada di active_zones config flag
  func zoneActive(flag *FeatureFlag, zone string) bool {
      zones := flag.Config["active_zones"].([]string)
      for _, z := range zones { if z == zone { return true } }
      return false
  }
  ```

- [ ] Implementasi rejection messages:
  ```go
  type ModelUnavailableError struct {
      Model     string
      MessageID string  // untuk i18n di client
      UserMsg   string  // pesan yang ditampilkan ke customer
  }
  ```

- [ ] Rollout percentage check:
  ```go
  // Jika rollout_pct < 100, hanya sebagian user yang dapat model ini
  func inRollout(flag *FeatureFlag, userID string) bool {
      pct := flag.Config["rollout_pct"].(int)
      if pct >= 100 { return true }
      // Hash userID → angka 0-99 → bandingkan dengan pct
      hash := fnv32(userID) % 100
      return int(hash) < pct
  }
  ```

- [ ] Integration test: test semua kombinasi flag ON/OFF + zona active/inactive
- [ ] Benchmark: pastikan SelectModel() dengan flag check < 20ms (vs < 5ms tanpa flag — overhead minimal)

**Acceptance Criteria:**
```
✅ SelectModel() membaca flags dari Redis (cache hit <5ms, miss <20ms)
✅ Jika model_three_legs OFF dan jarak >25km → return error MSG_THREE_LEGS_UNAVAILABLE
✅ Jika model_two_legs OFF dan jarak 15-25km → return error (bukan fallback ke 3-Kaki)
✅ Flags dibaca paralel (3 goroutine bersamaan)
✅ Graceful degradation jika Redis down (fallback ke DB)
✅ Unit test coverage >85% untuk routing logic
✅ Benchmark: P95 SelectModel() < 20ms
```

---

### FF-BACK-002 — Admin API: Feature Flag Management
**Assignee:** Backend (Node.js — admin-service)
**Estimasi:** 3 hari
**Priority:** P0
**Sprint:** 3 (paralel dengan FF-BACK-001)

#### Endpoints yang Perlu Dibangun

```
GET    /admin/feature-flags                    → list semua flags
GET    /admin/feature-flags/:key               → detail 1 flag + audit history
PATCH  /admin/feature-flags/:key/toggle        → ON/OFF flag (super_admin only)
PATCH  /admin/feature-flags/:key/config        → update config JSON (super_admin only)
GET    /admin/feature-flags/:key/logs          → riwayat perubahan flag
GET    /admin/feature-flags/readiness/three-legs → data 3-Leg Activation Checklist
```

#### Subtask:

**[GET /admin/feature-flags]**
- [x] Return semua 15 flags dengan status + last_updated_by + last_updated_at
- [x] Filter by category (model/pricing/feature/system)
- [x] Akses: semua role admin bisa baca (kecuali cs_agent dan finance)

**[PATCH /admin/feature-flags/:key/toggle — KRITIS]**
- [x] Middleware: role check → hanya `super_admin`
- [x] Middleware: 2FA check → session harus memiliki `totp_verified: true`
- [x] Rate limiting: max 10 toggle per jam per super_admin
- [x] Request body:
  ```typescript
  {
    new_enabled: boolean,
    reason: string,           // min 50 karakter
    totp_code: string,        // kode TOTP 6 digit
    checklist_data?: {        // WAJIB jika key === 'model_three_legs' && new_enabled === true
      sla_two_legs_4weeks_pct: number,
      courier_density_per_zone: number,
      validated_meeting_points: number,
      daily_orders_avg: number,
      admin_manual_confirm: boolean
    }
  }
  ```
- [x] Jika `model_three_legs` dan `new_enabled: true`:
  - [x] Jalankan `validateActivationChecklist()` — tolak jika tidak terpenuhi
  - [x] Return error detail kondisi mana yang belum terpenuhi
- [x] DB transaction: update `feature_flags` + insert `feature_flag_logs` (atomic)
- [x] Invalidate Redis cache: `DEL flag:{key}`
- [x] Kirim notifikasi ke semua `super_admin` aktif via email + in-app
- [x] Kirim alert ke Slack/Discord ops channel
- [x] Response: return flag state baru + log entry

**[GET /admin/feature-flags/readiness/three-legs]**
- [x] Hitung dan return data real-time untuk 3-Leg Activation Checklist:
  ```typescript
  {
    gate: {
      sla_two_legs_rolling_4weeks: {
        week1: 85.2, week2: 86.1, week3: 88.7, week4: 89.1,
        all_above_93: false,
        current_avg: 87.3
      }
    },
    checklist: {
      courier_density: {
        "JAK-TIM": 28, "JAK-BAR": 22, "JAK-PST": 31,
        min_required: 30, zones_ready: ["JAK-PST"]
      },
      validated_meeting_points: { count: 4, required: 5 },
      daily_orders: { avg_30days: 187, required: 200 }
    },
    overall_ready: false,
    estimated_ready_in_weeks: 6,
    can_activate: false
  }
  ```
- [x] Query menggunakan materialized view untuk performa (refresh per jam)
- [x] Cache response 5 menit di Redis (data ini tidak perlu real-time)

**[PATCH /admin/feature-flags/:key/config]**
- [x] Update config JSONB (misal: ubah active_zones, rollout_pct)
- [x] Validasi JSON schema per key (tidak sembarang config bisa masuk)
- [x] Juga invalidate Redis cache + audit log

**Acceptance Criteria:**
```
✅ Toggle 3-Kaki tanpa checklist → 422 Unprocessable Entity
✅ Toggle tanpa 2FA → 403 Forbidden
✅ Toggle oleh ops_manager → 403 Forbidden
✅ Reason < 50 karakter → 400 Bad Request
✅ Setiap toggle → log tersimpan di feature_flag_logs
✅ Setiap toggle → notifikasi ke semua super_admin
✅ Readiness API akurat vs data DB
```

---

### FF-BACK-003 — Cache Invalidation + Broadcast
**Assignee:** Backend (Node.js)
**Estimasi:** 1 hari
**Priority:** P1
**Sprint:** 3

#### Subtask:

- [x] Setelah toggle flag → publish event ke Redis Pub/Sub:
  ```
  Channel: flag:changed
  Payload: { "key": "model_three_legs", "is_enabled": true, "changed_at": "..." }
  ```

- [x] Semua instance routing-service (Go) subscribe ke channel ini → invalidate local cache

- [x] Notifikasi real-time ke admin dashboard via WebSocket:
  ```
  Server → Client: { event: "flag:changed", key: "model_three_legs", enabled: true }
  ```
  Admin dashboard langsung refresh tampilan tanpa perlu reload halaman.

- [x] Alert email template untuk perubahan flag kritikal (model flags):
  ```
  Subject: [ALERT] Feature Flag Changed — model_three_legs: OFF → ON
  Body: Admin Andi mengaktifkan 3-Kaki pada 2026-10-15 09:03 WIB
        Alasan: [reason text]
        IP: 10.0.0.5
        [LIHAT LOG LENGKAP]
  ```

**Acceptance Criteria:**
```
✅ Perubahan flag terasa di routing engine ≤ 60 detik
✅ Admin dashboard update real-time via WebSocket
✅ Email alert terkirim ke semua super_admin dalam 2 menit
```

---

## SPRINT 5 — CUSTOMER APP [BARU v1.1]

---

### FF-MOB-001 — Flag-Aware UI di Customer App
**Assignee:** Mobile Engineer 1
**Estimasi:** 2 hari
**Priority:** P1
**Sprint:** 5 (sisipkan ke dalam CUST-003)

#### Context

Customer app perlu handle skenario ketika model tertentu tidak tersedia (flag OFF). UI harus informatif — bukan crash atau error generik.

#### Subtask:

**[Pricing Estimate Screen — Handle Rejection]**
- [ ] Saat user input alamat pickup dan dropoff, call `POST /pricing/estimate`
- [ ] Handle response error model tidak tersedia:
  ```dart
  // Flutter — handle model unavailable
  if (response.errorCode == 'MODEL_UNAVAILABLE') {
    showBottomSheet(
      icon: Icons.location_off,
      title: 'Rute Belum Tersedia',
      message: response.userMessage,
      // Contoh: "Maaf, rute ini belum tersedia saat ini.
      //          Kami sedang memperluas jangkauan layanan."
      cta: 'Coba Rute Lain',
    );
  }
  ```

- [ ] Tampilkan badge "LAYANAN TERBATAS" di area peta jika zona customer belum aktif untuk model tertentu

- [ ] Jika rute >25 km dan 3-Kaki OFF: jangan crash, tampilkan:
  ```
  ┌─────────────────────────────────┐
  │  📍 Jarak: 32 km               │
  │                                 │
  │  Maaf, layanan untuk rute ini  │
  │  belum tersedia saat ini.      │
  │                                 │
  │  Kami sedang memperluas        │
  │  jangkauan ke area Anda! 🚀    │
  │                                 │
  │  [Coba Rute Lain]              │
  └─────────────────────────────────┘
  ```

- [ ] Track event analytics: `model_unavailable_shown { route_distance, zones, timestamp }`
  → Berguna untuk keputusan kapan aktifkan 3-Kaki (lihat demand di area tsb)

**Acceptance Criteria:**
```
✅ Tidak ada unhandled exception saat model OFF
✅ Pesan ke customer ramah dan informatif
✅ Analytics event tercatat untuk semua rejection
✅ UI test: mock API rejection → verify UI tampil benar
```

---

## SPRINT 6 — COURIER APP [BARU v1.1]

---

### FF-MOB-002 — Flag-Aware Order di Courier App
**Assignee:** Mobile Engineer 2
**Estimasi:** 1 hari
**Priority:** P1
**Sprint:** 6 (sisipkan ke COUR-003)

#### Subtask:

- [ ] Saat kurir online, app query endpoint yang menyertakan info model aktif:
  ```dart
  // Kurir hanya akan menerima order sesuai model yang aktif
  // Backend sudah handle ini — tidak perlu filter di client
  // Tapi UI harus siap menampilkan badge model di notif order:
  ```
  ```
  ┌──────────────────────────────────┐
  │  📦 Order Baru — P2P            │  ← badge model
  │  Rp18.000 | 4.2 km | 28 mnt    │
  │  [ACCEPT]          [DECLINE]    │
  └──────────────────────────────────┘
  ```

- [ ] Badge model warna berbeda: P2P (hijau), 2-Kaki (biru), 3-Kaki (ungu — untuk nanti)
- [ ] Jika kurir relay score <3.5 dan 2-Kaki aktif: tampilkan info "Tingkatkan skor untuk dapat order 2-Kaki"
- [ ] Log: jika kurir decline karena "order type yang tidak familiar" → flag ke admin untuk review training

**Acceptance Criteria:**
```
✅ Badge model tampil di semua order notification
✅ Warna badge sesuai model
✅ Kurir dengan score rendah dapat informasi yang actionable
```

---

## SPRINT 10 — ADMIN DASHBOARD [BARU v1.1]

---

### FF-WEB-001 — Feature Flag Management UI
**Assignee:** Frontend Engineer
**Estimasi:** 3 hari
**Priority:** P0 (Super Admin butuh ini untuk operasional)
**Sprint:** 10 (paralel dengan ADMIN-002)

#### Subtask:

**[Halaman: /admin/feature-flags]**
- [x] Layout: tabel + card view (toggle switch)
- [x] Filter by category tabs: Semua | Model | Pricing | Feature | System
- [x] Per flag card tampilkan:
  ```
  ┌──────────────────────────────────────────────┐
  │ 🚩 model_three_legs          [●●● SUPER ADMIN]│
  │ Model Relay 3-Kaki untuk rute >25km          │
  │                                              │
  │ Status: ⬛ OFF                               │
  │ Terakhir diubah: Belum pernah               │
  │                                              │
  │ [LIHAT CONFIG]  [AUDIT LOG]  [AKTIFKAN ▶]   │
  └──────────────────────────────────────────────┘
  ```

- [x] Toggle switch: klik → muncul modal konfirmasi
- [x] Modal konfirmasi untuk flag biasa:
  ```
  Konfirmasi: Aktifkan model_two_legs?
  Alasan perubahan: [textarea min 50 karakter]
  Kode TOTP: [______]
  [Batal]  [Konfirmasi]
  ```

- [x] Modal konfirmasi untuk `model_three_legs` (extended):
  - [x] Tampilkan 3-Leg Readiness checklist inline
  - [x] Jika belum memenuhi: checklist merah, tombol disable
  - [x] Jika semua terpenuhi: checklist hijau, tombol aktif
  - [x] Checkbox manual confirm + textarea reason + TOTP input

- [x] Config JSON editor:
  - [x] Monaco editor (sama seperti VSCode) dengan syntax highlighting
  - [x] Schema validation real-time
  - [x] Preview: "Dengan config ini, X% order terdampak"

- [x] Audit log per flag: timeline vertikal semua perubahan (before/after, alasan, siapa)

**[Komponen: ToggleFlagModal]**
- [x] Reusable modal for all toggle
- [x] Props: flagKey, currentEnabled, requireChecklist
- [x] States: idle → loading → success/error
- [x] Error states: checklist not met, 2FA wrong, reason too short

**Acceptance Criteria:**
```
✅ Toggle flag biasa: 3 klik (toggle → isi reason → TOTP → submit)
✅ Toggle model_three_legs: tampilkan checklist SEBELUM form
✅ Jika checklist belum met: tombol Aktifkan disabled + tooltip alasan
✅ Setelah toggle: tabel update real-time (WebSocket)
✅ Audit log load dalam <1 detik
✅ Config JSON editor: invalid JSON → error inline
```

---

### FF-WEB-002 — 3-Leg Activation Readiness Dashboard
**Assignee:** Frontend Engineer
**Estimasi:** 2 hari
**Priority:** P1
**Sprint:** 10 (setelah FF-WEB-001)

#### Subtask:

- [x] Halaman `/admin/feature-flags/three-legs-readiness`
- [x] Auto-refresh setiap 60 detik

**[Layout Dashboard]**
```
┌─────────────────────────────────────────────────────────────────┐
│ 🎯  3-LEG ACTIVATION READINESS                     [?] Help    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GATE UTAMA  ─────────────────────────────────────────────────  │
│                                                                 │
│  SLA 2-Kaki (4 Minggu Berturut)        Target: ≥93%            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ W1: 85.2% ████████████░░  W2: 86.1% ████████████░░      │  │
│  │ W3: 88.7% ████████████░░  W4: 89.1% █████████████░░     │  │
│  └──────────────────────────────────────────────────────────┘  │
│  Status: ❌ Belum memenuhi (butuh ≥93% di semua 4 minggu)      │
│                                                                 │
│  SUPPORTING CHECKLIST  ────────────────────────────────────── │
│                                                                 │
│  □ Kurir per zona (≥30)          ❌                            │
│    JAK-TIM: 28  JAK-BAR: 22  JAK-PST: 31  JAK-UTR: 19        │
│                                                                 │
│  □ Titik temu tervalidasi (≥5)   ❌  Saat ini: 4              │
│                                                                 │
│  □ Order harian rata-rata (≥200) ❌  Saat ini: 187/hari       │
│                                                                 │
│  ─────────────────────────────────────────────────────────── │
│  Estimasi siap: ~6 minggu lagi                                 │
│                                                                 │
│  [AKTIFKAN 3-KAKI]  ← 🔒 Disabled — belum semua terpenuhi     │
└─────────────────────────────────────────────────────────────────┘
```

- [x] Progress bar animasi per metrik
- [x] Tooltip per metrik: "Apa ini?" + "Cara memperbaiki"
- [x] Tombol "Aktifkan 3-Kaki" disabled jika belum ready (disabled + tooltip alasan)
- [x] Jika semua ready: tombol hijau + konfetti animasi kecil saat hover
- [x] History chart: trend SLA 2-Kaki 8 minggu terakhir (line chart)
- [x] Export readiness report ke PDF (untuk dokumentasi keputusan)

**Acceptance Criteria:**
```
✅ Data akurat vs DB (test dengan mock data known values)
✅ Auto-refresh 60 detik berjalan tanpa memory leak
✅ Tombol disable + tooltip informatif saat belum ready
✅ Export PDF berfungsi
✅ Responsive untuk layar 1440px dan 1280px
```

---

## SPRINT 12 — QA [BARU v1.1]

---

### FF-QA-001 — Feature Flag Testing
**Assignee:** QA Engineer
**Estimasi:** 3 hari
**Priority:** P0
**Sprint:** 12

#### Test Scenarios

**[Backend — Unit + Integration]**
- [ ] **Routing dengan P2P ON, 2-Kaki ON, 3-Kaki OFF:**
  - Jarak 10 km → P2P ✅
  - Jarak 20 km → 2-Kaki ✅
  - Jarak 30 km → error MSG_THREE_LEGS_UNAVAILABLE ✅

- [ ] **Routing dengan 2-Kaki OFF, 3-Kaki OFF:**
  - Jarak 20 km → error ✅
  - Jarak 10 km → P2P (tidak terpengaruh) ✅

- [ ] **Redis cache behavior:**
  - Toggle flag → DEL cache ✅
  - Routing engine gunakan cache lama max 60 detik ✅
  - Redis down → fallback ke DB ✅

- [ ] **Admin API authorization:**
  - ops_manager toggle → 403 ✅
  - super_admin tanpa 2FA → 403 ✅
  - super_admin dengan 2FA tapi reason <50 char → 400 ✅
  - super_admin aktifkan 3-Kaki tanpa checklist → 422 ✅

- [ ] **3-Leg checklist validation:**
  - SLA 89% (kurang) → reject ✅
  - SLA 94% tapi density <30 → reject ✅
  - Semua terpenuhi → accept ✅

- [ ] **Audit log immutability:**
  - Coba UPDATE feature_flag_logs → trigger error ✅
  - Coba DELETE feature_flag_logs → trigger error ✅

**[Mobile — UI Testing]**
- [ ] Customer app: mock API return MODEL_UNAVAILABLE → bottom sheet tampil ✅
- [ ] Customer app: analytics event tercatat saat rejection ✅
- [ ] Courier app: badge model tampil di order notification ✅

**[Web Admin — E2E Testing]**
- [ ] Toggle flag biasa (ops_manager) → 403 modal error ✅
- [ ] Toggle model_three_legs sebelum ready → checklist merah + tombol disabled ✅
- [ ] Toggle model_three_legs setelah semua ready → flow lengkap sukses ✅
- [ ] WebSocket update setelah toggle → tabel refresh tanpa reload ✅
- [ ] Audit log tampil setelah perubahan ✅

**[Performance Testing]**
- [ ] Flag read dari Redis: P95 < 5ms ✅
- [ ] Flag read dari DB (cache miss): P95 < 20ms ✅
- [ ] SelectModel() dengan flag check: P95 < 20ms ✅
- [ ] 100 order simultan dengan flag check → tidak ada race condition ✅

**[Security Testing]**
- [ ] Injection via config JSON field → sanitasi bekerja ✅
- [ ] TOTP bypass attempt → rate limit + lock ✅
- [ ] Akses endpoint tanpa JWT → 401 ✅
- [ ] Akses endpoint dengan JWT non-super_admin → 403 ✅

**Acceptance Criteria:**
```
✅ Semua 25+ test scenario lulus
✅ Tidak ada race condition pada concurrent flag reads
✅ Security: tidak ada privilege escalation
✅ Performance: flag read tidak menambah latency SignificantModel() >20ms
```

---

## RINGKASAN TASK BARU

| Task ID | Deskripsi | Sprint | Estimasi | Priority | Assignee |
|---|---|---|---|---|---|
| FF-DB-001 | [x] Schema feature_flags + feature_flag_logs + seed | 1 | 2 hari | P0 | Backend Lead |
| FF-BACK-001 | [x] Flag reader service + routing engine update | 3 | 3 hari | P0 | Backend (Go) |
| FF-BACK-002 | [x] Admin API: toggle, config, readiness endpoint | 3 | 3 hari | P0 | Backend (Node) |
| FF-BACK-003 | [x] Cache invalidation + broadcast + email alert | 3 | 1 hari | P1 | Backend (Node) |
| FF-MOB-001 | [ ] Flag-aware UI rejection handling (Customer App) | 5 | 2 hari | P1 | Mobile Eng 1 |
| FF-MOB-002 | [ ] Flag-aware order badge (Courier App) | 6 | 1 hari | P1 | Mobile Eng 2 |
| FF-WEB-001 | [x] Feature Flag Management UI (Web Admin) | 10 | 3 hari | P0 | Frontend Eng |
| FF-WEB-002 | [x] 3-Leg Readiness Dashboard (Web Admin) | 10 | 2 hari | P1 | Frontend Eng |
| FF-QA-001 | [/] End-to-end testing semua feature flag scenarios | 12 | 3 hari | P0 | QA Engineer |
| **Total** | | | **20 hari** | | |

---

## DEPENDENCY BARU

```
FF-DB-001
    │
    ├──► FF-BACK-001 (routing engine butuh schema flag)
    │        │
    │        └──► ORDER-001 (order creation butuh flag-aware routing)
    │
    └──► FF-BACK-002 (admin API butuh schema flag + logs)
             │
             ├──► FF-BACK-003 (cache invalidation butuh toggle API)
             │
             └──► FF-WEB-001 (admin UI consume admin API)
                      │
                      └──► FF-WEB-002 (readiness dashboard pakai API yang sama)

FF-MOB-001 → depends on: ORDER-001 (pricing estimate API dengan error handling)
FF-MOB-002 → depends on: COUR-003 (order notification UI)
FF-QA-001  → depends on: SEMUA FF-* tasks selesai
```

---

## ESTIMASI TAMBAHAN KE TOTAL SPRINT POINTS

| Fase Asal | Story Points Asal | Tambahan FF | Total Baru |
|---|---|---|---|
| Fase 0 (Foundation) | 60 SP | — | 60 SP |
| Fase 1 (Core Backend) | 100 SP | +14 SP (FF-DB, FF-BACK-001,002,003) | 114 SP |
| Fase 2 (Mobile MVP) | 90 SP | +6 SP (FF-MOB-001, FF-MOB-002) | 96 SP |
| Fase 3 (Advanced) | 50 SP | — | 50 SP |
| Fase 4 (Admin Dashboard) | 60 SP | +10 SP (FF-WEB-001, FF-WEB-002) | 70 SP |
| Fase 5 (QA) | 50 SP | +8 SP (FF-QA-001) | 58 SP |
| **Total** | **410 SP** | **+38 SP** | **448 SP** |

Dengan 7 engineer aktif, penambahan **38 SP ≈ 2–3 hari kerja ekstra** tersebar di 6 bulan — dampak ke timeline sangat minimal (<2%).


---

## DEPENDENCY MAP

```
INFRA-001, 002, 003, 004, 005 (Paralel)
    ↓
DB-001 → FF-DB-001 ←──────────────────────────── [BARU v1.1]
    ↓         ↓
ARCH-001   FF-BACK-001 (Flag Reader + Routing)    [BARU v1.1]
    ↓         ↓
AUTH-001   FF-BACK-002 (Admin API flags)          [BARU v1.1]
    ↓         ↓
ORDER-001 ←─────────── (routing engine pakai flag)
    ↓
ORDER-002 → ORDER-003 → ORDER-004
PRICE-001 → PRICE-002
PAY-001 → PAY-002, 003 → FF-BACK-003             [BARU v1.1]
SLA-001
NOTIF-001
TRACK-001
    ↓
CUST-001 → ... → CUST-003 → FF-MOB-001           [BARU v1.1]
COUR-001 → ... → COUR-003 → FF-MOB-002           [BARU v1.1]
SCAN-001, 002
    ↓
RELAY-001, 002 → INS-001
ANALYTICS-001
    ↓
ADMIN-001 → ADMIN-002 → FF-WEB-001               [BARU v1.1]
                      → FF-WEB-002               [BARU v1.1]
ADMIN-003 → ADMIN-004 → ADMIN-005 → ADMIN-006
    ↓
QA-001, 002, 003, 004, 005, 006
FF-QA-001 (paralel dengan QA-*)                  [BARU v1.1]
    ↓
LAUNCH-001, 002, 003
```

---

## ESTIMASI TOTAL STORY POINTS

| Fase | SP v1.0 | Tambahan FF v1.1 | Total |
|---|---|---|---|
| Fase 0: Foundation | 60 SP | — | 60 SP |
| Fase 1: Core Backend | 100 SP | +14 SP (FF-DB, FF-BACK 001-003) | **114 SP** |
| Fase 2: Mobile MVP | 90 SP | +6 SP (FF-MOB 001-002) | **96 SP** |
| Fase 3: Advanced Features | 50 SP | — | 50 SP |
| Fase 4: Admin Dashboard | 60 SP | +10 SP (FF-WEB 001-002) | **70 SP** |
| Fase 5: QA & Hardening | 50 SP | +8 SP (FF-QA-001) | **58 SP** |
| **Total** | **410 SP** | **+38 SP** | **448 SP** |

*Asumsi: 1 developer = ~15-20 SP per sprint (2 minggu)*  
*Dengan 7 developer aktif coding = ~105-140 SP per sprint → 24 minggu realistis*  
*Penambahan 38 SP ≈ 2–3 hari kerja tersebar di 6 bulan — dampak ke timeline <2%*

---

## TECH DEBT & FUTURE ROADMAP (Post-Pilot)

### Fase 2: Series A Features
- [ ] Ekspansi zona: Bekasi, Depok, Tangerang, Bogor
- [ ] Pengembangan algoritma OSRM mandiri (kurangi dependency Google Maps)
- [ ] Customer loyalty program yang lebih kompleks (gamification)
- [ ] B2B API: integrasi langsung ke sistem e-commerce enabler
- [ ] Courier earnings prediction (berapa estimasi penghasilan hari ini)
- [ ] Multi-language support (English)
- [ ] Vehicle expansion: motor berbox, mobil kecil
- [ ] Smart package grouping: gabungkan beberapa order arah yang sama ke 1 kurir

### Infrastruktur Scale
- [ ] Multi-region deployment (saat ekspansi ke kota lain)
- [ ] TimescaleDB untuk GPS data (saat >1 juta rows/hari)
- [ ] Kafka untuk event streaming (gantikan Redis Pub/Sub saat high volume)
- [ ] Kubernetes untuk container orchestration
- [ ] GraphQL API untuk mobile (optimize N+1 queries)
