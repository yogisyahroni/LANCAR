# 📑 PANDUAN DEPLOYMENT ANDROID (PENGALIHAN KE PRODUCTION)

Dokumen ini merangkum seluruh daftar hal-hal kritis yang **WAJIB DIUBAH** saat Anda hendak merilis aplikasi (Build Release) baik untuk aplikasi **Customer** maupun **Kurir** dari server staging/lokal ke server Production sungguhan.

---

## ⚠️ Checkpoint 1: Alamat API Utama (Base URL)
Agar aplikasi mengarah ke database riil, bukan server testing.

### 📱 Aplikasi Customer (`android-app-customer`)
**File Target:** `app/src/main/java/com/tembus/customer/data/api/TEMBUSApiService.kt`
*   **Ubah Variabel:** `BASE_URL`
*   **Aksi:** Ganti `"http://10.0.2.2:8080/api/v1/"` atau server staging menjadi `"https://api.tembus.id/api/v1/"`.

### 🚚 Aplikasi Kurir (`android-app`)
**File Target:** `app/src/main/java/com/tembus/courier/data/api/TEMBUSApiService.kt` *(atau setara)*
*   **Aksi:** Samakan dengan domain production resmi Anda.

---

## 🔒 Checkpoint 2: Keamanan Jaringan & Certificate Pinning
Menjamin aplikasi hanya mau bicara dengan server asli Anda agar tidak bisa disadap (*Anti-Man-In-The-Middle*).

**Berlaku Untuk Kedua Aplikasi:**
**File Target:** `app/src/main/res/xml/network_security_config.xml`

1.  **Ganti Domain:**
    ```xml
    <domain includeSubdomains="true">GANTI_DENGAN_DOMAIN_PROD_ANDA</domain>
    ```
2.  **Ganti Pin SHA-256 (Sertifikat SSL):**
    Ganti placeholder `AAAAAAAAAAAAAAAA...=` dengan Hash asli (dapatkan via logcat atau OpenSSL seperti panduan sebelumnya).
    ```xml
    <pin digest="SHA-256">MASUKKAN_HASH_ASLI_DARI_SERVER_DISINI</pin>
    ```

---

## 🗺️ Checkpoint 3: Google Maps API Key
Kunci akses untuk menampilkan peta dan live tracking. Tanpa ini, peta akan nge-blank (kosong).

**File Target:** `app/src/main/AndroidManifest.xml`

**Cari baris meta-data berikut dan ganti `value` nya:**
```xml
<meta-data
    android:name="com.google.android.geo.API_KEY"
    android:value="GANTI_DENGAN_GOOGLE_MAPS_API_KEY_PRODUCTION" />
```
> **💡 Tips Pro:** Pastikan kunci API Key Google Maps Anda di Google Cloud Console sudah memiliki pembatasan (*Restriction*) agar HANYA BISA DIPAKAI oleh Package ID dan SHA-1 sertifikat rilis aplikasi Anda!

---

## 🔥 Checkpoint 4: Firebase & Push Notifications
Digunakan agar Notifikasi Pesanan/Tracking realtime masuk ke HP user.

**File Target:** `app/google-services.json`

**Aksi:**
1. Masuk ke Firebase Console Production Anda.
2. Download file `google-services.json` yang baru khusus untuk lingkungan production.
3. Ganti file yang lama di folder `app/` dengan file yang baru didownload ini.

---

## 🛠️ Checkpoint 5: Build Configuration & Versioning
Menyiapkan file final (.apk / .aab) yang siap di-upload ke Google Play Console.

**File Target:** `app/build.gradle.kts`

1.  **Aktifkan Minifikasi (Kode Keamanan Tinggi):**
    Pastikan `isMinifyEnabled = true` di blok `release {}` untuk mengecilkan ukuran aplikasi dan mempersulit pembajakan (*obfuscation*).
2.  **Naikkan Nomor Versi (Jika Update):**
    *   `versionCode` = Tambah +1 dari sebelumnya (contoh: 1 jadi 2).
    *   `versionName` = Ubah string versi (contoh: "1.0" jadi "1.1").

---

## 📦 Checkpoint 6: Langkah Eksekusi Akhir di Android Studio

Setelah semua poin 1 - 5 di atas selesai:

1.  Buka Menu **Build** > **Clean Project**.
2.  Buka Menu **Build** > **Generate Signed Bundle / APK**.
3.  Pilih **Android App Bundle** (.aab) -> **Rekomendasi Google Play**.
4.  Pilih KeyStore rilis Anda (File `.jks`) dan masukkan password-nya.
5.  Pilih Build Variant: **`release`**.
6.  Klik **Finish** dan tunggu sampai file `.aab` siap di-upload ke Play Console!

---
📝 *Terakhir diperbarui: 13 Mei 2026 (Oleh: The Singularity Architect)*
