package com.tembus.merchant.ui.screens.access

import com.tembus.merchant.data.model.Merchant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MerchantAccessGateViewModelTest {
    @Test
    fun onlyActiveMerchantCanEnterOperationalShell() {
        assertEquals(
            MerchantAccessPhase.READY,
            merchantAccessPhase(Merchant(onboardingStatus = "ACTIVE"))
        )
        assertEquals(
            MerchantAccessPhase.PENDING_REVIEW,
            merchantAccessPhase(Merchant(onboardingStatus = "SUBMITTED", verificationStatus = "pending"))
        )
        assertEquals(
            MerchantAccessPhase.REJECTED,
            merchantAccessPhase(Merchant(onboardingStatus = "REJECTED", verificationStatus = "rejected"))
        )
    }

    @Test
    fun registrationMessageIsNotConfusedWithNetworkFailure() {
        assertTrue(isRegistrationRequiredMessage("Akun ini belum terdaftar sebagai merchant."))
        assertTrue(!isRegistrationRequiredMessage("Koneksi bermasalah. Periksa internet lalu coba lagi."))
    }
}
