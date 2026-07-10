# ADR 0002: Money Movement Matrix

**Status:** Accepted  
**Date:** 2026-07-10  
**Context:** Sebagai bagian dari standarisasi sistem Ledger 2026 (FIN-005), diperlukan sebuah matriks yang menjelaskan secara definitif seluruh pergerakan uang (money movement) dari sisi Akuntansi Double-Entry.
Setiap mutasi finansial wajib mematuhi standar pencatatan dengan mencakup `Debit`, `Credit`, `Trigger Event`, `Table Source`, `Idempotency Key`, dan `Reversal Path`.

## 1. Customer Payment (Direct / Payment Gateway)
- **Description**: Pelanggan membayar pesanan secara langsung melalui QRIS/VA/CC via Payment Gateway.
- **Trigger Event**: Webhook dari Payment Gateway menyatakan transaksi berhasil (PAID).
- **Table Source**: `orders`, `payment_snapshots`
- **Debit**: `cash_main` (Kas perusahaan/PG)
- **Credit**: `unearned_revenue` (Pendapatan ditangguhkan)
- **Idempotency Key**: `payment_gateway_ref_id` atau `order_id` + `payment`
- **Reversal Path**: `refund` journal membalikkan debit/credit.

## 2. Wallet Topup
- **Description**: Pelanggan mengisi saldo wallet mereka.
- **Trigger Event**: Webhook dari Payment Gateway (Topup success).
- **Table Source**: `wallet_transactions`
- **Debit**: `cash_main`
- **Credit**: `customer_wallet_liability` (Kewajiban pada pelanggan)
- **Idempotency Key**: `wallet_tx_id` + `topup`
- **Reversal Path**: Koreksi jika terjadi chargeback, membalikkan transaksi menjadi debit `customer_wallet_liability` dan credit `cash_main`.

## 3. Wallet Payment
- **Description**: Pelanggan membayar pesanan menggunakan saldo wallet.
- **Trigger Event**: Sistem Order mendebit wallet pelanggan saat checkout.
- **Table Source**: `orders`, `wallet_transactions`
- **Debit**: `customer_wallet_liability` (Hutang perusahaan berkurang)
- **Credit**: `unearned_revenue` (Menjadi pendapatan ditangguhkan)
- **Idempotency Key**: `order_id` + `wallet_pay`
- **Reversal Path**: Jika order batal, saldo kembali ke wallet (Reversal journal).

## 4. Refund
- **Description**: Pesanan dibatalkan atau gagal dikirim, uang dikembalikan ke pelanggan.
- **Trigger Event**: Status order berubah menjadi `CANCELED` atau agen _customer service_ memicu refund.
- **Table Source**: `orders`, `refund_requests`
- **Debit**: `unearned_revenue` (jika pesanan belum selesai) ATAU `refund_expense` (jika sudah diakui sebagai revenue)
- **Credit**: `cash_main` (jika refund ke rekening) ATAU `customer_wallet_liability` (jika refund ke wallet)
- **Idempotency Key**: `refund_id`
- **Reversal Path**: Manual adjusment jika refund gagal dari sisi bank.

## 5. Courier Earning (Delivery Completed)
- **Description**: Kurir berhasil menyelesaikan pengiriman.
- **Trigger Event**: Status order berubah menjadi `DELIVERED`.
- **Table Source**: `orders`, `courier_earnings`
- **Debit**: `courier_payout_expense` (Beban jasa kurir)
- **Credit**: `courier_payable` (Hutang ke kurir)
- **Idempotency Key**: `order_id` + `courier_earn`
- **Reversal Path**: Koreksi (Adjustment) melalui admin jika status dikembalikan (misal: fraud).

## 6. Courier Payout (Withdrawal)
- **Description**: Kurir mencairkan pendapatan mereka ke rekening bank.
- **Trigger Event**: Job payout berhasil di-transfer oleh Disbursement Gateway (misal: Xendit/Flip).
- **Table Source**: `courier_withdrawals`
- **Debit**: `courier_payable` (Hutang ke kurir lunas)
- **Credit**: `cash_main` (Kas perusahaan keluar)
- **Idempotency Key**: `withdrawal_id`
- **Reversal Path**: Jika disbursement gagal (bounced), sistem membalik debit/credit untuk mengembalikan saldo ke `courier_payable`.

## 7. Merchant Payment Link (Transaction)
- **Description**: Pembeli membayar melalui payment link milik Merchant.
- **Trigger Event**: Webhook Payment Gateway.
- **Table Source**: `payment_links`, `merchant_transactions`
- **Debit**: `cash_main`
- **Credit**: `merchant_payable` (Hutang perusahaan ke merchant)
- **Idempotency Key**: `payment_link_tx_id`
- **Reversal Path**: Fraud/Chargeback reversal.

## 8. Merchant Settlement
- **Description**: Sistem mentransfer dana Payment Link / COD ke rekening Merchant secara periodik.
- **Trigger Event**: Cron job settlement sukses dieksekusi oleh Disbursement Gateway.
- **Table Source**: `merchant_settlements`
- **Debit**: `merchant_payable`
- **Credit**: `cash_main`
- **Idempotency Key**: `settlement_id`
- **Reversal Path**: Bounced transfer akan membalik status settlement.

## 9. Provider Invoice (Aggregator 3PL)
- **Description**: Pihak 3PL (JNE/J&T, dll.) mengirim tagihan/invoice periodik atas resi yang berhasil dikirim.
- **Trigger Event**: Rekonsiliasi invoice selesai di-approve oleh tim Finance.
- **Table Source**: `provider_invoices`
- **Debit**: `provider_shipping_cost` (Beban ongkir 3PL)
- **Credit**: `provider_payable` (Hutang ke 3PL)
- **Idempotency Key**: `invoice_id`
- **Reversal Path**: Credit Note dari 3PL jika terdapat selisih/dispute tagihan.

## 10. Promo Discount
- **Description**: Penggunaan voucher/diskon oleh pelanggan pada saat checkout.
- **Trigger Event**: Order PAID.
- **Table Source**: `orders`, `promo_redemptions`
- **Debit**: `promo_subsidy_expense` (Beban diskon)
- **Credit**: `unearned_revenue` (Menutupi kekurangan kas dari pelanggan untuk nilai pesanan yang utuh)
- **Idempotency Key**: `order_id` + `promo`
- **Reversal Path**: Dibatalkan otomatis jika order CANCELED.

## 11. Insurance Claim
- **Description**: Klaim asuransi pelanggan disetujui (barang hilang/rusak).
- **Trigger Event**: Admin / Insurance Partner menyetujui klaim.
- **Table Source**: `insurance_claims`
- **Debit**: `insurance_reserve` (Penggunaan cadangan dana asuransi)
- **Credit**: `customer_wallet_liability` ATAU `cash_main`
- **Idempotency Key**: `claim_id`
- **Reversal Path**: Kesalahan transfer klaim harus direverse melalui manual adjustment.
