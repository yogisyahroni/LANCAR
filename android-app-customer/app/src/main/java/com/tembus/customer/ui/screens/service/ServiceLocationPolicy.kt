package com.tembus.customer.ui.screens.service

/**
 * Roadside search must never query the backend with the neutral 0,0 value.
 * Route arguments can be absent on a restored/deep-linked screen, so keep the
 * validation at the screen boundary as well as in the repository contract.
 */
internal fun hasUsableServiceLocation(latitude: Double, longitude: Double): Boolean =
    latitude in -90.0..90.0 &&
        longitude in -180.0..180.0 &&
        latitude != 0.0 &&
        longitude != 0.0
