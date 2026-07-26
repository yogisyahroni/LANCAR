package com.tembus.customer.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.TwoWheeler
import androidx.compose.material.icons.filled.Warning
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector

// ============================================================
// CUSTOM ICONS — Tambal Ban & Towing
// ============================================================

object ServiceIcons {
    // Tambal Ban icons
    val TambalBanMotor: ImageVector = Icons.Default.Build // Wrench icon for repair
    val TambalBanMobil: ImageVector = Icons.Default.Build
    
    // Towing icons
    val TowingMotor: ImageVector = Icons.Default.LocalShipping // Truck for towing
    val TowingMobil: ImageVector = Icons.Default.LocalShipping
    
    // Vehicle type icons
    val Motor: ImageVector = Icons.Default.TwoWheeler
    val Mobil: ImageVector = Icons.Default.DirectionsCar
    
    // Status icons
    val Available: ImageVector = Icons.Default.CheckCircle
    val InProgress: ImageVector = Icons.Default.Schedule
    val Busy: ImageVector = Icons.Default.Warning
}

@Composable
fun getServiceIcon(serviceCode: String): ImageVector {
    return when (serviceCode) {
        "tambal_ban_motor" -> ServiceIcons.TambalBanMotor
        "tambal_ban_mobil" -> ServiceIcons.TambalBanMobil
        "towing_motor" -> ServiceIcons.TowingMotor
        "towing_mobil" -> ServiceIcons.TowingMobil
        else -> ServiceIcons.Motor
    }
}
