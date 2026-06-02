# Courier Flow State Machine

Tanggal: 2026-06-02
Scope: TEMBUS Courier App (`android-app`)

Dokumen ini menjadi kontrak P0 untuk flow kurir. UI mobile memakai status order, bukti pickup, dan policy backend untuk menentukan satu aksi utama berikutnya.

## Prinsip

- Backend tetap menjadi sumber kebenaran untuk status order dan policy transisi.
- Mobile menyimpan progress lokal agar scan/foto/POD tetap terlihat setelah app restart.
- Setiap stage hanya punya satu primary CTA.
- Secondary action hanya untuk navigasi, chat, telepon, SOS, cancel/report issue, atau retry sync.
- Istilah user-facing memakai Bahasa Indonesia operasional, bukan istilah internal.

## Stage Matrix

| Stage | Status/Signal | Primary CTA | Tujuan UI | Proof |
| --- | --- | --- | --- | --- |
| `pending_offer` | Tawaran order aktif | Terima Order | Pickup | Belum wajib |
| `assigned` | Order diterima tetapi belum ada bukti pickup | Scan Kode Paket | Pickup | Pickup scan |
| `pickup_scan_required` | `pickup_scan_verified=false` | Scan Kode Paket | Pickup | `pickup_scan` |
| `pickup_photo_required` | Scan sudah valid, foto belum valid | Foto Barang Pickup | Pickup | `pickup_photo` |
| `pickup_verified` | Scan dan foto pickup sudah valid | Mulai Antar | Penerima | Status `in_transit` |
| `delivery_pod_required` | Order sedang diantar | Upload Bukti Terima | Penerima | `delivery_pod_photo` |
| `delivered` | Status selesai | Tidak ada aksi | Selesai | Bukti selesai |
| `failed` | Pengiriman gagal | Hubungi Operasional | Sesuai arahan | Exception proof |
| `cancel_requested` | Pembatalan diproses | Hubungi Operasional | Pickup | Cancel proof |
| `cancelled` | Pickup/order dibatalkan | Tidak ada aksi | Tidak aktif | Cancel proof |
| `return_to_hub` | Paket wajib return | Hubungi Operasional | Hub/sender | Return proof |

## Proof Type

Mobile dan backend harus membedakan tipe bukti berikut:

- `pickup_scan`
- `pickup_photo`
- `delivery_pod_photo`
- `delivery_signature`
- `cancel_pickup_photo`
- `failed_delivery_photo`

Alias lama tetap diterima untuk kompatibilitas:

- `pickup` -> `pickup_photo`
- `delivery` / `pod` -> `delivery_pod_photo`

## Regular Courier

Regular courier memakai guided flow yang sama dengan on-demand:

1. Order diterima.
2. Scan kode paket.
3. Foto pickup jika policy proof mewajibkan.
4. Mulai antar.
5. Upload bukti terima.
6. Selesai.

Jika policy backend belum mengirim requirement foto pickup untuk regular, mobile tetap mewajibkan scan dan membiarkan foto pickup mengikuti policy.

## Offline dan Sync

Mobile harus menampilkan state sinkronisasi:

- `Tersimpan di perangkat`
- `Menunggu sinkronisasi`
- `Tersinkron`
- `Gagal sinkron, coba lagi`

Scan, foto pickup, dan bukti terima yang berhasil disimpan lokal harus tetap muncul setelah app restart. Jika belum berhasil tersinkron, UI wajib menampilkan label pending sync.
