package com.tembus.customer.ui.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DashboardServiceNavigationTest {
    @Test
    fun recommendedDashboardServicesResolveToTypedDestinations() {
        assertTrue(dashboardServiceDestination("paket_instant") is DashboardServiceDestination.GenericBooking)
        assertTrue(dashboardServiceDestination("food_delivery") === DashboardServiceDestination.FoodHome)
        assertTrue(dashboardServiceDestination("tambal_ban") === DashboardServiceDestination.TambalBan)
        assertTrue(dashboardServiceDestination("towing") === DashboardServiceDestination.Towing)
        assertTrue(dashboardServiceDestination("aggregator") === DashboardServiceDestination.Aggregator)
    }

    @Test
    fun emergencyAndProviderVariantsPreserveTheRegisteredSubtype() {
        assertEquals(
            DashboardServiceDestination.ServiceBooking("tambal_ban_motor"),
            dashboardServiceDestination(" TAMBAL_BAN_MOTOR "),
        )
        assertEquals(
            DashboardServiceDestination.ServiceBooking("towing_mobil"),
            dashboardServiceDestination("towing_mobil"),
        )
    }

    @Test
    fun unknownRegistryKeyRemainsARealGenericBookingKey() {
        assertEquals(
            DashboardServiceDestination.GenericBooking("partner_service"),
            dashboardServiceDestination(" partner_service "),
        )
    }
}
