package com.tembus.customer.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.tembus.customer.data.model.NearbyCourier
import com.tembus.customer.ui.designsystem.logistics.TembusCarrierAvailability
import com.tembus.customer.ui.designsystem.logistics.TembusCarrierRateCard
import com.tembus.customer.ui.designsystem.logistics.TembusCarrierRateData

/**
 * Compatibility adapter for existing Tambal/Towing/Aggregator routes.
 * Rendering and state semantics live in the shared TEMBUS logistics family.
 */
@Composable
fun CourierPriceCard(
    courier: NearbyCourier,
    isSelected: Boolean,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TembusCarrierRateCard(
        data = courier.toTembusCarrierRateData(isSelected),
        onSelect = onSelect,
        modifier = modifier,
    )
}

fun NearbyCourier.toTembusCarrierRateData(selected: Boolean = false): TembusCarrierRateData {
    val availability = when (status) {
        "available" -> TembusCarrierAvailability.Available
        "conditional" -> TembusCarrierAvailability.Conditional
        else -> TembusCarrierAvailability.Unavailable
    }
    val vehicle = vehicleTypeCar?.takeIf { it.isNotBlank() } ?: vehicleType
    val capability = when {
        vehicle.isNotBlank() -> "Kapabilitas: $vehicle"
        serviceSubType.isNotBlank() -> "Kapabilitas: ${serviceSubType.replace('_', ' ')}"
        else -> "Kapabilitas sesuai permintaan"
    }
    return TembusCarrierRateData(
        id = courierId,
        providerName = courierName,
        serviceLabel = serviceSubType.replace('_', ' ').ifBlank { "Layanan TEMBUS" },
        priceLabel = "Rp ${formatRupiah(courierServicePrice)}",
        etaLabel = "ETA ${etaMinutes.coerceAtLeast(0)} menit",
        capabilityLabel = capability,
        distanceLabel = "Jarak ${formatOneDecimal(distanceKm)} km",
        ratingLabel = "Rating ${formatOneDecimal(rating)}",
        statusLabel = statusText.ifBlank { availability.defaultLabel() },
        availability = availability,
        selected = selected,
    )
}

private fun TembusCarrierAvailability.defaultLabel(): String = when (this) {
    TembusCarrierAvailability.Available -> "Siap melayani"
    TembusCarrierAvailability.Conditional -> "Bersyarat"
    TembusCarrierAvailability.Unavailable -> "Tidak tersedia"
}

private fun formatRupiah(amount: Long): String = amount.toString().reversed().chunked(3).joinToString(".").reversed()

private fun formatOneDecimal(value: Double): String = "%.1f".format(java.util.Locale.US, value)
