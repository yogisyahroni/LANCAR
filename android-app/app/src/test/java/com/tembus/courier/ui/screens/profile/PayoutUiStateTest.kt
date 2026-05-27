package com.tembus.courier.ui.screens.profile

import com.tembus.courier.data.model.CourierPayoutBalanceSummary
import com.tembus.courier.data.model.CourierPayoutEligibility
import com.tembus.courier.data.model.CourierPayoutPolicy
import com.tembus.courier.data.model.CourierPayoutSummaryData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PayoutUiStateTest {
    @Test
    fun enablesPayoutActionWhenEligibleAndNotSubmitting() {
        val state = resolvePayoutActionState(
            summary = payoutSummary(canRequest = true),
            isSubmitting = false
        )

        assertTrue(state.enabled)
        assertEquals(null, state.reason)
    }

    @Test
    fun disablesPayoutActionWhenIneligible() {
        val state = resolvePayoutActionState(
            summary = payoutSummary(
                canRequest = false,
                reasons = listOf("Rekening pencairan belum terverifikasi.")
            ),
            isSubmitting = false
        )

        assertFalse(state.enabled)
        assertEquals("Rekening pencairan belum terverifikasi.", state.reason)
    }

    @Test
    fun disablesPayoutActionWhileSubmitting() {
        val state = resolvePayoutActionState(
            summary = payoutSummary(canRequest = true),
            isSubmitting = true
        )

        assertFalse(state.enabled)
        assertEquals("Pengajuan sedang diproses.", state.reason)
    }

    private fun payoutSummary(
        canRequest: Boolean,
        reasons: List<String> = emptyList()
    ) = CourierPayoutSummaryData(
        summary = CourierPayoutBalanceSummary(
            totalBalanceIdr = 100000,
            availableBalanceIdr = 100000,
            pendingBalanceIdr = 0,
            requestedTodayIdr = 0,
            activeRequestCount = 0
        ),
        policy = CourierPayoutPolicy(minAmountIdr = 25000),
        eligibility = CourierPayoutEligibility(
            canRequest = canRequest,
            reasons = reasons,
            maxRequestableIdr = if (canRequest) 100000 else 0
        )
    )
}
