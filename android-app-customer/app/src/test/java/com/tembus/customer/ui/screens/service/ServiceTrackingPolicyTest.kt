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

    @Test
    fun towingTimelineUsesInspectionAndTransitStages() {
        assertEquals(0, towingStepIndex("accepted"))
        assertEquals(2, towingStepIndex("verification"))
        assertEquals(3, towingStepIndex("inspection"))
        assertEquals(4, towingStepIndex("loaded"))
        assertEquals(5, towingStepIndex("transit"))
        assertEquals(6, towingStepIndex("unloading"))
        assertEquals(7, towingStepIndex("completed"))
    }

    @Test
    fun towingStatusCopyDoesNotReuseParcelVocabulary() {
        assertEquals("Petugas towing menuju kendaraan Anda", towingStatusText("assigned"))
        assertEquals("Sedang memeriksa kondisi kendaraan", towingStatusText("inspection"))
        assertEquals("Layanan towing selesai", towingStatusText("delivered"))
    }

    @Test
    fun terminalAndNoSupplyStatesAreExplicit() {
        assertEquals(true, isRoadsideTerminalStatus("cancelled"))
        assertEquals(true, isRoadsideTerminalStatus("FAILED"))
        assertEquals(true, isRoadsideNoSupplyStatus("no-courier-found"))
        assertEquals(false, isRoadsideNoSupplyStatus("arriving"))
        assertEquals("Teknisi belum tersedia. Kamu bisa coba lagi.", tambalBanStatusText("no_courier_found"))
        assertEquals("Petugas towing belum tersedia. Kamu bisa coba lagi.", towingStatusText("no_courier_found"))
    }
}
