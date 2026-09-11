package com.tembus.customer.ui.components

import org.junit.Assert.assertEquals
import org.junit.Test

class ServiceIconsTest {
    @Test
    fun primaryServiceCodesResolveToCanonicalLabels() {
        assertEquals("Paket Instan", getTembusServiceLabel("on_demand"))
        assertEquals("Ekspedisi Antar Kota", getTembusServiceLabel("regular"))
        assertEquals("Food", getTembusServiceLabel("food_delivery"))
        assertEquals("Tambal Ban Mobil", getTembusServiceLabel("tambal_ban_mobil"))
        assertEquals("Towing Motor", getTembusServiceLabel("towing_motor"))
        assertEquals("Layanan TEMBUS", getTembusServiceLabel("unknown_service"))
    }

    @Test
    fun homeServiceSpecsUseTheSameCanonicalLabels() {
        assertEquals("Paket Instan", TembusServiceIcons.PaketInstan.label)
        assertEquals("Food", TembusServiceIcons.Food.label)
        assertEquals("Ekspedisi Antar Kota", TembusServiceIcons.EkspedisiAntarKota.label)
        assertEquals("Tambal Ban", TembusServiceIcons.TambalBan.label)
        assertEquals("Towing", TembusServiceIcons.Towing.label)
    }
}
