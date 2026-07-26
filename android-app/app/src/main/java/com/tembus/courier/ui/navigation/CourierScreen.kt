package com.tembus.courier.ui.navigation

sealed class CourierScreen(val route: String) {
    object Main : CourierScreen("main")
    object TambalBanFlow : CourierScreen("tambal-ban-flow/{orderId}") {
        fun createRoute(orderId: String): String {
            return "tambal-ban-flow/$orderId"
        }
    }
    object TowingFlow : CourierScreen("towing-flow/{orderId}") {
        fun createRoute(orderId: String): String {
            return "towing-flow/$orderId"
        }
    }
    object InspectTire : CourierScreen("inspect-tire")
    object InspectVehicle : CourierScreen("inspect-vehicle")
    object Completion : CourierScreen("completion/{serviceType}") {
        fun createRoute(serviceType: String): String {
            return "completion/$serviceType"
        }
    }
}
