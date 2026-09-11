package com.tembus.customer.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.TwoWheeler
import androidx.compose.material.icons.filled.Warning
import androidx.compose.ui.graphics.vector.ImageVector

// ============================================================
// TEMBUS SERVICE ICONS — shared service vocabulary for Home and App Experience
// ============================================================

data class TembusServiceIconSpec(
    val icon: ImageVector,
    val label: String,
)

object TembusServiceIcons {
    // Package services
    val PaketInstan = TembusServiceIconSpec(Icons.Default.LocalShipping, "Paket Instan")
    val EkspedisiAntarKota = TembusServiceIconSpec(Icons.Default.LocalShipping, "Ekspedisi Antar Kota")
    val Food = TembusServiceIconSpec(Icons.Default.Restaurant, "Food")

    // Tambal Ban icons
    val TambalBanMotor = TembusServiceIconSpec(Icons.Default.Build, "Tambal Ban Motor")
    val TambalBanMobil = TembusServiceIconSpec(Icons.Default.Build, "Tambal Ban Mobil")
    val TambalBan = TembusServiceIconSpec(Icons.Default.Build, "Tambal Ban")
    
    // Towing icons
    val TowingMotor = TembusServiceIconSpec(Icons.Default.DirectionsCar, "Towing Motor")
    val TowingMobil = TembusServiceIconSpec(Icons.Default.DirectionsCar, "Towing Mobil")
    val Towing = TembusServiceIconSpec(Icons.Default.DirectionsCar, "Towing")
    
    // Vehicle type icons
    val Motor: ImageVector = Icons.Default.TwoWheeler
    val Mobil: ImageVector = Icons.Default.DirectionsCar
    
    // Status icons
    val Available: ImageVector = Icons.Default.CheckCircle
    val InProgress: ImageVector = Icons.Default.Schedule
    val Busy: ImageVector = Icons.Default.Warning
    val Unknown = TembusServiceIconSpec(Icons.Default.Info, "Layanan TEMBUS")
}

fun getTembusServiceIconSpec(serviceCode: String?): TembusServiceIconSpec {
    return when (serviceCode?.trim()?.lowercase()) {
        "tambal_ban_motor" -> TembusServiceIcons.TambalBanMotor
        "tambal_ban_mobil" -> TembusServiceIcons.TambalBanMobil
        "towing_motor" -> TembusServiceIcons.TowingMotor
        "towing_mobil" -> TembusServiceIcons.TowingMobil
        "food_delivery", "food" -> TembusServiceIcons.Food
        "regular", "ekspedisi_antar_kota" -> TembusServiceIcons.EkspedisiAntarKota
        "on_demand", "p2p", "paket_instan", "delivery" -> TembusServiceIcons.PaketInstan
        else -> TembusServiceIcons.Unknown
    }
}

fun getTembusServiceIcon(serviceCode: String): ImageVector =
    getTembusServiceIconSpec(serviceCode).icon

fun getTembusServiceLabel(serviceCode: String?): String =
    getTembusServiceIconSpec(serviceCode).label
