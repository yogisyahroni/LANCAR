package com.tembus.courier.util

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * NavigationHelper — External navigation hand-off for courier operations.
 *
 * TomTom/backend remain authoritative for the in-app route snapshot, ETA, and
 * pricing. This helper only hands the selected destination to an installed
 * navigation app after the courier explicitly asks to navigate.
 *
 * Usage:
 *   NavigationHelper.navigateTo(context, latitude, longitude, "Titik Jemput")
 */
object NavigationHelper {

    /**
     * Launch external turn-by-turn navigation to the given coordinates.
     *
     * Opens the external navigation fallback. TomTom remains the source of
     * route/ETA/price data in the app; this action intentionally does not call
     * another routing API.
     *
     * @param context Android context
     * @param lat Destination latitude
     * @param lng Destination longitude
     * @param label Human-readable label for the destination
     */
    fun navigateTo(context: Context, lat: Double, lng: Double, label: String) {
        if (lat == 0.0 && lng == 0.0) {
            return
        }

        // Route calculation remains server/TomTom-owned. This is only the
        // user-requested external navigation hand-off.
        navigateWithGoogleMaps(context, lat, lng, label)
    }

    /**
     * Opens Google Maps with turn-by-turn navigation to the destination.
     * Uses the universal geo: intent with navigation mode.
     */
    fun navigateWithGoogleMaps(context: Context, lat: Double, lng: Double, label: String) {
        val destinationLabel = label.trim().takeIf { it.isNotBlank() }?.let { Uri.encode(it) }.orEmpty()
        val query = if (destinationLabel.isBlank()) "$lat,$lng" else "$lat,$lng($destinationLabel)"
        val uri = Uri.parse("geo:0,0?q=$query")
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage("com.google.android.apps.maps")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        // If Google Maps is not installed, try Waze
        if (intent.resolveActivity(context.packageManager) == null) {
            val wazeUri = Uri.parse("https://waze.com/ul?ll=$lat,$lng&navigate=yes")
            val wazeIntent = Intent(Intent.ACTION_VIEW, wazeUri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (wazeIntent.resolveActivity(context.packageManager) != null) {
                context.startActivity(wazeIntent)
                return
            }

            // Last resort: open in browser maps
            val browserUri = Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving")
            val browserIntent = Intent(Intent.ACTION_VIEW, browserUri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(browserIntent)
            return
        }

        context.startActivity(intent)
    }
}
