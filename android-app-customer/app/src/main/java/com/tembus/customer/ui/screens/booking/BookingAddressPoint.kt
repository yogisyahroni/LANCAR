package com.tembus.customer.ui.screens.booking

import com.tembus.customer.ui.components.maps.LatLng

/** Resolved address used by booking; free text alone is never an order location. */
data class BookingAddressPoint(
    val id: String,
    val label: String,
    val address: String,
    val latitude: Double,
    val longitude: Double,
    val city: String? = null,
    val postalCode: String? = null,
    val receiverName: String? = null,
    val contactPhone: String? = null,
    val instruction: String? = null,
    val source: Source,
    val resolvedAtEpochMs: Long = System.currentTimeMillis()
) {
    enum class Source { SAVED, SEARCH, PINNED, MANUAL }

    fun asLatLng(): LatLng = LatLng(latitude, longitude)
}

internal fun LatLng.isUsableBookingCoordinate(): Boolean =
    latitude.isFinite() && longitude.isFinite() &&
        latitude in -90.0..90.0 && longitude in -180.0..180.0 &&
        !(latitude == 0.0 && longitude == 0.0)
