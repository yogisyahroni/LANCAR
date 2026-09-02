package com.tembus.customer.ui.navigation

internal sealed class CustomerDeepLinkTarget {
    data class OrderDetail(val orderId: String) : CustomerDeepLinkTarget()
    data class Tracking(val orderId: String) : CustomerDeepLinkTarget()
    data class Chat(val orderId: String) : CustomerDeepLinkTarget()
    data class Booking(val promo: String?) : CustomerDeepLinkTarget()
}

/** Resolves both `tembus://orders/{id}` and the legacy `tembus:///orders/{id}` shape. */
internal fun resolveCustomerDeepLink(
    scheme: String?,
    host: String?,
    pathSegments: List<String>,
    promo: String? = null,
): CustomerDeepLinkTarget? {
    if (scheme != "tembus") return null

    val normalizedHost = host.orEmpty().lowercase()
    val segments = if (normalizedHost == "orders") {
        pathSegments
    } else if (pathSegments.firstOrNull()?.lowercase() == "orders") {
        pathSegments.drop(1)
    } else {
        pathSegments
    }

    return when {
        normalizedHost == "booking" && pathSegments.isEmpty() -> CustomerDeepLinkTarget.Booking(promo)
        normalizedHost == "orders" && segments.size == 1 && segments[0].isNotBlank() ->
            CustomerDeepLinkTarget.OrderDetail(segments[0])
        normalizedHost == "orders" && segments.size == 2 && segments[0].isNotBlank() -> when (segments[1].lowercase()) {
            "chat" -> CustomerDeepLinkTarget.Chat(segments[0])
            "tracking" -> CustomerDeepLinkTarget.Tracking(segments[0])
            else -> null
        }
        normalizedHost.isBlank() && segments.size == 1 && segments[0].isNotBlank() ->
            CustomerDeepLinkTarget.OrderDetail(segments[0])
        normalizedHost.isBlank() && segments.size == 2 && segments[0].isNotBlank() -> when (segments[1].lowercase()) {
            "chat" -> CustomerDeepLinkTarget.Chat(segments[0])
            "tracking" -> CustomerDeepLinkTarget.Tracking(segments[0])
            else -> null
        }
        else -> null
    }
}
