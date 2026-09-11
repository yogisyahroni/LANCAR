package com.tembus.customer.ui.designsystem.commerce

import com.tembus.customer.data.model.FoodMerchant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TembusCommerceModelTest {
    @Test
    fun `food mapper keeps authoritative facts and does not copy ad label`() {
        val merchant = FoodMerchant(
            id = "m-1",
            name = "Warung TEMBUS",
            address = "Jl. Merdeka",
            isOpen = false,
            distanceKm = 1.25,
            avgRating = 4.8,
            ratingCount = 120,
            halalStatus = "halal_certified",
            isSponsored = true,
            adLabel = "custom creative text",
        )

        val model = merchant.toTembusMerchantCardModel()

        assertEquals("Warung TEMBUS", model.name)
        assertEquals("1.3 km", model.distanceLabel)
        assertEquals(4.8, model.rating!!, 0.0)
        assertEquals(120, model.ratingCount)
        assertEquals(TembusHalalStatus.Certified, model.halalStatus)
        assertFalse(model.isOpen!!)
        assertNull(model.etaLabel)
        assertNull(model.deliveryFeeLabel)
        assertTrue(model.promoLabel == null)
    }
}
