# TEMBUS Mobile Design Guidelines 2026

Guideline ini adalah sumber aktif untuk UI Android customer dan kurir TEMBUS. Semua layar baru harus mengikuti token, copy, dan pola interaksi di bawah ini.

## 1. Brand Tokens

| Token | Hex | Pemakaian |
| --- | --- | --- |
| Primary | `#003A20` | Header, brand surface, ikon utama, state aktif |
| PrimaryBase | `#005C32` | Secondary action, outline aktif, indikator progres |
| Accent CTA | `#F97316` | CTA utama seperti kirim order, ambil paket, selesai antar |
| Background | `#F7F8F7` | Background app light mode |
| Surface | `#FFFFFF` | Card, input, sheet, dialog |
| Text Primary | `#14211A` | Judul, angka penting, label utama |
| Text Secondary | `#626C67` | Metadata, subtitle, hint |
| Text Disabled | `#B8C0BB` | Disabled action dan placeholder |
| Success | `#16A34A` | Status selesai dan verifikasi valid |
| Warning | `#F59E0B` | Pending, perlu perhatian |
| Error | `#DC2626` | Gagal, batal, destructive |
| Info | `#2563EB` | Informasi netral |

Customer memakai hero hijau bersih dan CTA orange untuk order. Kurir memakai surface hijau gelap untuk konteks operasional, map, dan status on-duty.

## 2. Typography

Gunakan Plus Jakarta Sans atau Inter sebagai target brand font. Compose saat ini memakai `FontFamily.SansSerif` sebagai fallback sampai font asset ditambahkan.

| Style | Size | Weight | Pemakaian |
| --- | --- | --- | --- |
| Heading 1 | 32sp | Bold | Brand, splash, hero utama |
| Heading 2 | 24sp | Bold | Judul halaman |
| Heading 3 | 20sp | SemiBold | Judul card besar |
| Body Large | 16sp | Medium | Copy utama |
| Body | 14sp | Regular | Isi form, daftar, metadata |
| Caption | 12sp | Regular | Hint, timestamp, status kecil |

Letter spacing harus `0.sp`. Jangan memakai negative tracking di mobile karena mudah memadat pada perangkat kecil.

## 3. Spacing And Radius

Gunakan grid 8dp.

| Token | Value | Pemakaian |
| --- | --- | --- |
| Screen padding | 24dp | Page container |
| Section gap | 32dp | Jarak antar section utama |
| Card gap | 16dp | Jarak konten card |
| Card radius | 12dp | Card utama dan status panel (current 8dp component rule) |
| Button radius | 16dp | CTA dan secondary button |
| Input radius | 14dp | Text field, dropdown |
| Chip radius | 50dp | Status chip dan filter |

Card tidak boleh terasa padat. Data table boleh lebih rapat, tetapi form, dashboard, dan tracking wajib punya ruang baca yang jelas.

## 4. Interaction Rules

- CTA utama selalu orange `#FF7A00` dengan teks putih.
- Secondary action memakai outline hijau atau surface putih.
- Semua action mutasi harus punya feedback: loading inline, disabled state, toast, atau perubahan status langsung.
- Loading konten daftar memakai skeleton shape, bukan hanya teks "Loading".
- Bottom navigation memakai ikon jelas, label pendek, dan state aktif hijau.
- Status flow memakai ikon melingkar, garis progres, dan status teks pendek.

## 5. Copy Rules

Jangan tampilkan istilah teknis ke pengguna:

- Jangan gunakan `backend`, `provider`, `admin`, `HTTP`, `Exception`, `Failed`, `Error:`, `demo`, `staging`.
- Jangan tampilkan `belum tersedia` untuk data operasional yang sedang dimuat.
- Ganti dengan bahasa enterprise:
  - `sedang disinkronkan`
  - `sedang disiapkan`
  - `sedang dihitung`
  - `konfigurasi operasional`
  - `tim operasional`
  - `pengajuan`

Contoh:

| Hindari | Gunakan |
| --- | --- |
| Data live belum tersedia | Data sedang disinkronkan |
| Map akan muncul setelah backend mengirim data | Peta tampil otomatis setelah titik valid |
| Provider peta dari admin | Konfigurasi operasional |
| Failed to capture image | Foto belum dapat diambil. Coba lagi |
| Link QRIS belum tersedia | Link QRIS sedang disiapkan |

## 6. Customer App Pattern

- First screen setelah login harus langsung membantu pengguna membuat order atau melacak order aktif.
- Hero copy: `Kiriman aman, sampai tujuan.`
- Primary flow: pickup, tujuan, jenis barang, estimasi biaya, review, kirim order.
- Empty state harus memberi aksi berikutnya, bukan hanya menyatakan data kosong.
- Payment copy harus menjelaskan keamanan pembayaran tanpa istilah gateway internal.

## 7. Courier App Pattern

- First screen kurir harus menjawab: status duty, order aktif, tawaran baru, dan navigasi.
- Copy utama memakai `Mitra Kurir`, bukan `Courier App`.
- Status kerja memakai `On Duty`, `Off Duty`, `Menunggu tawaran`, `Menuju pickup`, `Paket diambil`, `Selesai diterima`.
- Payout memakai `pengajuan`, `rekening pencairan`, `tinjauan treasury`, bukan istilah request/admin.
- Bukti pengiriman memakai bahasa Indonesia: `bukti serah terima`, `foto barang`, `foto paket di titik penerima`.

## 8. Implementation Map

- Courier theme: `android-app/app/src/main/java/com/tembus/courier/ui/theme`
- Customer theme: `android-app-customer/app/src/main/java/com/tembus/customer/ui/theme`
- Shared token object per app: `TembusDesign.kt`
- Resource XML palette per app: `app/src/main/res/values/colors.xml`

Setiap perubahan UI mobile wajib melewati build gate:

```powershell
cd android-app-customer
.\gradlew.bat assembleDebug

cd ..\android-app
.\gradlew.bat assembleDebug
```
