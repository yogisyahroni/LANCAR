# Merchant web support ownership

Dokumen ini menetapkan jalur internal untuk pertanyaan pendaftaran dan penggunaan
Merchant Web. Target di bawah adalah target operasional internal, bukan SLA publik
atau janji waktu penyelesaian kepada merchant.

## Owner dan kanal

- Owner: Merchant Product on-call, dengan eskalasi ke Operations / Security untuk
  kasus akses, moderasi, atau data sensitif.
- Kanal publik: `support@tembus.id` dan [Pusat Bantuan](https://bawain.my.id/bantuan/pusat-bantuan).
- Jalur dukungan aplikasi tetap memakai boundary `admin-service` sesuai
  `docs/contracts/support-cases-2026.md`; Merchant Web tidak membuat sumber data
  dukungan kedua.

## Target respons internal

- Pertanyaan baru ditriase dan diarahkan ke owner dalam 1 hari kerja.
- Kasus yang menghambat pendaftaran atau akses akun diberi prioritas pada hari
  kerja yang sama setelah diterima.
- Eskalasi dilakukan melalui jalur Operations / Security bila menyangkut data
  pribadi, dokumen legal, akses akun, atau dugaan penyalahgunaan.

## Batas komunikasi publik

Merchant Web hanya menampilkan kanal yang sudah menjadi bagian dari permukaan
TEMBUS. Nomor telepon, alamat kantor, testimonial, atau logo partner tidak boleh
ditampilkan sampai memiliki sumber legal/operasional yang terverifikasi dan
persetujuan publikasi.
