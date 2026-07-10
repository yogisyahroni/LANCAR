# ADR 0003: Indonesian Tax Classification & Rule Code Engine

- **Status:** Approved & Implemented
- **Date:** 2026-07-10
- **Context:** Phase 2 Tax Engine Indonesia (`TAX-001`, `TAX-002`, `TAX-003`, `TAX-004`, `TAX-005`)

## 1. Background & Problem Statement
Dalam mengelola transaksi pengiriman barang (*On-Demand Delivery* dan *Aggregator Shipping*) serta layanan pembayaran merchant (*Payment Link / Escrow*), platform LANCAR perlu membedakan perlakuan Pajak Pertambahan Nilai (PPN) dan Pajak Penghasilan (PPh) sesuai regulasi perpajakan Indonesia terbaru (UU Harmonisasi Peraturan Perpajakan / UU HPP No. 7 Tahun 2021, PMK No. 71/PMK.03/2022).

Sebelumnya, perhitungan pajak berisiko salah klasifikasi jika dipukul rata 11% dari seluruh nilai tagihan (*gross order amount*).

## 2. Tax Classification Decision (TAX-001)

### 2.1. Klasifikasi On-Demand Delivery & Aggregator Shipping
1. **Jasa Pengiriman Paket / Ekspedisi (Logistik Pengiriman - Resale Ongkir):**
   - **Aturan Pajak:** Mengikuti PMK 71/PMK.03/2022 mengenai Dasar Pengenaan Pajak (DPP) Nilai Lain untuk Jasa Pengiriman Paket.
   - **DPP Nilai Lain:** 10% dari jumlah tagihan atau jumlah yang seharusnya ditagih.
   - **Tarif PPN Efektif:** `10% x 11% = 1.1%` dari total tarif pengiriman (*shipping fee*).
   - **Tax Rule Code:** `PPN_11_LOGISTIK` (`effective_rate_pct = 1.10`, `statutory_rate_pct = 11.00`, `dpp_formula = '10_PERCENT'`).
   - **Keterangan:** Pajak Masukan atas perolehan Jasa Pengiriman Paket dengan DPP Nilai Lain tidak dapat dikreditkan.

2. **Jasa Layanan Platform / Aplikasi (Platform Handling & Commission Fee):**
   - **Aturan Pajak:** Jasa penyediaan platform digital / jasa perantara (*marketplace/aggregator fee*).
   - **DPP:** 100% dari nilai *Platform Fee* / *Handling Fee* (bukan nilai barang atau ongkos kirim penyedia).
   - **Tarif PPN Efektif:** `11.0%` dari *Platform Fee* (`SERVICE_FEE_ONLY`).
   - **Tax Rule Code:** `PPN_11_PLATFORM` (`effective_rate_pct = 11.00`, `statutory_rate_pct = 11.00`, `dpp_formula = 'SERVICE_FEE_ONLY'`).

3. **Klasifikasi Payment Link Merchant (Marketplace Escrow vs Collection Service):**
   - Nilai barang (*item price*) yang ditagih dari pembeli atas nama Merchant **bukan** pendapatan LANCAR dan **tidak dikenakan PPN platform pada full amount** (dicatat di akun *Escrow Liability* `2102`).
   - PPN hanya dikenakan atas **Merchant Fee / Payment Link Service Fee** yang dipungut oleh LANCAR.

### 2.2. Perlakuan B2C vs B2B PKP vs B2B Non-PKP & Merchant
- **B2C (Konsumen Akhir):** PPN dipungut secara otomatis dan dicantumkan dalam *Invoice/Receipt*. Faktur Pajak Digabungkan (*Faktur Pajak Digunggung* / e-Faktur B2C).
- **B2B PKP (Pengusaha Kena Pajak):** Wajib menerbitkan e-Faktur / Coretax XML individual (`tax_invoice_required = true`, NPWP/NIK valid).
- **B2B Non-PKP & Merchant:** Menerbitkan Faktur Pajak dengan identitas NIK/NPWP merchant sesuai pasal 13 UU PPN.

### 2.3. Pemotongan PPh (TAX-005)
- **Mitra Kurir / Mitra Pengemudi Individual:** Dikenakan PPh Pasal 21 atas imbalan jasa tenaga kerja lepas.
  - Kurir memiliki NPWP/NIK tersinkronisasi Coretax: `PPH_21_NPWP` (`2.5%` / sesuai tarif efektif rata-rata TER).
  - Kurir tanpa NPWP valid: `PPH_21_NON_NPWP` (`3.0%`).
- **Penyedia Jasa Logistik Badan (3PL / Aggregator Provider):** Dikenakan PPh Pasal 23 Jasa Logistik (`PPH_23_SERVICE`, tarif `2.0%`).

## 3. Implementation Specification
- Seluruh tabel transaksi (`orders`, `payments`, `settlement_ledger_entries`) menyimpan *Tax Snapshot* (`tax_rule_code`, `dpp_idr`, `ppn_idr`, `ppn_rate_effective_pct`, `ppn_rate_statutory_pct`).
- Setiap produk layanan LANCAR di *Product Catalog* maupun *Order Service* wajib merujuk ke `tax_rule_code` yang aktif di tabel `tax_rules`.
