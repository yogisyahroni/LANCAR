package com.tembus.customer.ui.screens.booking

import com.tembus.customer.ui.components.maps.LatLng
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BookingAddressPointTest {
    @Test
    fun rejectsZeroNonFiniteAndOutOfRangeCoordinates() {
        assertTrue(LatLng(-6.2, 106.8).isUsableBookingCoordinate())
        assertFalse(LatLng(0.0, 0.0).isUsableBookingCoordinate())
        assertFalse(LatLng(Double.NaN, 106.8).isUsableBookingCoordinate())
        assertFalse(LatLng(91.0, 106.8).isUsableBookingCoordinate())
    }
}
