package com.tembus.customer.ui.screens.service

internal data class TowingBookingTrustInput(
    val vehicleType: String,
    val vehicleMake: String,
    val vehicleModel: String,
    val vehicleCondition: String,
    val accessConstraints: String,
    val destinationAddress: String,
    val destinationLatitude: Double,
    val destinationLongitude: Double,
    val destinationContactName: String,
    val destinationContactPhone: String
)

/** Returns the user-facing validation message, or null when the trust facts are complete. */
internal fun validateTowingBookingTrust(input: TowingBookingTrustInput): String? {
    if (input.destinationLatitude == 0.0 || input.destinationLongitude == 0.0 || input.destinationAddress.isBlank()) {
        return "Pilih alamat tujuan towing sebelum membuat pesanan"
    }
    if (input.destinationContactName.trim().length < 2) {
        return "Nama bengkel atau penerima tujuan wajib diisi"
    }
    if (input.destinationContactPhone.filter(Char::isDigit).length !in 8..15) {
        return "Nomor kontak tujuan wajib berisi 8-15 digit"
    }
    if (input.vehicleType.isBlank() || input.vehicleMake.trim().length < 2 || input.vehicleModel.trim().length < 2 ||
        input.vehicleCondition.isBlank() || input.accessConstraints.trim().length < 3) {
        return "Lengkapi tipe, merek, model, kondisi, dan akses lokasi kendaraan"
    }
    return null
}
