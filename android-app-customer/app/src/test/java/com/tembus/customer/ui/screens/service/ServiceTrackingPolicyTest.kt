package com.tembus.customer.ui.screens.service

import org.junit.Assert.assertEquals
import org.junit.Test

class ServiceTrackingPolicyTest {
    @Test
    fun tambalBanTimelineUsesEmergencyStages() {
        assertEquals(0, tambalBanStepIndex("picking_up"))
        assertEquals(1, tambalBanStepIndex("arrived"))
        assertEquals(2, tambalBanStepIndex("inspecting"))
        assertEquals(3, tambalBanStepIndex("in_progress"))
        assertEquals(4, tambalBanStepIndex("completed"))
    }

    @Test
    fun unknownStatusFailsSafeToFirstStage() {
        assertEquals(0, tambalBanStepIndex("provider_new_status"))
        assertEquals("Teknisi menuju Anda", tambalBanStatusText("provider_new_status"))
    }

    @Test
    fun statusCopyMatchesEmergencyLanguage() {
        assertEquals("Teknisi menuju Anda", tambalBanStatusText("accepted"))
        assertEquals("Teknisi sudah tiba", tambalBanStatusText("onsite"))
        assertEquals("Teknisi sedang inspeksi", tambalBanStatusText("inspection"))
        assertEquals("Teknisi sedang pengerjaan", tambalBanStatusText("working"))
        assertEquals("Layanan selesai", tambalBanStatusText("finished"))
    }
}
