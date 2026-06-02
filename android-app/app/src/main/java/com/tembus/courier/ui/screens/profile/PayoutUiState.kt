package com.tembus.courier.ui.screens.profile

import com.tembus.courier.data.model.CourierPayoutSummaryData

data class PayoutActionState(
    val enabled: Boolean,
    val reason: String? = null
)

fun resolvePayoutActionState(
    summary: CourierPayoutSummaryData?,
    isSubmitting: Boolean
): PayoutActionState {
    if (summary == null) {
        return PayoutActionState(enabled = false, reason = "Saldo pencairan sedang dimuat.")
    }

    if (isSubmitting) {
        return PayoutActionState(enabled = false, reason = "Pengajuan sedang diproses.")
    }

    if (!summary.eligibility.canRequest) {
        return PayoutActionState(
            enabled = false,
            reason = summary.eligibility.reasons.firstOrNull() ?: "Pencairan sedang ditinjau."
        )
    }

    return PayoutActionState(enabled = true)
}
