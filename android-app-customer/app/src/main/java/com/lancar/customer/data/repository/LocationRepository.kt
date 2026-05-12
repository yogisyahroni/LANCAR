package com.lancar.customer.data.repository

import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LocationRepository @Inject constructor() {
    fun updateLocation(latitude: Double, longitude: Double) {
        // TODO: Call API to update location
    }
}
