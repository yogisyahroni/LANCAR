package com.tembus.customer.ui.screens.service

import com.tembus.customer.ui.navigation.Screen
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ServiceRouteContractTest {
    @Test
    fun serviceTrackingRouteCarriesOrderAndCanonicalServiceSubtype() {
        assertEquals(
            "service-tracking/order-123/tambal_ban_motor",
            Screen.ServiceTracking.createRoute("order-123", "tambal_ban_motor")
        )
    }

    @Test
    fun rootNavGraphRegistersServiceTrackingDestination() {
        val source = File(
            "app/src/main/java/com/tembus/customer/ui/navigation/RootNavGraph.kt"
        ).readText()

        assertTrue(source.contains("route = Screen.ServiceTracking.route"))
        assertTrue(source.contains("navArgument(\"orderId\")"))
        assertTrue(source.contains("navArgument(\"serviceSubType\")"))
        assertTrue(source.contains("ServiceTrackingScreen("))
    }
}
