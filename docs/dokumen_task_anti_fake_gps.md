# Dokumen Task: Anti-Fake GPS System untuk Aplikasi Kurir

## Informasi Proyek

| Atribut | Detail |
|---------|--------|
| **Nama Proyek** | Anti-Fake GPS Defense System |
| **Platform Target** | Android (Native Kotlin) |
| **Versi Minimum Android** | API 26 (Android 8.0) |
| **Prioritas** | Critical (P0) |
| **Estimasi Timeline** | 6–8 Sprint (12–16 Minggu) |
| **Tim Terlibat** | Mobile Team, Backend Team, DevOps/Security, QA |

---

## 1. Latar Belakang & Tujuan

### 1.1 Problem Statement
Aplikasi kurir rentan terhadap manipulasi lokasi menggunakan aplikasi Fake GPS. Serangan ini memungkinkan kurir untuk:
- Melakukan markah kehadiran (check-in/check-out) dari lokasi yang tidak sesuai
- Memanipulasi rute pengantaran untuk menghindari zona yang tidak diinginkan
- Mengakali sistem penghitungan jarak tempuh dan estimasi waktu
- Melakukan kecurangan klaim insentif berbasis lokasi atau jarak

### 1.2 Scope
Sistem harus mampu mendeteksi dan mencegah penggunaan Fake GPS **tanpa memerlukan akses root** pada perangkat kurir, dengan pendekatan defense-in-depth multi-layer.

### 1.3 Goals
1. Mendeteksi penggunaan mock location provider secara real-time
2. Mendeteksi aplikasi Fake GPS yang terpasang pada perangkat
3. Melakukan validasi lokasi menggunakan sensor hardware dan data jaringan
4. Menganalisis perilaku pergerakan yang tidak wajar secara server-side
5. Menerapkan graduated response sesuai tingkat keparahan deteksi

### 1.4 Non-Goals
- Sistem ini tidak bertujuan untuk mendeteksi Fake GPS yang beroperasi pada level kernel atau custom ROM (scope terbatas pada Fake GPS tanpa root)
- Tidak mengimplementasikan solusi untuk platform iOS pada fase ini

---

## 2. Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ANTI-FAKE GPS ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────┐ │
│   │   LAYER 1   │───▶│   LAYER 2   │───▶│   LAYER 3   │───▶│  LAYER  │ │
│   │ Mock Detect │    │ App Detect  │    │  Sensors    │    │ Network │ │
│   │  (Client)   │    │  (Client)   │    │  (Client)   │    │(Client) │ │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └────┬────┘ │
│          │                  │                  │                │      │
│          └──────────────────┴──────────────────┴────────────────┘      │
│                                    │                                   │
│                                    ▼                                   │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    LOCATION TELEMETRY PAYLOAD                    │  │
│   │  {raw_gps, accuracy, altitude, speed, bearing, timestamp,       │  │
│   │   wifi_bssids[], cell_towers[], accelerometer[], gyroscope[],   │  │
│   │   magnetometer[], step_count, barometer, play_integrity_token} │  │
│   └────────────────────────────────┬────────────────────────────────┘  │
│                                    │                                   │
│                                    ▼                                   │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                      SERVER-SIDE VALIDATION                      │  │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │  │
│   │  │   LAYER 4   │  │   LAYER 5   │  │        LAYER 6          │  │  │
│   │  │ Behavioral  │  │   WiFi /    │  │   Anomaly Detection     │  │  │
│   │  │  Analysis   │  │ Cell Tower  │  │    (ML-based)           │  │  │
│   │  │             │  │   Check     │  │                         │  │  │
│   │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │  │
│   └────────────────────────────────┬────────────────────────────────┘  │
│                                    │                                   │
│                                    ▼                                   │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    GRADUATED RESPONSE ENGINE                     │  │
│   │         [VALID] → [SUSPICIOUS] → [FAKE_GPS_DETECTED]            │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Daftar Task

### 3.1 EPIC 1: Client-Side Mock Location Detection (Layer 1)

#### Task 1.1: Implementasi Deteksi Mock Location Provider
**Deskripsi:** Mengimplementasikan mekanisme untuk mendeteksi apakah lokasi yang diterima berasal dari mock location provider.

**Detail Implementasi:**
- Memeriksa flag `isFromMockProvider` pada objek lokasi
- Memeriksa extras bundle untuk key `mockLocation`
- Memeriksa setting sistem `ALLOW_MOCK_LOCATION` pada `Settings.Secure`
- Mengimplementasikan fallback untuk perangkat dengan API level berbeda

**Acceptance Criteria:**
- Sistem berhasil mendeteksi lokasi mock pada perangkat dengan Developer Options aktif
- Deteksi berjalan pada setiap pembaruan lokasi (real-time)
- False positive rate < 1% pada perangkat non-mock

**Estimasi:** 3 hari

---

#### Task 1.2: Implementasi Anti-Circumvention untuk Mock Detection
**Deskripsi:** Mengantisipasi dan mendeteksi teknik bypass pada deteksi mock location standar.

**Detail Implementasi:**
- Deteksi penggunaan reflection untuk mengubah flag `isFromMockProvider`
- Deteksi modifikasi pada Location object melalui Xposed/Frida
- Implementasi checksum integrity pada objek lokasi
- Logging anomali untuk analisis forensik

**Acceptance Criteria:**
- Sistem tetap mendeteksi mock location meskipun flag `isFromMockProvider` dimanipulasi
- Tidak ada crash atau ANR saat deteksi reflection

**Estimasi:** 5 hari

---

### 3.2 EPIC 2: Fake GPS Application Detection (Layer 2)

#### Task 2.1: Pembuatan Database Aplikasi Fake GPS
**Deskripsi:** Menyusun dan memelihara database aplikasi Fake GPS yang dikenal.

**Detail Implementasi:**
- Mengumpulkan package name aplikasi Fake GPS populer (Lexa Fake GPS, Fake GPS Joystick, GPS Emulator, dll)
- Membuat struktur data untuk menyimpan package name, signature, dan metadata
- Mengimplementasikan mekanisme update database secara remote (Firebase Remote Config / API)
- Kategorisasi aplikasi: mock location apps, joystick apps, developer tools

**Acceptance Criteria:**
- Database mencakup minimal 20 aplikasi Fake GPS yang umum digunakan
- Update database dapat dilakukan tanpa perlu rilis aplikasi baru
- Deteksi berhasil mengidentifikasi aplikasi yang terinstall

**Estimasi:** 3 hari

---

#### Task 2.2: Implementasi Scanner Aplikasi Terinstall
**Deskripsi:** Memindai perangkat untuk mendeteksi keberadaan aplikasi Fake GPS.

**Detail Implementasi:**
- Menggunakan `PackageManager` untuk mendapatkan daftar aplikasi terinstall
- Membandingkan package name dan certificate signature dengan database
- Deteksi aplikasi dengan nama package yang mirip (fuzzy matching)
- Deteksi aplikasi dengan permission `ACCESS_MOCK_LOCATION`
- Menghindari false positive pada aplikasi developer legitimate (Android Studio, etc)

**Acceptance Criteria:**
- Scanner berjalan saat aplikasi startup dan secara periodik
- Tidak ada false positive pada aplikasi development legitimate
- Hasil scan dikirim ke server untuk logging

**Estimasi:** 4 hari

---

#### Task 2.3: Deteksi Developer Options & USB Debugging
**Deskripsi:** Mendeteksi status Developer Options dan USB Debugging sebagai indikator potensi risiko.

**Detail Implementasi:**
- Membaca `DEVELOPMENT_SETTINGS_ENABLED` dari `Settings.Global`
- Membaca `ADB_ENABLED` dari `Settings.Global`
- Membaca `ALLOW_MOCK_LOCATION` dari `Settings.Secure`
- Menentukan risk score berdasarkan kombinasi setting

**Acceptance Criteria:**
- Deteksi akurat pada perangkat dengan berbagai merek dan versi Android
- Risk score dikalkulasi dengan benar
- Informasi risk score tersedia untuk keputusan server-side

**Estimasi:** 2 hari

---

### 3.3 EPIC 3: Hardware Sensor Validation (Layer 3)

#### Task 3.1: Implementasi Accelerometer-GPS Fusion
**Deskripsi:** Memvalidasi kecepatan GPS dengan data accelerometer untuk mendeteksi inkonsistensi.

**Detail Implementasi:**
- Mengakses sensor `TYPE_ACCELEROMETER` dan `TYPE_LINEAR_ACCELERATION`
- Mengimplementasikan algoritma integrasi accelerometer untuk estimasi kecepatan
- Membandingkan estimasi kecepatan sensor dengan kecepatan GPS
- Mendeteksi skenario di mana GPS bergerak tapi accelerometer flat (tidak ada percepatan)
- Mengimplementasikan Kalman Filter untuk sensor fusion

**Acceptance Criteria:**
- Sistem mendeteksi inkonsistensi antara GPS dan accelerometer
- Kalman Filter berhasil mengestimasi kecepatan dengan error < 15%
- Tidak ada dampak signifikan pada battery life

**Estimasi:** 8 hari

---

#### Task 3.2: Implementasi Gyroscope Trajectory Validation
**Deskripsi:** Memvalidasi perubahan arah GPS dengan data gyroscope.

**Detail Implementasi:**
- Mengakses sensor `TYPE_GYROSCOPE` dan `TYPE_GYROSCOPE_UNCALIBRATED`
- Mengintegrasikan data gyroscope untuk estimasi perubahan orientasi
- Membandingkan estimasi orientasi dengan perubahan bearing GPS
- Mendeteksi perubahan arah GPS yang tidak didukung oleh gyroscope

**Acceptance Criteria:**
- Sistem mendeteksi perubahan bearing yang tidak wajar
- Integrasi gyroscope akurat untuk periode < 30 detik
- Data gyroscope dikirim ke server sebagai bagian telemetry payload

**Estimasi:** 6 hari

---

#### Task 3.3: Implementasi Step Counter Validation
**Deskripsi:** Menggunakan step counter untuk memvalidasi pergerakan pada mode pejalan kaki.

**Detail Implementasi:**
- Mengakses sensor `TYPE_STEP_COUNTER` dan `TYPE_STEP_DETECTOR`
- Mengkorelasikan jumlah langkah dengan perubahan lokasi GPS
- Mendeteksi skenario: GPS bergerak tapi tidak ada langkah (suspicious)
- Mendetekti skenario: Ada langkah tapi GPS tidak bergerak (GPS error)
- Membedakan mode transportasi: jalan kaki vs kendaraan

**Acceptance Criteria:**
- Sistem akurat membedakan pergerakan jalan kaki vs kendaraan
- False positive pada perjalanan dengan kendaraan < 5%
- Step counter data tersedia untuk analisis server-side

**Estimasi:** 5 hari

---

#### Task 3.4: Implementasi Barometric Pressure Validation
**Deskripsi:** Menggunakan sensor tekanan udara untuk validasi altitude GPS.

**Detail Implementasi:**
- Mengakses sensor `TYPE_PRESSURE`
- Mengkonversi tekanan udara ke altitude menggunakan formula barometrik
- Membandingkan altitude barometrik dengan altitude GPS
- Mendeteksi inkonsistensi altitude yang mencurigakan

**Acceptance Criteria:**
- Perhitungan altitude dari tekanan akurat dengan error < 50 meter
- Sistem mendeteksi lokasi GPS dengan altitude yang tidak wajar
- Fallback jika perangkat tidak memiliki sensor tekanan

**Estimasi:** 4 hari

---

#### Task 3.5: Implementasi Magnetometer Validation
**Deskripsi:** Memvalidasi orientasi dan lokasi menggunakan sensor medan magnetik.

**Detail Implementasi:**
- Mengakses sensor `TYPE_MAGNETIC_FIELD` dan `TYPE_MAGNETIC_FIELD_UNCALIBRATED`
- Membandingkan medan magnetik yang terukur dengan model IGRF (International Geomagnetic Reference Field)
- Mendeteksi lokasi dengan medan magnetik yang tidak sesuai dengan koordinat GPS
- Mengimplementasikan kompas digital untuk validasi bearing

**Acceptance Criteria:**
- Sistem mendeteksi inkonsistensi medan magnetik dengan lokasi GPS
- Kompass digital akurat dengan error < 10 derajat
- Data magnetometer tersedia untuk analisis server-side

**Estimasi:** 5 hari

---

### 3.4 EPIC 4: Network-Based Geolocation (Layer 4)

#### Task 4.1: Implementasi WiFi BSSID Scanning
**Deskripsi:** Memindai jaringan WiFi sekitar untuk validasi lokasi.

**Detail Implementasi:**
- Menggunakan `WifiManager` untuk scan jaringan WiFi
- Mengumpulkan BSSID, SSID, signal strength (RSSI), dan frekuensi
- Mengirim data WiFi ke server untuk cross-check dengan database lokasi
- Menangani permission `ACCESS_FINE_LOCATION` dan `ACCESS_WIFI_STATE`
- Mengatasi throttling scan WiFi pada Android 10+

**Acceptance Criteria:**
- Sistem berhasil mengumpulkan minimal 5 BSSID per scan
- Data WiFi dikirim ke server tanpa mengungkapkan informasi sensitif pengguna
- Scan WiFi berjalan tanpa mengganggu konektivitas perangkat

**Estimasi:** 5 hari

---

#### Task 4.2: Implementasi Cell Tower Triangulation Data
**Deskripsi:** Mengumpulkan data cell tower untuk validasi lokasi alternatif.

**Detail Implementasi:**
- Mengakses `TelephonyManager` untuk informasi cell tower
- Mengumpulkan Cell ID, LAC, MCC, MNC, dan signal strength
- Mengirim data cell tower ke server untuk triangulasi
- Mendukung berbagai tipe jaringan: GSM, CDMA, LTE, 5G NR

**Acceptance Criteria:**
- Sistem berhasil mengumpulkan data cell tower pada berbagai tipe jaringan
- Data cell tower akurat dan lengkap untuk analisis server-side
- Tidak ada crash pada perangkat tanpa SIM card atau dalam mode airplane

**Estimasi:** 4 hari

---

#### Task 4.3: Implementasi IP Geolocation Cross-Check
**Deskripsi:** Memvalidasi lokasi GPS dengan lokasi yang diestimasi dari alamat IP.

**Detail Implementasi:**
- Mengirim request ke IP geolocation service (MaxMind, IPInfo, atau internal)
- Membandingkan lokasi IP dengan lokasi GPS
- Mendeteksi inkonsistensi besar (contoh: GPS di Jakarta, IP di Surabaya)
- Mengimplementasikan caching untuk mengurangi request berulang

**Acceptance Criteria:**
- IP geolocation akurat pada level kota dengan confidence > 80%
- Sistem mendeteksi inkonsistensi GPS-IP dengan jarak > 100 km
- Fallback jika IP geolocation service tidak tersedia

**Estimasi:** 3 hari

---

### 3.5 EPIC 5: Play Integrity API Integration

#### Task 5.1: Integrasi Play Integrity API
**Deskripsi:** Mengintegrasikan Google Play Integrity API untuk validasi integritas perangkat.

**Detail Implementasi:**
- Mendaftarkan aplikasi di Google Play Console untuk Play Integrity API
- Mengimplementasikan server-side verification untuk integrity token
- Memvalidasi `MEETS_DEVICE_INTEGRITY` dan `MEETS_BASIC_INTEGRITY`
- Menangani error dan retry mechanism
- Mengimplementasikan caching token untuk mengurangi beban API

**Acceptance Criteria:**
- Token Play Integrity berhasil diverifikasi server-side
- Perangkat rooted atau dengan bootloader unlocked tidak lulus `MEETS_DEVICE_INTEGRITY`
- Sistem tetap berfungsi jika Play Integrity API tidak tersedia (degraded mode)

**Estimasi:** 6 hari

---

#### Task 5.2: Implementasi Certificate Pinning
**Deskripsi:** Mencegah intercept dan modifikasi data lokasi melalui proxy.

**Detail Implementasi:**
- Mengimplementasikan certificate pinning untuk semua API endpoint
- Menggunakan CertificatePinner dari OkHttp atau TrustManager custom
- Menyediakan mechanism untuk update pinned certificate
- Logging jika certificate pinning gagal (indikasi potensi MITM)

**Acceptance Criteria:**
- Semua request API menggunakan certificate pinning
- Sistem mendeteksi dan menolak koneksi dengan certificate tidak valid
- Update certificate dapat dilakukan tanpa rilis aplikasi baru (via remote config)

**Estimasi:** 3 hari

---

### 3.6 EPIC 6: Telemetry Payload & Transmission

#### Task 6.1: Desain Telemetry Payload Schema
**Deskripsi:** Mendefinisikan struktur data untuk mengirim semua data validasi ke server.

**Detail Implementasi:**
- Merancang schema JSON untuk payload telemetry lokasi
- Field yang harus tersedia: raw_gps, accuracy, altitude, speed, bearing, timestamp, provider, satellite_count, hdop, vdop, pdop, wifi_bssids[], cell_towers[], accelerometer_data[], gyroscope_data[], magnetometer_data[], step_count, barometer_reading, device_integrity_token, mock_detection_result, installed_apps_scan_result, risk_score
- Mengimplementasikan kompresi payload untuk mengurangi bandwidth
- Menentukan frekuensi pengiriman telemetry

**Acceptance Criteria:**
- Schema payload mencakup semua data yang diperlukan untuk validasi server-side
- Payload size < 50 KB per request
- Schema extensible untuk penambahan field di masa depan

**Estimasi:** 4 hari

---

#### Task 6.2: Implementasi Telemetry Transmission Service
**Deskripsi:** Membuat service untuk mengirim data telemetry ke server secara efisien.

**Detail Implementasi:**
- Mengimplementasikan background service untuk pengumpulan dan pengiriman data
- Menggunakan WorkManager untuk scheduling pengiriman periodic
- Mengimplementasikan batching untuk mengurangi jumlah request
- Menangani konektivitas offline dengan local caching
- Mengimplementasikan retry mechanism dengan exponential backoff
- Mengenkripsi data sebelum pengiriman (AES-256-GCM)

**Acceptance Criteria:**
- Telemetry terkirim dengan latency < 5 detik pada koneksi normal
- Data tidak hilang saat offline (dengan batas retention 7 hari)
- Retry mechanism berfungsi dengan baik

**Estimasi:** 6 hari

---

### 3.7 EPIC 7: Server-Side Behavioral Analysis (Layer 5)

#### Task 7.1: Implementasi Speed & Acceleration Analysis
**Deskripsi:** Menganalisis kecepatan dan percepatan pergerakan untuk mendeteksi anomali.

**Detail Implementasi:**
- Menghitung kecepatan rata-rata, maksimum, dan percepatan antar titik lokasi
- Mendeteksi teleportasi (perpindahan jarak jauh dalam waktu singkat)
- Mendeteksi kecepatan yang melebihi batas fisik (contoh: > 200 km/j di jalan biasa)
- Mendeteksi percepatan tidak wajar (0 ke 100 km/j dalam 1 detik)
- Mengimplementasikan threshold yang dapat dikonfigurasi per jenis kendaraan

**Acceptance Criteria:**
- Sistem mendeteksi teleportasi dengan akurasi > 95%
- False positive pada perjalanan dengan kendaraan cepat (kereta, pesawat) < 2%
- Threshold dapat dikonfigurasi tanpa deploy ulang

**Estimasi:** 7 hari

---

#### Task 7.2: Implementasi Trajectory Smoothness Analysis
**Deskripsi:** Menganalisis kelancaran trajektori pergerakan untuk mendeteksi teleportasi atau lompatan.

**Detail Implementasi:**
- Mengimplementasikan algoritma untuk menghitung kelancaran kurva pergerakan
- Mendeteksi perubahan arah tiba-tiba yang tidak wajar (> 180 derajat dalam < 3 detik)
- Menganalisis konsistensi altitude (tidak ada lompatan altitude yang drastis)
- Menggunakan algoritma Douglas-Peucker untuk simplifikasi trajektori
- Membandingkan trajektori dengan peta jalan (road snapping)

**Acceptance Criteria:**
- Sistem mendeteksi trajektori tidak wajar dengan akurasi > 90%
- Road snapping akurat pada area dengan data peta yang baik
- False positive pada perjalanan dengan banyak belokan < 5%

**Estimasi:** 8 hari

---

#### Task 7.3: Implementasi Time-Series Anomaly Detection
**Deskripsi:** Menggunakan analisis time-series untuk mendeteksi pola lokasi yang tidak wajar.

**Detail Implementasi:**
- Mengimplementasikan model statistik untuk time-series lokasi
- Menggunakan moving average, standard deviation, dan Z-score untuk deteksi outlier
- Mendeteksi pola lokasi yang berulang secara identik (indikasi script/replay)
- Menganalisis distribusi lokasi selama periode waktu tertentu

**Acceptance Criteria:**
- Sistem mendeteksi pola lokasi berulang dengan akurasi > 85%
- Model time-series tidak menghasilkan false positive pada rute rutin kurir
- Hasil analisis tersedia dalam dashboard monitoring

**Estimasi:** 7 hari

---

### 3.8 EPIC 8: Server-Side WiFi & Cell Tower Validation (Layer 6)

#### Task 8.1: Implementasi WiFi BSSID Database & Matching
**Deskripsi:** Membuat database WiFi BSSID dan mekanisme matching untuk validasi lokasi.

**Detail Implementasi:**
- Mengumpulkan atau membeli database WiFi BSSID dengan koordinat lokasi
- Mengimplementasikan API untuk query lokasi berdasarkan BSSID
- Membuat algoritma matching untuk membandingkan BSSID yang terdeteksi dengan lokasi GPS
- Mengupdate database secara periodik

**Acceptance Criteria:**
- Database mencakup minimal 80% area operasional kurir
- Matching BSSID akurat dengan error < 200 meter
- API query response time < 500 ms

**Estimasi:** 10 hari

---

#### Task 8.2: Implementasi Cell Tower Triangulation Service
**Deskripsi:** Membuat service untuk menghitung lokasi dari data cell tower.

**Detail Implementasi:**
- Mengumpulkan database cell tower dengan koordinat lokasi
- Mengimplementasikan algoritma triangulasi menggunakan signal strength
- Membuat API untuk estimasi lokasi dari cell tower data
- Membandingkan estimasi dengan lokasi GPS

**Acceptance Criteria:**
- Estimasi lokasi dari cell tower akurat dengan error < 2 km
- Sistem mendeteksi inkonsistensi GPS-cell tower dengan jarak > 5 km
- API response time < 1 detik

**Estimasi:** 8 hari

---

### 3.9 EPIC 9: Machine Learning Anomaly Detection (Layer 7)

#### Task 9.1: Data Pipeline untuk ML Model
**Deskripsi:** Membuat pipeline data untuk melatih dan mengoperasikan model ML deteksi anomali.

**Detail Implementasi:**
- Mendefinisikan feature set untuk model ML (speed, acceleration, trajectory, sensor data, etc)
- Mengimplementasikan ETL pipeline untuk preprocessing data
- Membuat dataset labeled dengan lokasi legitimate dan fake GPS
- Mengimplementasikan feature engineering untuk data temporal dan spatial

**Acceptance Criteria:**
- Dataset training mencakup minimal 10.000 sampel per kategori
- Feature set mencakup semua dimensi yang relevan
- Pipeline berjalan otomatis untuk data baru

**Estimasi:** 10 hari

---

#### Task 9.2: Training & Deployment ML Model
**Deskripsi:** Melatih dan mendeploy model ML untuk deteksi Fake GPS.

**Detail Implementasi:**
- Mengevaluasi berbagai algoritma: Random Forest, XGBoost, LSTM, Isolation Forest
- Melatih model dengan dataset yang telah disiapkan
- Melakukan hyperparameter tuning untuk optimasi performa
- Mendeploy model sebagai microservice (TensorFlow Serving / TorchServe)
- Mengimplementasikan A/B testing untuk evaluasi model

**Acceptance Criteria:**
- Model mencapai precision > 90% dan recall > 85%
- Inference time < 200 ms per request
- Model dapat diupdate tanpa downtime

**Estimasi:** 14 hari

---

#### Task 9.3: Implementasi Real-Time Scoring Engine
**Deskripsi:** Membuat engine untuk scoring real-time berdasarkan output model ML.

**Detail Implementasi:**
- Mengimplementasikan real-time inference pipeline
- Menghitung risk score berdasarkan probabilitas Fake GPS dari model
- Menggabungkan risk score dari berbagai layer (client + server)
- Mengimplementasikan caching untuk hasil scoring

**Acceptance Criteria:**
- Scoring engine menghasilkan risk score dalam < 500 ms
- Risk score akurat dan konsisten
- Engine dapat menangani load > 1000 request/detik

**Estimasi:** 7 hari

---

### 3.10 EPIC 10: Graduated Response System

#### Task 10.1: Desain Graduated Response Framework
**Deskripsi:** Merancang framework untuk respons bertingkat berdasarkan tingkat keparahan deteksi.

**Detail Implementasi:**
- Mendefinisikan level respons: WARNING, TEMPORARY_SUSPEND, PERMANENT_BAN, MANUAL_REVIEW
- Menentukan threshold untuk setiap level berdasarkan risk score
- Merancang mekanisme eskalasi otomatis
- Membuat kebijakan cooldown dan appeal process

**Acceptance Criteria:**
- Framework mencakup semua level respons yang diperlukan
- Threshold dapat dikonfigurasi tanpa deploy ulang
- Dokumentasi kebijakan tersedia untuk tim support

**Estimasi:** 4 hari

---

#### Task 10.2: Implementasi Warning & Notification System
**Deskripsi:** Mengimplementasikan sistem peringatan untuk kurir yang terdeteksi suspicious.

**Detail Implementasi:**
- Mengirim notifikasi in-app warning ke kurir
- Mengirim notifikasi push ke perangkat kurir
- Mencatat semua warning dalam audit log
- Mengimplementasikan rate limiting untuk warning (tidak spam)

**Acceptance Criteria:**
- Warning terkirim dalam < 5 detik setelah deteksi
- Kurir dapat melihat riwayat warning di aplikasi
- Notifikasi tidak mengganggu operasional legitimate

**Estimasi:** 4 hari

---

#### Task 10.3: Implementasi Temporary Suspension System
**Deskripsi:** Mengimplementasikan sistem suspend sementara untuk kurir dengan deteksi berulang.

**Detail Implementasi:**
- Mengunci akses aplikasi untuk periode tertentu (1 jam, 24 jam, 72 jam)
- Menampilkan pesan suspend dengan alasan dan waktu pembukaan
- Mengirim notifikasi ke admin/supervisor
- Mencatat semua suspend dalam audit log
- Mengimplementasikan mekanisme early release dengan manual review

**Acceptance Criteria:**
- Suspend berjalan otomatis berdasarkan threshold
- Kurir tidak dapat bypass suspend
- Admin dapat melakukan early release dengan alasan

**Estimasi:** 5 hari

---

#### Task 10.4: Implementasi Permanent Ban & Appeal System
**Deskripsi:** Mengimplementasikan sistem ban permanen dengan proses banding.

**Detail Implementasi:**
- Mengunci akun kurir secara permanen
- Menyediakan form banding dengan alasan dan bukti
- Mengimplementasikan workflow review untuk banding
- Mengirim notifikasi kekurir tentang status banding
- Mengarsipkan data untuk keperluan legal

**Acceptance Criteria:**
- Ban permanen berjalan otomatis berdasarkan threshold
- Proses banding tersedia dan terdokumentasi
- Keputusan banding dicatat dalam audit log

**Estimasi:** 5 hari

---

### 3.11 EPIC 11: Root Detection & App Security

#### Task 11.1: Implementasi Root Detection
**Deskripsi:** Mendeteksi perangkat yang telah di-root sebagai indikator risiko tinggi.

**Detail Implementasi:**
- Memeriksa keberadaan binary `su` pada path umum
- Memeriksa keberadaan file dan direktori yang terkait dengan root (Magisk, SuperSU, KingRoot)
- Memeriksa property build yang mencurigakan
- Menggunakan SafetyNet / Play Integrity API untuk validasi
- Mengimplementasikan deteksi emulator

**Acceptance Criteria:**
- Root detection akurat pada perangkat yang umum di-root
- False positive pada perangkat non-root < 1%
- Hasil deteksi dikirim ke server sebagai bagian risk assessment

**Estimasi:** 5 hari

---

#### Task 11.2: Implementasi Anti-Debug & Anti-Tamper
**Deskripsi:** Mencegah debugging dan modifikasi aplikasi.

**Detail Implementasi:**
- Mendeteksi debugger yang terpasang (ptrace, JDWP)
- Mendeteksi aplikasi yang berjalan pada emulator
- Memeriksa integritas APK (signature verification)
- Mengimplementasikan obfuscation untuk kode deteksi
- Menggunakan native code (JNI) untuk kode kritis

**Acceptance Criteria:**
- Aplikasi mendeteksi debugging attempt
- Kode deteksi sulit di-reverse engineer
- Sistem tetap stabil meskipun anti-tamper trigger

**Estimasi:** 6 hari

---

### 3.12 EPIC 12: Dashboard & Monitoring

#### Task 12.1: Implementasi Admin Dashboard
**Deskripsi:** Membuat dashboard untuk monitoring dan manajemen deteksi Fake GPS.

**Detail Implementasi:**
- Menampilkan statistik deteksi real-time (total deteksi, per layer, per kurir)
- Menampilkan daftar kurir yang terdeteksi suspicious
- Menyediakan filter dan search untuk investigasi
- Menampilkan detail telemetry untuk setiap deteksi
- Menyediakan tombol aksi: warning, suspend, ban, appeal review

**Acceptance Criteria:**
- Dashboard responsif dan mudah digunakan
- Data real-time dengan latency < 10 detik
- Role-based access control untuk admin

**Estimasi:** 10 hari

---

#### Task 12.2: Implementasi Audit Logging
**Deskripsi:** Mencatat semua aktivitas deteksi dan respons untuk audit dan compliance.

**Detail Implementasi:**
- Mencatat semua deteksi dengan timestamp, kurir ID, lokasi, dan detail
- Mencatat semua tindakan admin (warning, suspend, ban, release)
- Mengimplementasikan immutable log (tidak dapat diubah)
- Menyediakan export log untuk audit eksternal
- Retention policy: 2 tahun

**Acceptance Criteria:**
- Semua aktivitas tercatat dengan lengkap
- Log immutable dan dapat diverifikasi
- Export log tersedia dalam format CSV dan JSON

**Estimasi:** 5 hari

---

### 3.13 EPIC 13: Testing & Quality Assurance

#### Task 13.1: Unit Testing untuk Client-Side Detection
**Deskripsi:** Menulis unit test untuk semua komponen deteksi client-side.

**Detail Implementasi:**
- Unit test untuk mock location detection
- Unit test untuk sensor fusion algorithms
- Unit test untuk WiFi and cell tower scanning
- Unit test untuk telemetry payload generation
- Menggunakan mocking framework untuk sensor data

**Acceptance Criteria:**
- Code coverage > 80% untuk modul deteksi
- Semua test case pass
- Test dapat dijalankan pada CI/CD pipeline

**Estimasi:** 7 hari

---

#### Task 13.2: Integration Testing
**Deskripsi:** Melakukan integration testing untuk alur end-to-end.

**Detail Implementasi:**
- Testing alur dari deteksi client-side hingga respons server-side
- Testing dengan berbagai skenario: legitimate, suspicious, fake GPS
- Testing dengan berbagai perangkat dan versi Android
- Testing dengan kondisi jaringan yang buruk (offline, slow)

**Acceptance Criteria:**
- Semua skenario berjalan sesuai expected behavior
- Tidak ada regression pada fitur existing
- Performance test: response time < 2 detik untuk alur lengkap

**Estimasi:** 8 hari

---

#### Task 13.3: Penetration Testing & Red Team Exercise
**Deskripsi:** Melakukan penetration testing untuk menguji ketahanan sistem terhadap serangan Fake GPS.

**Detail Implementasi:**
- Menggunakan aplikasi Fake GPS populer untuk menguji deteksi
- Menguji bypass techniques: Xposed, Frida, Magisk modules
- Menguji manipulasi data telemetry
- Menguji MITM attack pada API communication
- Menyusun laporan vulnerability dan rekomendasi perbaikan

**Acceptance Criteria:**
- Semua vulnerability critical dan high severity diperbaiki
- Sistem mendeteksi minimal 90% teknik Fake GPS yang umum
- Laporan penetration testing tersedia

**Estimasi:** 10 hari

---

### 3.14 EPIC 14: Documentation & Deployment

#### Task 14.1: Technical Documentation
**Deskripsi:** Menyusun dokumentasi teknis lengkap untuk sistem Anti-Fake GPS.

**Detail Implementasi:**
- Architecture documentation
- API documentation untuk telemetry endpoint
- Deployment guide
- Troubleshooting guide
- Security considerations and best practices

**Acceptance Criteria:**
- Dokumentasi lengkap dan mudah dipahami
- Diagram arsitektur tersedia
- Contoh request/response API tersedia

**Estimasi:** 5 hari

---

#### Task 14.2: Deployment & Rollout Plan
**Deskripsi:** Merencanakan dan melaksanakan deployment sistem ke production.

**Detail Implementasi:**
- Deployment server-side components (microservices, database, ML model)
- Rollout aplikasi client-side dengan feature flag
- Monitoring dan alerting setup
- Rollback plan jika terjadi issue
- Phased rollout: 1% → 10% → 50% → 100%

**Acceptance Criteria:**
- Deployment berhasil tanpa downtime
- Monitoring dan alerting berfungsi
- Rollback dapat dilakukan dalam < 15 menit

**Estimasi:** 5 hari

---

## 4. Timeline & Sprint Planning

### Sprint Breakdown

| Sprint | EPIC | Task | Durasi |
|--------|------|------|--------|
| **Sprint 1** | EPIC 1, EPIC 2 | 1.1, 1.2, 2.1, 2.2, 2.3 | 2 Minggu |
| **Sprint 2** | EPIC 3 | 3.1, 3.2, 3.3 | 2 Minggu |
| **Sprint 3** | EPIC 3, EPIC 4 | 3.4, 3.5, 4.1, 4.2 | 2 Minggu |
| **Sprint 4** | EPIC 4, EPIC 5 | 4.3, 5.1, 5.2 | 2 Minggu |
| **Sprint 5** | EPIC 6 | 6.1, 6.2 | 2 Minggu |
| **Sprint 6** | EPIC 7 | 7.1, 7.2, 7.3 | 2 Minggu |
| **Sprint 7** | EPIC 8 | 8.1, 8.2 | 2 Minggu |
| **Sprint 8** | EPIC 9 | 9.1, 9.2 | 2 Minggu |
| **Sprint 9** | EPIC 9, EPIC 10 | 9.3, 10.1, 10.2 | 2 Minggu |
| **Sprint 10** | EPIC 10, EPIC 11 | 10.3, 10.4, 11.1, 11.2 | 2 Minggu |
| **Sprint 11** | EPIC 12 | 12.1, 12.2 | 2 Minggu |
| **Sprint 12** | EPIC 13 | 13.1, 13.2 | 2 Minggu |
| **Sprint 13** | EPIC 13, EPIC 14 | 13.3, 14.1 | 2 Minggu |
| **Sprint 14** | EPIC 14 | 14.2 | 2 Minggu |

**Total Estimasi:** 14 Sprint (28 Minggu / ~7 Bulan)

---

## 5. Resource Requirements

### Team Composition

| Role | Jumlah | Keterangan |
|------|--------|------------|
| Android Developer (Senior) | 2 | Client-side implementation |
| Backend Developer (Senior) | 2 | Server-side & API |
| ML Engineer | 1 | Model training & deployment |
| DevOps/Security Engineer | 1 | Infrastructure & security |
| QA Engineer | 2 | Testing & automation |
| UI/UX Designer | 1 | Dashboard & notification design |
| Product Manager | 1 | Coordination & stakeholder management |
| Tech Lead | 1 | Architecture & code review |

### Infrastructure

| Komponen | Spesifikasi |
|----------|-------------|
| Application Server | Kubernetes cluster (3 nodes, 8 vCPU, 32 GB RAM) |
| Database | PostgreSQL + Redis (caching) |
| ML Inference | GPU instance untuk model serving |
| Monitoring | Prometheus + Grafana + ELK Stack |
| CI/CD | GitLab CI / GitHub Actions |

---

## 6. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| False positive tinggi | Medium | High | Graduated response, manual review, threshold tuning |
| Fake GPS evolusi teknik | High | High | Continuous monitoring, regular penetration testing |
| Battery drain pada client | Medium | Medium | Optimasi sensor usage, adaptive sampling |
| Privacy compliance (PDP Law) | Medium | High | Data minimization, consent, encryption, audit log |
| Performance issue server | Low | High | Load testing, auto-scaling, caching |
| Dependency pada Play Integrity API | Medium | Medium | Fallback mechanism, degraded mode |

---

## 7. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Fake GPS Detection Rate | > 90% | Jumlah deteksi / Jumlah insiden Fake GPS |
| False Positive Rate | < 5% | Jumlah false positive / Total deteksi |
| Response Time (Client) | < 2 detik | Waktu dari deteksi hingga warning |
| Response Time (Server) | < 500 ms | Waktu inference ML dan scoring |
| Battery Impact | < 10% | Penambahan battery usage per hari |
| Kurir Compliance Rate | > 95% | Persentase kurir yang tidak terdeteksi Fake GPS |

---

## 8. Compliance & Legal Considerations

### 8.1 Privacy Compliance (PDP Law / GDPR)
- **Data Minimization:** Hanya mengumpulkan data yang diperlukan untuk deteksi
- **Consent:** Mendapatkan persetujuan eksplisit dari kurir untuk pengumpulan data sensor
- **Transparency:** Menyediakan privacy policy yang jelas
- **Retention:** Menghapus data telemetry setelah periode retention (7 hari untuk raw data, 2 tahun untuk audit log)
- **Encryption:** Mengenkripsi data telemetry dengan AES-256-GCM

### 8.2 Employment Law
- **Fair Process:** Graduated response harus adil dan proporsional
- **Appeal Process:** Kurir berhak mengajukan banding atas keputusan suspend/ban
- **Documentation:** Semua tindakan harus terdokumentasi untuk keperluan legal

---

## 9. Appendix

### 9.1 Glossary

| Istilah | Definisi |
|---------|----------|
| **Mock Location** | Lokasi palsu yang dihasilkan oleh aplikasi pihak ketiga |
| **Fake GPS** | Aplikasi yang memungkinkan pengguna untuk memalsukan lokasi GPS |
| **BSSID** | Basic Service Set Identifier, alamat MAC unik dari access point WiFi |
| **Kalman Filter** | Algoritma matematika untuk estimasi state sistem dari data yang noisy |
| **IMU** | Inertial Measurement Unit, sensor yang mengukur percepatan dan rotasi |
| **Play Integrity API** | API Google untuk memvalidasi integritas perangkat dan aplikasi |
| **Graduated Response** | Respons bertingkat sesuai tingkat keparahan pelanggaran |

### 9.2 Reference
- OWASP Mobile Security Testing Guide
- Android Developer Documentation - Location & Sensors
- Google Play Integrity API Documentation
- IGRF (International Geomagnetic Reference Field) Model
- PDP Law No. 27 Tahun 2022 (Indonesia)

---

*Dokumen ini merupakan living document dan akan diupdate sesuai dengan perkembangan proyek dan evolusi ancaman Fake GPS.*

**Versi:** 1.0  
**Tanggal:** Juni 2026  
**Penulis:** Tim Security & Mobile Engineering
