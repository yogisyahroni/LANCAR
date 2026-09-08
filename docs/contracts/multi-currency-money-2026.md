# Multi-Currency Money Contract — 2026

## Purpose

Semua nilai finansial pada quote dan transaksi harus memiliki konteks mata
uang yang dapat direproduksi. Integer legacy berakhiran `_idr` tetap dibaca
untuk kompatibilitas, tetapi bukan sumber kebenaran untuk currency selain
IDR.

## Canonical amount

```json
{
  "amount_minor": 1234,
  "currency": "USD",
  "minor_unit": 2
}
```

- `currency` adalah kode ISO-4217 uppercase yang terdaftar di
  `domain.ISO4217MinorUnit`.
- `amount_minor` adalah integer `int64`; tidak ada binary float yang disimpan
  sebagai financial truth.
- `minor_unit` harus sama dengan exponent ISO currency. Contoh: IDR/JPY = 0,
  USD/EUR = 2, BHD/KWD = 3.
- Perkalian rate dan persentase memakai decimal text/rational arithmetic dan
  half-up rounding. Pembagian currency berbeda tidak boleh dilakukan dengan
  membandingkan integer mentah.

## Transaction boundaries

`orders`, `payments`, `refunds`, `payout_records`, `ledger_journals`, dan
`ledger_entries` menyimpan `currency_code`, `currency_minor_unit`, serta
amount canonical minor-unit. Untuk IDR, trigger compatibility menjaga field
legacy `_idr` tetap sinkron.

Quote pricing yang belum memiliki konfigurasi harga per currency selain IDR
menolak request non-IDR secara fail-closed; quote tersebut tidak boleh diberi
label currency lain secara default.

## FX and settlement

Konversi lintas currency dibuat melalui `FXService`/`ConvertMoney` dan wajib
menyimpan:

- source currency dan source amount;
- target currency dan target amount;
- rate decimal, source dan timestamp rate;
- spread dan fee dalam target minor unit;
- locked rate reference.

`fx_conversion_records` immutable. Koreksi dilakukan dengan record kompensasi
baru. Reconciliation memakai `NewMoneyReconciliationComponent`, yang menolak
perbandingan currency berbeda kecuali caller terlebih dahulu memberikan hasil
konversi eksplisit. Ledger database juga menolak entry dengan currency atau
exponent yang berbeda dari journal dan menyeimbangkan canonical minor units.

## Tax

Tax snapshot membawa currency, minor unit, jurisdiction, effective timestamp,
dan `TaxRuleVersion` yang digunakan. Legacy `PPNIDR` hanya diisi untuk IDR;
non-IDR memakai `DPPMinor`/`PPNMinor`.

## Client contract

Frontend dan Android memformat nilai dari `amount_minor`/canonical component,
`currency`, dan `currency_minor_unit` yang dikirim server. Fallback IDR hanya
berlaku untuk payload legacy yang memang tidak memiliki metadata currency;
komponen canonical non-IDR tidak dikonversi atau diberi simbol Rupiah.
