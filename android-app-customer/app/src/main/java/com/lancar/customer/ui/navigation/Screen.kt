package com.lancar.customer.ui.navigation

sealed class Screen(val route: String) {
    object AuthGraph : Screen("auth_graph")
    object Dashboard : Screen("dashboard")
    object Booking : Screen("booking")
    object History : Screen("history")
    object Profile : Screen("profile")
    
    // Details
    object Tracking : Screen("tracking/{orderId}") {
        fun createRoute(orderId: String) = "tracking/$orderId"
    }
    object OrderDetail : Screen("detail/{orderId}") {
        fun createRoute(orderId: String) = "detail/$orderId"
    }
    object Payment : Screen("payment/{orderId}") {
        fun createRoute(orderId: String) = "payment/$orderId"
    }
    object Chat : Screen("chat/{orderId}?name={name}&phone={phone}") {
        fun createRoute(orderId: String, name: String?, phone: String?): String {
            val encName = if (name != null) java.net.URLEncoder.encode(name, "UTF-8") else ""
            val encPhone = if (phone != null) java.net.URLEncoder.encode(phone, "UTF-8") else ""
            return "chat/$orderId?name=$encName&phone=$encPhone"
        }
    }
}
