package com.tembus.customer.ui.navigation

internal sealed class DashboardServiceDestination {
    data class ServiceBooking(val serviceSubType: String) : DashboardServiceDestination()
    object TambalBan : DashboardServiceDestination()
    object Towing : DashboardServiceDestination()
    object FoodHome : DashboardServiceDestination()
    object FoodFavorites : DashboardServiceDestination()
    object Aggregator : DashboardServiceDestination()
    data class GenericBooking(val serviceCode: String) : DashboardServiceDestination()
}

/**
 * Converts service-registry keys emitted by the dashboard into typed navigation
 * destinations. Keeping this mapping pure makes registry drift testable without
 * requiring a device or a live backend session.
 */
internal fun dashboardServiceDestination(open: String?): DashboardServiceDestination {
    val rawServiceCode = open.orEmpty().trim()
    val serviceCode = rawServiceCode.lowercase()
    return when (serviceCode) {
        "tambal_ban_motor", "tambal_ban_mobil", "towing_motor", "towing_mobil" ->
            DashboardServiceDestination.ServiceBooking(serviceCode)
        "tambal_ban" -> DashboardServiceDestination.TambalBan
        "towing" -> DashboardServiceDestination.Towing
        "food_delivery" -> DashboardServiceDestination.FoodHome
        "food_favorites" -> DashboardServiceDestination.FoodFavorites
        "aggregator" -> DashboardServiceDestination.Aggregator
        else -> DashboardServiceDestination.GenericBooking(rawServiceCode)
    }
}
