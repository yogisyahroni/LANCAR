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
        val source = customerSource(
            "app/src/main/java/com/tembus/customer/ui/navigation/RootNavGraph.kt"
        ).readText()

        assertTrue(source.contains("route = Screen.ServiceTracking.route"))
        assertTrue(source.contains("navArgument(\"orderId\")"))
        assertTrue(source.contains("navArgument(\"serviceSubType\")"))
        assertTrue(source.contains("ServiceTrackingScreen("))
    }

    @Test
    fun dashboardReopensActiveRoadsideOrderWithDedicatedTrackingRoute() {
        val dashboardSource = customerSource(
            "app/src/main/java/com/tembus/customer/ui/screens/main/DashboardScreen.kt"
        ).readText()
        val navSource = customerSource(
            "app/src/main/java/com/tembus/customer/ui/navigation/RootNavGraph.kt"
        ).readText()

        assertTrue(dashboardSource.contains("viewModel.activeOrders.collectAsState()"))
        assertTrue(dashboardSource.contains("ActiveRoadsideOrdersSection("))
        assertTrue(dashboardSource.contains("onRoadsideTrackingClick(order.orderId, serviceSubType)"))
        assertTrue(navSource.contains("onRoadsideTrackingClick = { orderId, serviceSubType ->"))
        assertTrue(navSource.contains("Screen.ServiceTracking.createRoute(orderId, serviceSubType)"))
    }

    private fun customerSource(relativePath: String): File {
        val userDir = File(System.getProperty("user.dir"))
        val candidates = listOf(
            File(relativePath),
            File(userDir, relativePath),
            File(userDir, "../$relativePath"),
            File(userDir, "../../android-app-customer/$relativePath"),
            File(userDir, "android-app-customer/$relativePath")
        ).map { it.canonicalFile }

        return candidates.firstOrNull(File::isFile)
            ?: error(
                "Unable to resolve customer source '$relativePath' from user.dir=${userDir.canonicalPath}. " +
                    "Checked: ${candidates.joinToString { it.path }}"
            )
    }
}
