package com.tembus.courier.data.api

import com.tembus.courier.R
import retrofit2.Response

/**
 * CORE-2026-008 — Typed recoverable errors (Courier).
 *
 * Translates the canonical `code` returned in the backend ErrorResponse
 * (see backend/.../middleware.ErrorResponse) into a user-facing message + an
 * actionable next step. This prevents raw internal error text from reaching
 * the UI.
 */
@Suppress("UNUSED_PARAMETER")
fun String.withRequestReference(response: Response<*>): String {
    // Referensi tidak perlu ditampilkan di UI aplikasi kurir
    return this
}

/**
 * Appends a short recovery hint for known server error codes.
 * Keep this helper aligned with the customer client because OrderViewModel
 * parses canonical error codes before the richer TembusError surface is used.
 */
fun String.withRecoverableNextAction(code: String?): String {
    val action = when (code) {
        "REQUOTE_REQUIRED", "CARRIER_RATE_EXPIRED" -> "Muat ulang tarif terbaru sebelum melanjutkan."
        "OUT_OF_SERVICE_AREA" -> "Periksa kembali lokasi layanan atau hubungi dukungan."
        "NO_COURIER" -> "Muat ulang pekerjaan atau coba lagi beberapa saat."
        "PROVIDER_UNAVAILABLE" -> "Coba lagi setelah provider kembali tersedia."
        "ITEM_UNAVAILABLE" -> "Muat ulang detail order sebelum melanjutkan."
        "INVALID_TRANSITION" -> "Muat ulang status terbaru sebelum mencoba lagi."
        "PAYMENT_PENDING" -> "Tunggu konfirmasi pembayaran sebelum melanjutkan."
        "PROOF_REQUIRED" -> "Lengkapi bukti yang diwajibkan lalu kirim ulang."
        "HANDOFF_INVALID" -> "Minta atau pindai ulang bukti serah-terima yang valid."
        "SCHEDULE_INVALID" -> "Muat ulang jadwal layanan yang tersedia."
        "CAPABILITY_MISMATCH" -> "Pastikan akun memiliki kapabilitas layanan yang dibutuhkan."
        "CARRIER_EVENT_UNKNOWN" -> "Muat ulang pekerjaan sebelum mengulangi aksi."
        else -> null
    } ?: return this
    return if (contains(action, ignoreCase = true)) this else "$this $action"
}

/** Canonical error code -> recovery definition. */
data class RecoveryAction(
    val message: String,
    val action: Action,
    val correlationId: String? = null,
) {
    enum class Action {
        RETRY,            // retry same operation
        PICK_METHOD,      // reselect service / schedule
        REQUOTE,          // prices changed — re-quote
        PAY_FIRST,        // payment pending
        PROOF,            // capture photo / signature
        AUTH_RELOGIN,     // session expired
        CONTACT_SUPPORT,  // non-recoverable — escalation
        NONE,             // informational
    }
}

/** Error codes standardized in CORE-2026-008 (mirrors domain.ErrCode). */
sealed class TembusError(
    val code: String,
    val recovery: RecoveryAction,
) {
    class RequoteRequired(cid: String? = null) : TembusError(
        "REQUOTE_REQUIRED",
        RecoveryAction("Estimates have changed. Please re-quote.", RecoveryAction.Action.REQUOTE, cid),
    )

    class OutOfServiceArea(cid: String? = null) : TembusError(
        "OUT_OF_SERVICE_AREA",
        RecoveryAction("Lokasi Anda di luar zona layanan kami.", RecoveryAction.Action.CONTACT_SUPPORT, cid),
    )

    class NoCourier(cid: String? = null) : TembusError(
        "NO_COURIER",
        RecoveryAction("Driver tidak tersedia. Coba jadwalkan ulang.", RecoveryAction.Action.PICK_METHOD, cid),
    )

    class ProviderUnavailable(cid: String? = null) : TembusError(
        "PROVIDER_UNAVAILABLE",
        RecoveryAction("Provider sementara tidak tersedia. Silakan coba lagi.", RecoveryAction.Action.RETRY, cid),
    )

    class ItemUnavailable(cid: String? = null) : TembusError(
        "ITEM_UNAVAILABLE",
        RecoveryAction("Item tidak tersedia. Pilih item lain.", RecoveryAction.Action.RETRY, cid),
    )

    class InvalidTransition(cid: String? = null) : TembusError(
        "INVALID_TRANSITION",
        RecoveryAction("Aksi tidak valid untuk status pesanan saat ini.", RecoveryAction.Action.NONE, cid),
    )

    class PaymentPending(cid: String? = null) : TembusError(
        "PAYMENT_PENDING",
        RecoveryAction("Pembayaran belum selesai. Silakan lanjutkan pembayaran.", RecoveryAction.Action.PAY_FIRST, cid),
    )

    class ProofRequired(cid: String? = null) : TembusError(
        "PROOF_REQUIRED",
        RecoveryAction("Diperlukan bukti serah terima (foto / tanda tangan).", RecoveryAction.Action.PROOF, cid),
    )

    class HandoffInvalid(cid: String? = null) : TembusError(
        "HANDOFF_INVALID",
        RecoveryAction("Serah terima tidak valid. Periksa area dan paket.", RecoveryAction.Action.NONE, cid),
    )

    class ScheduleInvalid(cid: String? = null) : TembusError(
        "SCHEDULE_INVALID",
        RecoveryAction("Jadwal tidak valid. Pilih rentang waktu lain.", RecoveryAction.Action.PICK_METHOD, cid),
    )

    class CapabilityMismatch(cid: String? = null) : TembusError(
        "CAPABILITY_MISMATCH",
        RecoveryAction("Driver tidak memenuhi kapabilitas yang dibutuhkan.", RecoveryAction.Action.PICK_METHOD, cid),
    )

    class CarrierRateExpired(cid: String? = null) : TembusError(
        "CARRIER_RATE_EXPIRED",
        RecoveryAction("Tarif kupon sudah kadaluwarna. Pilih kupon lain.", RecoveryAction.Action.REQUOTE, cid),
    )

    class CarrierEventUnknown(cid: String? = null) : TembusError(
        "CARRIER_EVENT_UNKNOWN",
        RecoveryAction("Aksi tidak dikenali. Segarkan layar.", RecoveryAction.Action.RETRY, cid),
    )

    class NotFound(cid: String? = null) : TembusError(
        "ERR_NOT_FOUND",
        RecoveryAction("Data tidak ditemukan.", RecoveryAction.Action.NONE, cid),
    )

    class Unauthorized(cid: String? = null) : TembusError(
        "ERR_UNAUTHORIZED",
        RecoveryAction("Sesi berakhir. Silakan masuk kembali.", RecoveryAction.Action.AUTH_RELOGIN, cid),
    )

    class Internal(cid: String? = null) : TembusError(
        "ERR_INTERNAL",
        RecoveryAction("Terjadi kesalahan. Tim kami sudah diberi tahu.", RecoveryAction.Action.RETRY, cid),
    )

    class Validation(cid: String? = null, detail: String? = null) : TembusError(
        "ERR_VALIDATION",
        RecoveryAction(detail ?: "Masukan tidak valid.", RecoveryAction.Action.NONE, cid),
    )

    companion object {
        /** Map a backend error code to a concrete TembusError (+ correlation id). */
        fun fromCode(code: String?, correlationId: String? = null): TembusError = when (code) {
            "REQUOTE_REQUIRED" -> RequoteRequired(correlationId)
            "OUT_OF_SERVICE_AREA" -> OutOfServiceArea(correlationId)
            "NO_COURIER" -> NoCourier(correlationId)
            "PROVIDER_UNAVAILABLE" -> ProviderUnavailable(correlationId)
            "ITEM_UNAVAILABLE" -> ItemUnavailable(correlationId)
            "INVALID_TRANSITION" -> InvalidTransition(correlationId)
            "PAYMENT_PENDING" -> PaymentPending(correlationId)
            "PROOF_REQUIRED" -> ProofRequired(correlationId)
            "HANDOFF_INVALID" -> HandoffInvalid(correlationId)
            "SCHEDULE_INVALID" -> ScheduleInvalid(correlationId)
            "CAPABILITY_MISMATCH" -> CapabilityMismatch(correlationId)
            "CARRIER_RATE_EXPIRED" -> CarrierRateExpired(correlationId)
            "CARRIER_EVENT_UNKNOWN" -> CarrierEventUnknown(correlationId)
            "ERR_NOT_FOUND" -> NotFound(correlationId)
            "ERR_UNAUTHORIZED" -> Unauthorized(correlationId)
            "ERR_VALIDATION", "ERR_INVALID_BODY", "ERR_INVALID_JSON" -> Validation(correlationId)
            else -> Internal(correlationId)
        }
    }
}

/** CORE-2026-008: convert a Retrofit error body into a typed TembusError. */
fun <T : Any> retrofit2.Response<T>.toTembusError(): TembusError? {
    if (isSuccessful) return null
    val body = errorBody()?.string() ?: return null
    val code: String
    val correlationId: String?
    try {
        val obj = org.json.JSONObject(body)
        code = obj.optString("code", "")
        correlationId = obj.optString("correlation_id", null)
    } catch (e: Exception) {
        return TembusError.Internal(cid = body.takeIf { it.length <= 64 })
    }
    return TembusError.fromCode(code, correlationId)
}
