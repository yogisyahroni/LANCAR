package com.tembus.customer.ui.screens.payment

/**
 * A pending QRIS session is resumable after process death because the server remains authoritative
 * for the redirect URL and payment status.
 */
object PaymentResumePolicy {
    fun shouldResumeQrSession(
        paymentMethod: String?,
        redirectUrl: String?,
        status: String,
        orderStatus: String
    ): Boolean {
        val normalizedMethod = paymentMethod?.trim().orEmpty()
        val normalizedStatus = status.trim().lowercase()
        val normalizedOrderStatus = orderStatus.trim().lowercase()
        return normalizedMethod.equals("qris", ignoreCase = true) &&
            !redirectUrl.isNullOrBlank() &&
            normalizedStatus !in setOf("expired", "failed", "cancelled", "canceled") &&
            normalizedOrderStatus !in setOf("cancelled", "canceled", "failed", "payment_failed")
    }
}
