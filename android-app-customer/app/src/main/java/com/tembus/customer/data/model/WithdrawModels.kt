package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * WithdrawRequest adalah DTO yang dikirim ke backend untuk permintaan tarik dana.
 *
 * KEAMANAN CLIENT-SIDE (Standar Bank 2026):
 * - amount        : Long (bukan Double/Float) — mencegah floating-point exploit
 * - accountNumber : hanya digit 0-9, 10-18 karakter (standar BI-FAST/SKNBI)
 * - accountHolder : hanya huruf, spasi, titik, apostrof — divalidasi sebelum dikirim
 * - bankCode      : hanya huruf A-Z, uppercase — whitelist approach
 * - idempotencyKey: UUID v4 yang dibangkitkan oleh client — mencegah double-submit
 *
 * Semua field divalidasi di layer UI (WithdrawDialog) sebelum diteruskan ke API.
 * Backend juga melakukan validasi yang sama (defense-in-depth / zero-trust).
 */
@Serializable
data class WithdrawRequest(
    /** Nominal penarikan dalam satuan rupiah penuh (integer, bukan float) */
    @SerialName("amount") val amount: Long,

    /** Nomor rekening tujuan: hanya digit 0-9, panjang 10-18 karakter */
    @SerialName("account_number") val accountNumber: String,

    /** Nama pemilik rekening sesuai data bank: huruf, spasi, titik, apostrof */
    @SerialName("account_holder") val accountHolder: String,

    /** Kode bank tujuan: uppercase, hanya huruf (BCA, BNI, MANDIRI, GOPAY, OVO, dll) */
    @SerialName("bank_code") val bankCode: String,

    /**
     * Idempotency key dalam format UUID v4 yang dibangkitkan setiap kali dialog dibuka.
     * Mencegah double-submit akibat double-click atau network retry.
     * Server akan menolak permintaan dengan key yang sama jika sudah diproses.
     */
    @SerialName("idempotency_key") val idempotencyKey: String
)

/**
 * WithdrawResponse adalah response dari backend setelah permintaan diterima.
 */
@Serializable
data class WithdrawResponse(
    @SerialName("message") val message: String = "",
    @SerialName("status") val status: String = "pending"
)

/**
 * Konstanta validasi input tarik dana — identik dengan konstanta di backend Go
 * (domain/withdraw.go) untuk memastikan konsistensi validasi di kedua sisi.
 */
object WithdrawLimits {
    /** Minimum penarikan = Rp 10.000 */
    const val MIN_AMOUNT: Long = 10_000L
    /** Maximum penarikan per transaksi = Rp 50.000.000 */
    const val MAX_AMOUNT: Long = 50_000_000L
    /** Panjang minimum nomor rekening (standar BI) */
    const val ACCOUNT_NUMBER_MIN_LEN = 10
    /** Panjang maksimum nomor rekening (standar BI) */
    const val ACCOUNT_NUMBER_MAX_LEN = 18

    /**
     * Validasi nomor rekening: hanya digit ASCII 0-9, panjang 10-18.
     * WAJIB: tidak boleh ada simbol, spasi, huruf, atau karakter unicode lain.
     */
    fun isValidAccountNumber(value: String): Boolean {
        if (value.length < ACCOUNT_NUMBER_MIN_LEN || value.length > ACCOUNT_NUMBER_MAX_LEN) return false
        return value.all { it in '0'..'9' }
    }

    /**
     * Validasi nama pemilik rekening: whitelist approach.
     * Hanya huruf A-Z/a-z, spasi, titik, dan apostrof yang diizinkan.
     * Mencegah: XSS, HTML injection, SQL injection, script tag.
     */
    fun isValidAccountHolder(value: String): Boolean {
        if (value.trim().length < 2 || value.trim().length > 100) return false
        return value.trim().all { c ->
            c.isLetter() || c == ' ' || c == '.' || c == '\''
        }
    }

    /**
     * Validasi kode bank: hanya huruf A-Z, panjang 2-20.
     */
    fun isValidBankCode(value: String): Boolean {
        if (value.length < 2 || value.length > 20) return false
        return value.all { it.isLetter() }
    }

    /**
     * Format nominal rupiah untuk tampilan (tanpa desimal).
     * Input: Long (rupiah penuh)
     * Output: "Rp 50.000"
     */
    fun formatRupiah(amount: Long): String {
        if (amount <= 0L) return "Rp 0"
        val s = amount.toString()
        val sb = StringBuilder("Rp ")
        var count = 0
        for (i in s.length - 1 downTo 0) {
            if (count > 0 && count % 3 == 0) sb.insert(3, ".")
            sb.insert(3, s[i])
            count++
        }
        return sb.toString()
    }
}
