package com.tembus.customer.ui.screens.service

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TowingBookingTrustPolicyTest {
    private fun validInput() = TowingBookingTrustInput(
        vehicleType = "mobil",
        vehicleMake = "Toyota",
        vehicleModel = "Avanza",
        vehicleCondition = "Tidak bisa jalan",
        accessConstraints = "Akses parkir lebar",
        destinationAddress = "Bengkel tujuan, Jakarta",
        destinationLatitude = -6.2,
        destinationLongitude = 106.8,
        destinationContactName = "Bengkel Jaya",
        destinationContactPhone = "081234567890"
    )

    @Test
    fun destinationIsRequiredBeforeOrderCreation() {
        assertEquals(
            "Pilih alamat tujuan towing sebelum membuat pesanan",
            validateTowingBookingTrust(validInput().copy(destinationAddress = ""))
        )
    }

    @Test
    fun destinationContactMustBeUsable() {
        assertEquals(
            "Nama bengkel atau penerima tujuan wajib diisi",
            validateTowingBookingTrust(validInput().copy(destinationContactName = "A"))
        )
        assertEquals(
            "Nomor kontak tujuan wajib berisi 8-15 digit",
            validateTowingBookingTrust(validInput().copy(destinationContactPhone = "123"))
        )
    }

    @Test
    fun vehicleFactsAndAccessConstraintsAreRequired() {
        assertEquals(
            "Lengkapi tipe, merek, model, kondisi, dan akses lokasi kendaraan",
            validateTowingBookingTrust(validInput().copy(vehicleModel = ""))
        )
    }

    @Test
    fun completeFactsAreAccepted() {
        assertNull(validateTowingBookingTrust(validInput()))
    }
}
