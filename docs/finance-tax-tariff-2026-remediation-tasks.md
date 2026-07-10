# TEMBUS/LANCAR Finance, Tax, Tariff 2026 Remediation Tasks

Status: Draft checklist  
Tanggal: 2026-07-10  
Scope: On-demand logistics, payment link, wallet, courier payout, merchant settlement, aggregator logistics, pajak Indonesia, Rupiah accounting.

## Prinsip Dasar

- [x] Semua nominal uang memakai integer Rupiah (`*_idr`, `BIGINT`/`INT64`), bukan `float`, `double`, atau `float64`.
- [x] Semua transaksi finansial punya idempotency key.
- [x] Semua perubahan saldo berasal dari ledger append-only.
- [x] Semua order menyimpan snapshot komponen harga, pajak, MDR, promo, provider cost, dan tarif yang berlaku saat transaksi.
- [x] Semua laporan finance ditarik dari ledger atau snapshot immutable, bukan kalkulasi ulang dari konfigurasi aktif.
- [x] Semua export pajak harus bisa dijelaskan basis DPP, PPN, masa pajak, dan identitas pihak transaksi.
- [x] Semua proses payout/settlement harus bisa direkonsiliasi dengan payment, order, wallet, dan provider.

## Reference Baseline 2026

- DJP: PPN umum non-mewah/jasa efektif 11%, dengan mekanisme tarif 12% dikalikan 11/12 untuk barang/jasa non-mewah.
- DJP: Tidak ada kenaikan/pungutan pajak baru umum pada 2026; PPN 12% difokuskan ke barang/jasa mewah.
- Bank Indonesia: QRIS MDR tidak boleh diasumsikan flat untuk semua merchant; skema MDR bergantung kategori merchant/transaksi.
- Bank Indonesia: BI-FAST memiliki batas biaya layanan ke nasabah yang perlu dijadikan konfigurasi, bukan hardcoded.

Links:

- [DJP - PMK 131/2024: Tarif PPN Sebelas-Dua Belas](https://www.pajak.go.id/id/artikel/pmk-1312024-tarif-ppn-sebelas-dua-belas)
- [DJP - Tak Ada Kenaikan dan Pungutan Pajak Baru pada 2026](https://www.pajak.go.id/id/artikel/tak-ada-kenaikan-dan-pungutan-pajak-baru-pada-2026)
- [BI - QRIS Pricing Schema](https://www.bi.go.id/en/fungsi-utama/sistem-pembayaran/ritel/kanal-layanan/qris/default.aspx)
- [BI - BI-FAST Pricing](https://www.bi.go.id/id/publikasi/ruang-media/news-release/Pages/sp_2327021.aspx)

## Phase 0 - Accounting Decision

### FIN-001 - Tetapkan Accounting Model TEMBUS

- [x] Tentukan apakah TEMBUS bertindak sebagai `principal` atau `agent` untuk on-demand.
- [x] Tentukan apakah TEMBUS bertindak sebagai `principal` atau `agent` untuk aggregator logistics.
- [x] Tentukan apakah payment link merchant dianggap escrow/marketplace flow atau direct merchant sale.
- [x] Tentukan kapan revenue diakui: saat payment paid, pickup, delivered, atau settlement complete.
- [x] Tentukan apakah revenue on-demand adalah full delivery fee atau hanya platform fee.
- [x] Tentukan apakah revenue aggregator adalah full shipping resale atau hanya handling/markup fee.
- [x] Dokumentasikan keputusan dalam ADR.

Acceptance criteria:

- [x] Ada dokumen keputusan yang menjelaskan revenue recognition per product.
- [x] Setiap product punya `revenue_model`: `principal`, `agent`, `escrow`, atau `commission`.
- [x] Finance, tax, dan pricing memakai keputusan yang sama.

### FIN-002 - Buat Chart of Accounts

- [x] Definisikan akun asset: `cash_main`, `cash_tax`, `cash_reserve`, `cash_provider_settlement`.
- [x] Definisikan akun liability: `customer_wallet_liability`, `merchant_payable`, `courier_payable`, `provider_payable`, `tax_payable_ppn`.
- [x] Definisikan akun revenue: `platform_fee_revenue`, `handling_fee_revenue`, `delivery_revenue`, `payment_admin_fee_revenue`.
- [x] Definisikan akun expense: `courier_payout_expense`, `provider_shipping_cost`, `mdr_expense`, `promo_subsidy_expense`, `insurance_expense`, `refund_expense`.
- [x] Definisikan akun reserve: `weather_reserve`, `insurance_reserve`, `dispute_reserve`.
- [x] Tambahkan mapping product/service ke account.

Acceptance criteria:

- [x] Semua money movement punya debit account dan credit account.
- [x] Tidak ada transaksi finansial tanpa account mapping.

## Phase 1 - Ledger & Rupiah Standardization

### FIN-003 - Implement General Ledger Append-Only

- [x] Buat tabel `ledger_journals`.
- [x] Buat tabel `ledger_entries`.
- [x] Tambahkan constraint total debit = total credit per journal.
- [x] Tambahkan `journal_type`: `payment`, `refund`, `wallet_topup`, `wallet_withdraw`, `courier_payout`, `merchant_settlement`, `provider_invoice`, `tax`, `promo`, `adjustment`.
- [x] Tambahkan `reference_type` dan `reference_id`.
- [x] Tambahkan `idempotency_key` unik per journal.
- [x] Tambahkan `created_by`, `actor_role`, `reason`, `metadata`.
- [x] Tambahkan trigger append-only: tidak boleh update/delete, koreksi wajib lewat reversal journal.

Acceptance criteria:

- [x] Ledger tidak mengizinkan mutation.
- [x] Debit dan credit selalu balance.
- [x] Finance ledger dashboard tidak lagi memakai mock data.

### FIN-004 - Standardisasi Monetary Type

- [x] Audit semua file Go/TypeScript/Kotlin untuk nominal uang yang memakai `float`, `double`, `number` tanpa guard, atau `float64`.
- [x] Refactor `payment-service` wallet domain dari `float64` ke `int64 amountIDR`.
- [x] Refactor disbursement request amount ke integer Rupiah.
- [x] Refactor integration-gateway payment/disbursement amount ke integer Rupiah atau decimal string sesuai provider.
- [x] Tambahkan validation: amount harus integer, positif, tidak overflow.
- [x] Rename field uang ke format `*_idr`.

Acceptance criteria:

- [x] Tidak ada `float64` untuk balance, amount, fee, payout, refund, tax, MDR, atau tariff.
- [x] Semua API finansial menerima/mengembalikan integer Rupiah.

### FIN-005 - Money Movement Matrix

- [x] Buat matrix alur `customer_payment`.
- [x] Buat matrix alur `wallet_topup`.
- [x] Buat matrix alur `wallet_payment`.
- [x] Buat matrix alur `refund`.
- [x] Buat matrix alur `courier_earning`.
- [x] Buat matrix alur `courier_payout`.
- [x] Buat matrix alur `merchant_payment_link`.
- [x] Buat matrix alur `merchant_settlement`.
- [x] Buat matrix alur `provider_invoice`.
- [x] Buat matrix alur `promo_discount`.
- [x] Buat matrix alur `insurance_claim`.

Acceptance criteria:

- [x] Setiap flow punya debit/credit, trigger event, table source, idempotency key, dan rollback/reversal path.

## Phase 2 - Tax Engine Indonesia

### TAX-001 - Tax Classification Decision

- [x] Klasifikasi on-demand delivery: jasa platform, jasa kurir, atau jasa logistik.
- [x] Klasifikasi aggregator shipping: resale ongkir atau komisi/handling fee.
- [x] Klasifikasi payment link merchant: marketplace escrow atau payment collection service.
- [x] Tentukan apakah PPN dipungut pada full amount atau hanya service/platform fee.
- [x] Tentukan aturan untuk B2C, B2B PKP, B2B non-PKP, dan merchant.
- [x] Validasi dengan konsultan pajak sebelum implementation final.

Acceptance criteria:

- [x] Ada ADR pajak yang eksplisit.
- [x] Setiap product punya `tax_rule_code`.

### TAX-002 - Implement Tax Rule Engine

- [x] Buat tabel `tax_rules`.
- [x] Field minimal: `code`, `name`, `tax_type`, `effective_rate_pct`, `statutory_rate_pct`, `dpp_formula`, `invoice_required`, `effective_from`, `effective_to`.
- [x] Buat service kalkulasi DPP, PPN, PPh, dan withholding.
- [x] Buat snapshot tax calculation per transaksi.
- [x] Support versioning aturan pajak.

Acceptance criteria:

- [x] PPN tidak lagi dihitung hardcoded dari `total_price * 0.11`.
- [x] Tax report memakai tax snapshot, bukan hitung ulang dari config aktif.

### TAX-003 - Transaction Tax Snapshot

- [x] Tambahkan `tax_snapshot` di order/payment/payment link/settlement.
- [x] Simpan `dpp_idr`.
- [x] Simpan `ppn_idr`.
- [x] Simpan `ppn_rate_effective_pct`.
- [x] Simpan `ppn_rate_statutory_pct`.
- [x] Simpan `tax_rule_code`.
- [x] Simpan `tax_invoice_required`.
- [x] Simpan `tax_invoice_status`.

Acceptance criteria:

- [x] Setiap transaksi taxable punya snapshot.
- [x] Perubahan tax rule tidak mengubah hasil pajak transaksi lama.

### TAX-004 - eFaktur/Coretax Export Readiness

- [x] Perbaiki query export eFaktur agar memakai kolom yang benar.
- [x] Hilangkan dummy NPWP/NIK/customer address.
- [x] Tambahkan master customer/merchant tax profile.
- [x] Tambahkan nomor referensi invoice/faktur.
- [x] Tambahkan masa pajak dan status export.
- [x] Tambahkan status: `draft`, `exported`, `submitted`, `accepted`, `rejected`.
- [x] Simpan file export dan checksum.

Acceptance criteria:

- [x] Export eFaktur berasal dari data transaksi valid.
- [x] Ada reconciliation antara PPN payable dan eFaktur exported/submitted.

### TAX-005 - PPh Courier, Merchant, Provider

- [x] Definisikan status pajak courier: individu, punya NPWP, NIK only, PKP/non-PKP jika relevan.
- [x] Definisikan apakah courier payout kena PPh 21, PPh 23, atau tidak dipotong oleh platform.
- [x] Definisikan merchant settlement withholding bila ada.
- [x] Definisikan provider invoice tax treatment.
- [x] Buat `withholding_tax_calculations`.
- [x] Buat bukti potong workflow jika diputuskan wajib.

Acceptance criteria:

- [x] Tidak ada lagi proxy PPh 5% untuk semua courier tanpa klasifikasi.
- [x] PPh report punya dasar aturan dan subject profile.

## Phase 3 - Pricing & Tariff Engine

### PRC-001 - Price Component Snapshot

- [x] Simpan `base_fare_idr`.
- [x] Simpan `included_distance_km`.
- [x] Simpan `distance_fee_idr`.
- [x] Simpan `weight_fee_idr`.
- [x] Simpan `volumetric_weight_kg`.
- [x] Simpan `volumetric_surcharge_idr`.
- [x] Simpan `surge_fee_idr`.
- [x] Simpan `insurance_fee_idr`.
- [x] Simpan `platform_fee_idr`.
- [x] Simpan `platform_fee_pct`.
- [x] Simpan `discount_idr`.
- [x] Simpan `promo_subsidy_idr`.
- [x] Simpan `mdr_estimate_idr`.
- [x] Simpan `tax_idr`.
- [x] Simpan `total_price_idr`.

Acceptance criteria:

- [x] Semua order baru bisa diaudit kenapa totalnya segitu.
- [x] UI boleh menampilkan total saja, tapi backend menyimpan breakdown lengkap.

### PRC-002 - Rounding Policy

- [x] Tentukan pembulatan per komponen atau di final total.
- [x] Tentukan penggunaan `round`, `ceil`, atau `floor`.
- [x] Tentukan minimum platform fee.
- [x] Tentukan minimum courier payout.
- [x] Tentukan pembulatan untuk persentase MDR, PPN, surge, platform fee.
- [x] Dokumentasikan policy di ADR.

Acceptance criteria:

- [x] Pricing test mencakup kasus pembulatan.
- [x] Tidak ada perbedaan total antara estimate, checkout, payment, dan invoice.

### PRC-003 - Dynamic Pricing Audit

- [x] Simpan snapshot feature flag pricing saat order dibuat.
- [x] Simpan snapshot weather/demand/supply multiplier.
- [x] Simpan source data surge.
- [x] Simpan zone id dan route metadata.
- [x] Buat report surge revenue impact.

Acceptance criteria:

- [x] Admin bisa menjelaskan setiap surge yang dikenakan.

### PRC-004 - Promo & Discount Accounting

- [x] Bedakan merchant-funded promo dan platform-funded promo.
- [x] Simpan promo sponsor.
- [x] Buat ledger untuk promo subsidy expense.
- [x] Tambahkan batas max discount subsidy sesuai config.
- [x] Tambahkan promo fraud control untuk repeat abuse.

Acceptance criteria:

- [x] Discount tidak menghapus revenue tanpa jejak.

## Phase 4 - Payment, Wallet, Refund, Payout

### PAY-001 - Universal Idempotency

- [x] Terapkan idempotency pada create payment.
- [x] Terapkan idempotency pada wallet topup.
- [x] Terapkan idempotency pada deposit webhook.
- [x] Terapkan idempotency pada refund.
- [x] Terapkan idempotency pada withdraw.
- [x] Terapkan idempotency pada courier payout.
- [x] Terapkan idempotency pada merchant settlement.
- [x] Simpan request hash dan response hash.

Acceptance criteria:

- [x] Retry request tidak menciptakan uang, payout, atau settlement ganda.

### PAY-002 - Wallet Ledger Reconciliation

- [x] Pastikan balance wallet = sum ledger.
- [x] Tambahkan scheduled reconciliation.
- [x] Tambahkan alert jika balance mismatch.
- [x] Tambahkan admin repair workflow via adjustment journal.

Acceptance criteria:

- [x] Wallet balance tidak lagi hanya angka mutable tanpa bukti.

### PAY-003 - Refund Accounting

- [x] Buat refund journal untuk full refund.
- [x] Buat refund journal untuk partial refund 80%.
- [x] Buat reversal tax treatment.
- [x] Buat reversal platform revenue treatment.
- [x] Buat refund liability jika belum dibayar.
- [x] Buat payout/refund status reconciliation.

Acceptance criteria:

- [x] Refund policy 100/80/0 punya ledger dan tax treatment.

### PAY-004 - Courier Payout Payable

- [x] Bedakan earning pending, earning available, payout requested, payout processing, payout paid.
- [x] Payout request wajib mengunci balance available.
- [x] Payout failed wajib reversal hold.
- [x] Payout paid wajib posting final journal.
- [x] Payout fee wajib punya account sendiri.

Acceptance criteria:

- [x] Courier payout tidak bisa double spend.
- [x] Finance bisa reconcile payable vs paid.

### PAY-005 - BI-FAST and Disbursement Fee Config

- [x] Buat tabel/channel config untuk transfer bank, BI-FAST, e-wallet, provider disbursement.
- [x] Simpan fee provider.
- [x] Simpan fee charged to user/courier/merchant.
- [x] Simpan fee borne by platform.
- [x] Simpan max/min amount per channel.

Acceptance criteria:

- [x] Fee tidak hardcoded.
- [x] UI menampilkan fee breakdown sesuai channel.

## Phase 5 - Aggregator Logistics Finance

### AGG-001 - Provider Tariff Schema V2

- [x] Buat tabel `provider_tariff_cards`.
- [x] Buat tabel `provider_tariff_lanes`.
- [x] Buat tabel `provider_tariff_weight_brackets`.
- [x] Support origin city/zip/zone.
- [x] Support destination city/zip/zone.
- [x] Support service code.
- [x] Support effective date.
- [x] Support volumetric divisor per provider.
- [x] Support minimum weight rounding.
- [x] Support insurance fee.
- [x] Support remote area surcharge.
- [x] Support fuel surcharge.
- [x] Support pickup/dropoff surcharge.
- [x] Support return fee.

Acceptance criteria:

- [x] Provider cost tidak lagi hanya `base_rate`, `discount_pct`, `markup_pct`.

### AGG-002 - Provider Cost Snapshot Per Order

- [x] Simpan provider quoted gross tariff.
- [x] Simpan provider discount.
- [x] Simpan provider net cost.
- [x] Simpan platform markup/handling fee.
- [x] Simpan customer shipping charge.
- [x] Simpan chosen provider/service.
- [x] Simpan quote expiry.
- [x] Simpan quote response hash.

Acceptance criteria:

- [x] Margin aggregator bisa dihitung per order/AWB.

### AGG-003 - Provider Invoice Reconciliation

- [x] Buat import provider invoice.
- [x] Match invoice line dengan AWB/order.
- [x] Deteksi overcharge.
- [x] Deteksi undercharge.
- [x] Deteksi missing AWB.
- [x] Deteksi duplicate AWB billing.
- [x] Buat approval flow untuk provider payable.

Acceptance criteria:

- [x] Finance bisa membandingkan provider invoice vs expected provider cost.

### AGG-004 - Merchant Settlement Ledger

- [x] Posting customer payment ke cash/liability.
- [x] Posting merchant payable.
- [x] Posting platform handling fee revenue.
- [x] Posting tax payable.
- [x] Posting settlement release ke merchant.
- [x] Posting settlement failed/retry.
- [x] Posting disputed settlement hold.

Acceptance criteria:

- [x] Merchant settlement bukan hanya status operasional, tapi masuk general ledger.

### AGG-005 - Return, Failed Delivery, Claim

- [x] Definisikan return fee policy.
- [x] Definisikan failed delivery fee policy.
- [x] Definisikan lost/damaged claim policy.
- [x] Buat claim receivable dari provider/asuransi jika relevan.
- [x] Buat customer/merchant compensation journal.

Acceptance criteria:

- [x] Kegagalan provider tidak membuat margin dan refund kacau.

## Phase 6 - Admin Dashboard

### ADM-001 - Real Ledger Page

- [x] Ganti mock ledger entries.
- [x] Tambahkan filter tanggal.
- [x] Tambahkan filter account.
- [x] Tambahkan filter reference type.
- [x] Tambahkan filter journal type.
- [x] Tambahkan export CSV/XLSX.
- [x] Tambahkan drilldown ke order/payment/payout/settlement.

Acceptance criteria:

- [x] Ledger page menampilkan data asli dari `ledger_entries`.

### ADM-002 - Tax Center

- [x] Tampilkan PPN per masa pajak.
- [x] Tampilkan DPP per masa pajak.
- [x] Tampilkan eFaktur draft/exported/submitted/accepted/rejected.
- [x] Tampilkan PPh withholding.
- [x] Tampilkan mismatch pajak.
- [x] Tambahkan export pack.

Acceptance criteria:

- [x] Admin Finance bisa menyiapkan laporan pajak dari satu halaman.

### ADM-003 - Tariff Audit View

- [x] Tampilkan breakdown harga order.
- [x] Tampilkan provider quote.
- [x] Tampilkan platform margin.
- [x] Tampilkan tax snapshot.
- [x] Tampilkan promo subsidy.
- [x] Tampilkan route/distance source.

Acceptance criteria:

- [x] CS/Finance bisa menjelaskan total harga order tanpa buka database.

### ADM-004 - Reconciliation Center

- [x] Payment vs order reconciliation.
- [x] Ledger vs payment reconciliation.
- [x] Wallet balance vs wallet ledger reconciliation.
- [x] Courier payable vs payout paid reconciliation.
- [x] Merchant payable vs settlement paid reconciliation.
- [x] Provider expected cost vs invoice reconciliation.
- [x] Tax snapshot vs eFaktur reconciliation.

Acceptance criteria:

- [x] Semua mismatch punya status, owner, dan resolution note.

### ADM-005 - Approval Workflow

- [x] Tarif change wajib TOTP.
- [x] Tax rule change wajib TOTP.
- [x] Cost config activation wajib TOTP.
- [x] Settlement manual release wajib TOTP.
- [x] Ledger adjustment wajib TOTP.
- [x] Semua approval wajib reason.
- [x] Semua approval masuk audit log.

Acceptance criteria:

- [x] Tidak ada perubahan finance penting tanpa actor, reason, dan audit.

## Phase 7 - Reporting and Closing

### RPT-001 - Monthly Closing Workflow

- [x] Buat period close table.
- [x] Lock ledger period setelah close.
- [x] Generate P&L.
- [x] Generate trial balance.
- [x] Generate cash/liability report.
- [x] Generate tax summary.
- [x] Generate settlement outstanding.

Acceptance criteria:

- [x] Periode tertutup tidak bisa dimutasi kecuali adjustment period berikutnya.

### RPT-002 - Trial Balance

- [x] Report debit/credit per account.
- [x] Validasi debit = credit.
- [x] Export CSV/XLSX.
- [x] Alert jika tidak balance.

Acceptance criteria:

- [x] Finance bisa audit health ledger bulanan.

### RPT-003 - Unit Economics V2

- [x] Margin on-demand per order.
- [x] Margin aggregator per provider/service/lane.
- [x] Margin payment link merchant.
- [x] MDR cost per payment method.
- [x] Promo subsidy per campaign.
- [x] Courier payout ratio.
- [x] Provider cost ratio.

Acceptance criteria:

- [x] Dashboard margin tidak lagi memakai asumsi kasar.

## Phase 8 - Tests and Verification

### QA-001 - Ledger Tests

- [x] Test payment journal balance.
- [x] Test refund journal balance.
- [x] Test payout journal balance.
- [x] Test merchant settlement journal balance.
- [x] Test provider invoice journal balance.
- [x] Test append-only trigger.

### QA-002 - Money Type Tests

- [x] Test decimal/float exploit ditolak.
- [x] Test integer overflow ditolak.
- [x] Test negative amount ditolak.
- [x] Test rounding policy stabil.

### QA-003 - Tax Tests

- [x] Test PPN DPP calculation.
- [x] Test tax snapshot immutable.
- [x] Test eFaktur export data completeness.
- [x] Test PPh classification.

### QA-004 - Reconciliation Tests

- [x] Test payment retry idempotent.
- [x] Test refund retry idempotent.
- [x] Test payout retry idempotent.
- [x] Test settlement retry idempotent.
- [x] Test provider invoice mismatch detection.

## Suggested Execution Order

- [x] Sprint 1: FIN-001, FIN-002, FIN-005, TAX-001.
- [x] Sprint 2: FIN-003, FIN-004, PAY-001.
- [x] Sprint 3: PRC-001, PRC-002, TAX-002, TAX-003.
- [x] Sprint 4: PAY-002, PAY-003, PAY-004, PAY-005.
- [x] Sprint 5: AGG-001, AGG-002, AGG-003.
- [x] Sprint 6: AGG-004, AGG-005, ADM-001, ADM-002.
  - [x] Sprint 7: ADM-003, ADM-004, ADM-005.
  - [x] Sprint 8: RPT-001, RPT-002, RPT-003, QA-001 sampai QA-004.
  
  ## Definition of Done
  
  - [x] Tidak ada nominal uang finansial yang memakai float.
  - [x] Semua payment/refund/payout/settlement punya ledger journal.
  - [x] Ledger debit-credit balance.
  - [x] Semua order baru punya price snapshot dan tax snapshot.
  - [x] Finance dashboard tidak memakai mock ledger.
  - [x] eFaktur export tidak memakai dummy buyer data.
  - [x] PPh report tidak memakai proxy rate tanpa klasifikasi pajak.
  - [x] Aggregator margin bisa dihitung per AWB/order.
  - [x] Provider invoice bisa direkonsiliasi.
  - [x] Monthly closing bisa mengunci periode.
  - [x] Test suite finance/tax/pricing/reconciliation hijau.
