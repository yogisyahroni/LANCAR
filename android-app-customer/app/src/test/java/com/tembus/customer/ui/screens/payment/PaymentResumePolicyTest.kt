package com.tembus.customer.ui.screens.payment

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PaymentResumePolicyTest {
    @Test
    fun resumesPendingQrisSessionAfterProcessDeath() {
        assertTrue(
            PaymentResumePolicy.shouldResumeQrSession(
                paymentMethod = "QRIS",
                redirectUrl = "https://payments.example.test/session",
                status = "pending",
                orderStatus = "pending_payment"
            )
        )
    }

    @Test
    fun doesNotResumeTerminalOrUnsafeSession() {
        assertFalse(
            PaymentResumePolicy.shouldResumeQrSession(
                paymentMethod = "QRIS",
                redirectUrl = "https://payments.example.test/session",
                status = "expired",
                orderStatus = "pending_payment"
            )
        )
        assertFalse(
            PaymentResumePolicy.shouldResumeQrSession(
                paymentMethod = "QRIS",
                redirectUrl = "https://payments.example.test/session",
                status = "pending",
                orderStatus = "cancelled"
            )
        )
        assertFalse(
            PaymentResumePolicy.shouldResumeQrSession(
                paymentMethod = "LAPAY",
                redirectUrl = "https://payments.example.test/session",
                status = "pending",
                orderStatus = "pending_payment"
            )
        )
    }
}
