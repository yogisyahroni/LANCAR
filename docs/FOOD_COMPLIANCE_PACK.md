# FB-091 — Compliance Pack LANCAR (Food Delivery)

> **Status:** DRAFT checklist & pemetaan tanggung jawab (non-code)
> **Tanggal:** 2026-08-07
> **Deliverable per spek:** dokumen PSE Kominfo, NIB/PT, UU PDP (consent + DPO), pajak (PPh 23 komisi, PPh driver, PPN), halal BPJPH & SPP-IRT di KYC merchant → checklist + pemetaan siapa bertanggung jawab.
> **Sumber regulasi:** PermenKominfo 5/2020 → PerMenKomdigi 5/2025 · UU 27/2022 (PDP) · UU HPP 7/2021 + PMK 131/2024 · PMK 60/2022 · PP 55/2022 · UU 33/2014 + PP 39/2021 · PerBPOM 4/2024 · PP 5/2021 (OSS RBA) · PP 80/2019.
> **Referensi internal:** `docs/adr/0003-indonesian-tax-classification-and-rule-code-engine.md`, `docs/MOBILE_PRIVACY_POLICY_AND_DATA_SAFETY_PACK.md`, `docs/finance-tax-tariff-2026-remediation-tasks.md`, skill `indonesian-platform-legal`.

---

## 0. Ringkasan Eksekutif

| Area | Status LANCAR | Prioritas | Hambatan utk go-live publik |
|---|---|---|---|
| **PSE Kominfo** | ❌ Belum daftar | 🔴 WAJIB sebelum operasional | Tidak punya Tanda Daftar PSE → sanksi Kominfo |
| **NIB / PT** | ❌ Belum ada badan hukum | 🔴 WAJIB | Semua perizinan & pajak butuh NIB/PT |
| **UU PDP** | 🟡 Kebijakan Privasi Play Store ada; consent/DPO/lapor-breach belum | 🔴 WAJIB | Data pengguna tanpa dasar pemrosesan sah |
| **Pajak** | 🟢 Tax engine implemented (ADR 0003: PPN logistik 1,1% DPP nilai lain, PPN platform 11%, PPh 21 driver 2,5/3%, PPh 23 2%) | 🟠 pelaporan & admin | NPWP badan, e-Faktur, bukti potong |
| **Halal + SPP-IRT** | ❌ Belum di KYC merchant | 🟠 wajib utk kategori makanan | Merchant makanan tanpa sertifikat = risiko UU 33/2014 |
| **3 dokumen hukum** | ❌ Draft via template skill | 🔴 WAJIB | Mitra bisa diklaim karyawan tanpa Perjanjian Mitra |

**Kesimpulan:** fitur teknis food sudah jauh (FB-083…FB-091), tapi **go-live publik butuh minimal PSE + NIB/PT + 3 dokumen hukum + UU PDP** — semua non-code, estimasi biaya eksternal Rp 5–10 jt (legal + notaris + konsultan pajak).

---

## 1. PSE Lingkup Privat (Wajib)

| Item | Detail |
|---|---|
| **Dasar hukum** | PermenKominfo 5/2020 → **PerMenKomdigi 5/2025** |
| **Kewajiban** | Semua platform digital (termasuk food delivery) daftar PSE Lingkup Privat → dapat Tanda Daftar |
| **Portal** | pse.komdigi.go.id |
| **Data yang perlu disiapkan** | Nama penyelenggara + badan hukum (NIB/PT), alamat, nomor kontak, kategori layanan (marketplace/logistik/platform pembayaran), kontak pengaduan, pernyataan kepatuhan |
| **Sanksi kalau tidak daftar** | Teguran tertulis → denda administratif → blokir akses |

### Checklist
- [ ] Badan hukum (PT) berdiri — lihat §2
- [ ] Daftar akun di pse.komdigi.go.id (K/L/Institusi → Penyelenggara Sistem Elektronik Lingkup Privat)
- [ ] Isi data lengkap + unggah dokumen pendukung
- [ ] Tunggu Tanda Daftar (verifikasi Kominfo)
- [ ] Pasang kontak pengaduan yang valid (email + nomor) — wajib dipublikasikan

### Pemetaan tanggung jawab
| PIC | Tugas |
|---|---|
| **Yogis (Pendiri)** | Registrasi portal, siapkan data, follow-up verifikasi |
| **Konsultan legal (eksternal, opsional)** | Review pernyataan kepatuhan & kategori layanan |

---

## 2. Badan Hukum — PT + NIB (Wajib, prasyarat semua area)

| Item | Detail |
|---|---|
| **Dasar hukum** | PP 5/2021 (OSS RBA), UU PT 40/2007 |
| **Kewajiban** | PT (badan hukum) + NIB via OSS → izin usaha |
| **Portal** | oss.go.id |
| **Catatan skill legal** | Pisahkan **Platform name** (TEMBUS — dokumen konsumen) vs **Legal entity** (PT TEMBUS LINTAS TEKNOLOGI — kontrak/invoice/faktur). Jangan campur. |

### Checklist
- [ ] Akta pendirian PT (notaris) — KLBI sesuai: marketplace/logistik/transportasi
- [ ] SK Kemenkumham
- [ ] NIB via OSS RBA (otomatis terbit) + status berisiko rendah
- [ ] NPWP badan (bisa lewat OSS)
- [ ] Izin usaha sesuai KBLI (opsional tergantung skala; KBLI 4791 e-commerce, 4941 angkutan, 5610 restoran utk merchant)
- [ ] Nomor Induk Berusaha dipakai di: PSE, perbankan (rekening badan utk payout), e-Faktur pajak, kontrak mitra

### Pemetaan tanggung jawab
| PIC | Tugas |
|---|---|
| **Notaris (eksternal)** | Akta pendirian + SK Kemenkumham (Rp ±3–5 jt) |
| **Yogis** | Input OSS, ambil NIB/NPWP, administrasi |

---

## 3. UU PDP No. 27/2022 — Consent, 8 Hak, DPO, Lapor Breach

| Item | Detail |
|---|---|
| **Dasar hukum** | UU 27/2022 (berlaku penuh 2024) |
| **Platform = Pengendali Data** | Wajib: dasar pemrosesan sah (consent/kontrak), tujuan spesifik, periode retensi, 8 Hak Subjek Data, DPO sesuai skala, lapor breach **≤ 3×24 jam**, sanksi s.d. 2% pendapatan tahunan |
| **Data sensitif** | Biometrik (face liveness driver) = data spesifik → consent terpisah eksplisit |

### Kondisi LANCAR sekarang
- 🟢 `docs/MOBILE_PRIVACY_POLICY_AND_DATA_SAFETY_PACK.md` — untuk Play Store Data Safety (kategori data, FCM, lokasi) — **ini bukan pengganti Kebijakan Privasi UU PDP penuh**
- ❌ Belum ada Kebijakan Privasi lengkap (8 hak, retensi, DPO, penghapusan)
- ❌ Belum ada mekanisme consent terpisah utk data biometrik & GPS realtime driver
- ❌ Belum ada DPO + kontak dipublikasikan
- ❌ Belum ada SOP lapor breach 3×24 jam

### Checklist
- [ ] **Kebijakan Privasi** (template: skill `indonesian-platform-legal` → `templates/kebijakan-privasi.md`): tujuan, data yg diproses, retensi, transfer, 8 hak, kontak
- [ ] Consent eksplisit per jenis data — **biometrik & GPS driver = consent terpisah** (checkbox di registrasi)
- [ ] `agreedToTerms` + timestamp tersimpan di server (backend sudah punya pola `agreed_to_terms`? — verifikasi di auth-service)
- [ ] Tunjuk **DPO** (bisa internal utk skala kecil; nama + email `privacy@…` dipublikasikan di Kebijakan Privasi & app)
- [ ] SOP lapor breach internal: deteksi → mitigasi → lapor ke Kominfo & subjek data ≤ 3×24 jam
- [ ] Data retention & deletion policy + mekanisme "hapus akun" (customer app sudah punya? verifikasi)

### Pemetaan tanggung jawab
| PIC | Tugas |
|---|---|
| **Yogis** | Draft Kebijakan Privasi (dari template), SOP breach, mekanisme teknis consent/delete |
| **Konsultan legal (eksternal)** | Review UU PDP compliance (Rp ±1–2 jt) |
| **DPO (Yogis sementara / appoint saat tim ada)** | Pemrosesan permintaan subjek data, kelola breach |

---

## 4. Pajak — Status Engine vs Admin Pelaporan

### 4.1 Sudah diimplementasi (teknis) — ADR 0003
| Transaksi | Rule code | Tarif |
|---|---|---|
| Jasa pengiriman paket | `PPN_11_LOGISTIK` | PPN efektif **1,1%** (DPP nilai lain 10% × 11%) |
| Platform/commission fee | `PPN_11_PLATFORM` | PPN **11%** atas platform fee (DPP 100% service fee) |
| PPh driver (mitra individu) | `PPH_21_NPWP` / `PPH_21_NON_NPWP` | **2,5%** / **3,0%** (tanpa NPWP) |
| PPh 23 logistik B2B | `PPH_23_SERVICE` | **2,0%** dari bruto |
| Escrow merchant | — | Nilai barang = liabilitas, bukan pendapatan LANCAR (akun 2102) |

### 4.2 Gap admin/pelaporan (belum)
- [ ] **NPWP badan** (ikut §2) — tanpa ini e-Faktur & pemotongan tidak bisa
- [ ] **e-Faktur / Coretax** — B2B PKP wajib e-Faktur individual; B2C pakai Faktur Digunggung
- [ ] **PPh 23 atas komisi merchant** — LANCAR sebagai penyedia jasa dipotong 2% oleh merchant PKP; merchant non-PKP tidak memotong → pastikan invoicing benar
- [ ] **Bukti potong PPh 21 driver** — rekap bulanan (engine sudah hitung per-transaksi)
- [ ] **PPN PMSE** (PMK 60/2022) — penunjukan Kemenkeu; evaluasi saat omzet mendekati ambang
- [ ] **PPh final UMKM 0,5%** (PP 55/2022) — relevan utk merchant kecil; edukasi di onboarding
- [ ] Pelaporan SPT masa PPN/PPh bulanan + SPT tahunan badan (konsultan pajak)

### Pemetaan tanggung jawab
| PIC | Tugas |
|---|---|
| **Yogis** | Pastikan tax snapshot lengkap (sudah di engine), export data utk SPT |
| **Konsultan pajak / akuntan (eksternal)** | e-Faktur, SPT masa/tahunan, bukti potong, advis PPh 23 (Rp ±1–2 jt/bulan utk skala kecil bisa kuartalan) |

---

## 5. Halal BPJPH + SPP-IRT — Wajib di KYC Merchant Makanan

| Item | Detail |
|---|---|
| **Dasar hukum** | UU 33/2014, **PP 39/2021** (sertifikat halal wajib produk makanan **sejak Okt 2024**; self-declare utk UMKM mikro), **PerBPOM 4/2024** (SPP-IRT pangan IRT / izin edar BPOM MD/ML industri) |
| **Verifikasi** | SIHALAL (bpjph.halal.go.id) untuk nomor sertifikat; SPP-IRT via sppirt.pom.go.id |

### Kondisi LANCAR sekarang
- ❌ KYC merchant food (lihat `20260806000003_create_merchants_table.sql`: `merchant_documents` — doc_type KTP/foto tempat usaha) **belum ada doc_type sertifikat_halal / spp_irt / izin_edar**

### Checklist
- [ ] Tambah `doc_type` KYC merchant: `sertifikat_halal`, `spp_irt`, `izin_edar_bpom` (+ `nib`) di `merchant_documents`
- [ ] **Validasi nomor** saat submit: SIHALAL (BPJPH) + SPP-IRT/BPOM — minimal format & status via API/manual whitelist
- [ ] Auto-suspend / block menu saat dokumen kedaluwarsa (re-KYC berkala)
- [ ] Tampilkan status halal di kartu merchant (customer app) — best practice GoFood
- [ ] Sertakan nomor sertifikat di detail menu/struk (kepatuhan PP 39/2021)

### Pemetaan tanggung jawab
| PIC | Tugas |
|---|---|
| **Yogis** | Implementasi KYC field + validasi (teknis), SOP re-KYC |
| **Merchant (mitra)** | Mengunggah sertifikat halal/SPP-IRT — syarat aktivasi menu |

---

## 6. Tambahan Kritis (dari skill legal & riset regulasi)

### 6.1 Tiga dokumen hukum wajib
| Dokumen | Fungsi | Template tersedia |
|---|---|---|
| **Perjanjian Mitra** (kurir + merchant) | Mencegah misclassification mitra = karyawan; klausul BUKAN KARYAWAN, tanpa gaji/seragam wajib, sanksi berjenjang, KUHP utk pelanggaran berat | skill `indonesian-platform-legal` → `templates/perjanjian-mitra-kurir.md` |
| **Syarat & Ketentuan** (customer) | Platform = penghubung saja; barang dilarang (narkotika/miras/senjata/B3); refund ≤14 hari; pilihan forum | `templates/syarat-ketentuan-pengguna.md` |
| **Kebijakan Privasi** (UU PDP) | §3 | `templates/kebijakan-privasi.md` |

Checklist:
- [ ] 3 dokumen di-draft (template skill) + di-review konsultan legal
- [ ] Perjanjian Mitra di-notarisasi (Rp ±1–2 jt) — kurir & merchant
- [ ] Link dokumen publik di app (profile/help) — 3 app (customer, courier, merchant)
- [ ] Checkbox persetujuan di registrasi (courier: `agreedToTerms`; customer: `agreedToTerms`; merchant) + **timestamp consent tersimpan server**

### 6.2 Status mitra vs karyawan (risiko krusial)
- MK Putusan 41/PUU-XVI/2018 + Permenhub 12/2019: mitra ≠ karyawan, **tapi** PN Jaksel 2021 pernah mengabulkan gugatan driver; DPR/Kemenaker mengkaji status "pekerja" (2025–2026).
- Hindari indikator subordinasi: jam kerja wajib, gaji pokok, seragam wajib, larangan multi-platform, atasan langsung, sanksi potong gaji.

### 6.3 Pembayaran / wallet / settlement (ranah BI, bukan OJK)
- Menyimpan dana (saldo, escrow, settlement) = kegiatan sistem pembayaran → **PJP berizin atau kerja sama dgn PJP** (PBI). OJK hanya jika paylater/pinjaman.
- LANCAR sekarang: settlement merchant via ledger internal + payout bank → pastikan aliran dana lewat PJP (payment gateway/Xendit/Midtrans dsb) atau kerja sama PJP sebelum menyimpan dana end-user.

---

## 7. Ringkasan Pemetaan Tanggung Jawab (RACI)

| Aktivitas | Yogis (Pendiri/Solo Dev) | Notaris | Konsultan Legal | Konsultan Pajak | Merchant (mitra) | Waktu |
|---|---|---|---|---|---|---|
| Akta PT + Kemenkumham | A | **R** | — | — | — | minggu 1–2 |
| NIB/NPWP via OSS | **R** | C | — | C | — | minggu 2 |
| PSE Kominfo | **R** | — | C | — | — | minggu 2–3 |
| 3 dokumen hukum (draft) | **R** | — | R (review) | — | — | minggu 2–4 |
| Notarisasi Perjanjian Mitra | A | **R** | C | — | — | minggu 4 |
| Kebijakan Privasi + DPO + SOP breach | **R** | — | R | — | — | minggu 3–4 |
| Implementasi KYC halal/SPP-IRT (teknis) | **R** | — | C | — | A (unggah dok) | minggu 3–4 |
| e-Faktur, SPT masa/tahunan, bukti potong | C (data) | — | — | **R** | — | bulanan |
| Edukasi PPh final UMKM merchant | **R** | — | — | C | A | kontinu |

R = Responsible · A = Accountable · C = Consulted

---

## 8. Urutan Eksekusi (Critical Path)

1. **Minggu 1–2:** Akta PT + Kemenkumham (notaris) → NIB + NPWP via OSS → rekening badan
2. **Minggu 2–3:** Daftar PSE Kominfo (butuh NIB) → Tanda Daftar
3. **Minggu 2–4:** Draft 3 dokumen hukum dari template skill → review legal → publikasi URL + checkbox registrasi (teknis kecil: verifikasi `agreedToTerms` sudah ada di 3 app)
4. **Minggu 3–4:** Kebijakan Privasi final + DPO + SOP breach; implementasi KYC halal/SPP-IRT merchant + auto-suspend kedaluwarsa
5. **Bulanan (kontinu):** Pajak via konsultan (data siap dari tax engine ADR 0003)

**Estimasi biaya eksternal (sekali):** notaris PT ±Rp 3–5 jt · notarisasi perjanjian ±Rp 1–2 jt · review legal ±Rp 3–5 jt · konsultan pajak ±Rp 1–2 jt/bulan (atau kuartalan utk skala awal). **Total ±Rp 8–14 jt** utk go-live publik.

---

*Dokumen ini adalah checklist & pemetaan tanggung jawab (non-code) — bukan nasihat hukum. Regulasi dapat berubah; verifikasi ulang di peraturan.bpk.go.id / portal terkait sebelum eksekusi.*
