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
}
