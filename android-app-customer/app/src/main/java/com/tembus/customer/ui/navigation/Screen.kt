package com.tembus.customer.ui.navigation

sealed class Screen(val route: String) {
    object Onboarding : Screen("onboarding")
    object AuthGraph : Screen("auth_graph")
    object Dashboard : Screen("dashboard")
    object Booking : Screen("booking?open={open}&promo={promo}") {
        fun createRoute(open: String? = null, promoCode: String? = null): String {
            val query = mutableListOf<String>()
            if (!open.isNullOrBlank()) {
                query += "open=${java.net.URLEncoder.encode(open, "UTF-8")}"
            }
            if (!promoCode.isNullOrBlank()) {
                query += "promo=${java.net.URLEncoder.encode(promoCode, "UTF-8")}"
            }
            return if (query.isEmpty()) "booking" else "booking?${query.joinToString("&")}"
        }
    }
    object History : Screen("history")
    object Business : Screen("business")
    object Profile : Screen("profile")
    object Notifications : Screen("notifications")
    
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
    object Chat : Screen("chat/{orderId}?name={name}") {
        fun createRoute(orderId: String, name: String?): String {
            val encName = if (name != null) java.net.URLEncoder.encode(name, "UTF-8") else ""
            return "chat/$orderId?name=$encName"
        }
    }
    object InAppCall : Screen("call/{orderId}?name={name}&state={state}&callId={callId}") {
        fun createRoute(orderId: String, name: String?, state: String = "outgoing", callId: String? = null): String {
            val encName = if (name != null) java.net.URLEncoder.encode(name, "UTF-8") else ""
            val encState = java.net.URLEncoder.encode(state, "UTF-8")
            val encCallId = if (callId != null) java.net.URLEncoder.encode(callId, "UTF-8") else ""
            return "call/$orderId?name=$encName&state=$encState&callId=$encCallId"
        }
    }
    
    // Tambal Ban & Towing
    object NearbyCouriers : Screen("nearby-couriers/{serviceSubType}/{lat}/{lng}") {
        fun createRoute(serviceSubType: String, lat: Double, lng: Double): String {
            return "nearby-couriers/$serviceSubType/$lat/$lng"
        }
    }
    object ServiceTracking : Screen("service-tracking/{orderId}/{serviceSubType}") {
        fun createRoute(orderId: String, serviceSubType: String): String {
            return "service-tracking/$orderId/$serviceSubType"
        }
    }
    object ServiceReport : Screen("service-report/{orderId}/{serviceSubType}") {
        fun createRoute(orderId: String, serviceSubType: String): String {
            return "service-report/$orderId/$serviceSubType"
        }
    }

    // Tambal Ban & Towing — Category Selection
    object ServiceCategory : Screen("service-category")
    object SubTypeSelector : Screen("sub-type-selector/{category}") {
        fun createRoute(category: String): String {
            return "sub-type-selector/"
        }
    }

    // Tambal Ban & Towing — Booking
    object ServiceBooking : Screen("service-booking/{serviceSubType}") {
        fun createRoute(serviceSubType: String): String {
            return "service-booking/"
        }
    }
}


