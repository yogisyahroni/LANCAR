package com.tembus.customer.ui.screens.detail

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OrderDetailPolicyTest {
    @Test
    fun sectionKindFollowsServerServiceAndFoodSnapshot() {
        assertEquals(OrderDetailSectionKind.FOOD, orderDetailSectionKind(true, "towing_mobil"))
        assertEquals(OrderDetailSectionKind.ROADSIDE, orderDetailSectionKind(false, " TAMBAL_BAN_MOTOR "))
        assertEquals(OrderDetailSectionKind.ROADSIDE, orderDetailSectionKind(false, "towing_mobil"))
        assertEquals(OrderDetailSectionKind.PACKAGE, orderDetailSectionKind(false, "tembus_instant"))
        assertEquals(OrderDetailSectionKind.PACKAGE, orderDetailSectionKind(false, null, "package_on_demand"))
        assertEquals(OrderDetailSectionKind.UNKNOWN, orderDetailSectionKind(false, null))
        assertEquals(OrderDetailSectionKind.UNKNOWN, orderDetailSectionKind(false, "future_service", "future_category"))
    }

    @Test
    fun actionsAreSafeForUnknownAndTerminalStates() {
        assertTrue(OrderActionPolicy.canTrack(" IN_TRANSIT "))
        assertTrue(OrderActionPolicy.canChat("accepted"))
        assertTrue(OrderActionPolicy.canCancel("pending_payment", "food_delivery"))
        assertFalse(OrderActionPolicy.canTrack("unknown_server_state"))
        assertFalse(OrderActionPolicy.canChat("delivered"))
        assertFalse(OrderActionPolicy.canCancel("cancelled", "towing_mobil"))
    }

    @Test
    fun statusLabelsNeverExposeRawUnknownStateAsSuccessful() {
        assertEquals("Terjadwal", OrderActionPolicy.statusLabel(" scheduled "))
        assertEquals("Selesai", OrderActionPolicy.statusLabel("completed"))
        assertEquals("Tidak berhasil", OrderActionPolicy.statusLabel("payment_failed"))
        assertEquals("Status sedang diperbarui", OrderActionPolicy.statusLabel("future_state"))
    }

    @Test
    fun tambalBanStatusLabelsDescribeHumanReadableRepairStages() {
        val service = "tambal_ban_motor"
        assertEquals("Teknisi Menuju Lokasi", OrderActionPolicy.statusLabel("accepted", service))
        assertEquals("Teknisi Tiba di Lokasi", OrderActionPolicy.statusLabel("pickup_arrived", service))
        assertEquals("Verifikasi & Inspeksi Ban", OrderActionPolicy.statusLabel("picking_up", service))
        assertEquals("Ban Sedang Diperbaiki", OrderActionPolicy.statusLabel("picked_up", service))
        assertEquals("Perbaikan Selesai · Menunggu Bukti Akhir", OrderActionPolicy.statusLabel("delivering", service))
        assertEquals("Layanan Selesai", OrderActionPolicy.statusLabel("delivered", service))
        assertEquals("Status layanan sedang diperbarui", OrderActionPolicy.statusLabel("future_state", service))
    }
}
