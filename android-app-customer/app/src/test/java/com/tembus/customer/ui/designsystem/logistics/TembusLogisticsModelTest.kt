package com.tembus.customer.ui.designsystem.logistics

import com.tembus.customer.data.model.NearbyCourier
import com.tembus.customer.ui.components.toTembusCarrierRateData
import org.junit.Assert.assertEquals
import org.junit.Test

class TembusLogisticsModelTest {
    @Test
    fun `carrier adapter preserves provider truth and maps availability`() {
        val courier = NearbyCourier(
            courierId = "courier-1",
            courierName = "Teknisi TEMBUS",
            rating = 4.7,
            distanceKm = 2.4,
            courierServicePrice = 75000,
            etaMinutes = 18,
            vehicleType = "Motor",
            serviceSubType = "towing_motor",
            status = "conditional",
            statusText = "Dalam perjalanan",
        )

        val model = courier.toTembusCarrierRateData()

        assertEquals("Teknisi TEMBUS", model.providerName)
        assertEquals("Rp 75.000", model.priceLabel)
        assertEquals("ETA 18 menit", model.etaLabel)
        assertEquals("Kapabilitas: Motor", model.capabilityLabel)
        assertEquals(TembusCarrierAvailability.Conditional, model.availability)
        assertEquals("Dalam perjalanan", model.statusLabel)
    }
}
