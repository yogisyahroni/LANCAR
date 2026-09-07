package com.tembus.courier.ui.screens

import com.tembus.courier.data.model.CourierServiceCapability
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CapabilityAvailabilityTest {
    @Test
    fun serverEligibilityOverridesPersistedStatus() {
        val capability = CourierServiceCapability(
            serviceCode = "food_delivery",
            serviceName = "Food",
            status = "enabled",
            effectiveStatus = "expired",
            isEligible = false,
            availabilityReason = "Sertifikasi sudah kedaluwarsa",
            remediationPath = "Unggah sertifikasi terbaru"
        )

        assertFalse(capabilityIsAvailable(capability))
        assertEquals("expired", capabilityStatusForDisplay(capability))
        assertEquals("Sertifikasi sudah kedaluwarsa", capabilityAvailabilityReason(capability))
        assertEquals("Unggah sertifikasi terbaru", capabilityRemediation(capability))
    }

    @Test
    fun legacyPayloadFallsBackToEnabledStatus() {
        val capability = CourierServiceCapability(
            serviceCode = "tembus_same_day",
            serviceName = "Same Day",
            status = "enabled"
        )

        assertTrue(capabilityIsAvailable(capability))
        assertEquals("enabled", capabilityStatusForDisplay(capability))
    }
}
