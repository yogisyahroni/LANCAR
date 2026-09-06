package com.tembus.customer.ui.screens.detail

import org.junit.Assert.assertEquals
import org.junit.Test

class OrderActionPolicyTest {
    @Test
    fun `tambal ban lifecycle renders human readable customer stages`() {
        val subtype = "tambal_ban_motor"
        val expected = linkedMapOf(
            "searching" to "Mencari Teknisi",
            "assigned" to "Mencari Teknisi",
            "accepted" to "Teknisi Menuju Lokasi",
            "pickup_arrived" to "Teknisi Tiba di Lokasi",
            "picking_up" to "Verifikasi & Inspeksi Ban",
            "picked_up" to "Ban Sedang Diperbaiki",
            "delivering" to "Perbaikan Selesai · Menunggu Bukti Akhir",
            "delivered" to "Layanan Selesai",
            "completed" to "Layanan Selesai",
        )

        expected.forEach { (status, label) ->
            assertEquals(label, OrderActionPolicy.statusLabel(status, subtype))
        }
    }

    @Test
    fun `unknown tambal ban state degrades safely`() {
        assertEquals(
            "Status layanan sedang diperbarui",
            OrderActionPolicy.statusLabel("provider_future_state", "tambal_ban_mobil"),
        )
    }
}
