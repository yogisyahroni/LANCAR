package com.tembus.customer.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.TwoWheeler
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import com.tembus.customer.ui.localization.CustomerText as Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.data.model.DeliveryServiceProduct

// ============================================================
// SERVICE GRID MENU — Gojek-style 3x2 Grid
// ============================================================

@Composable
fun ServiceGridMenu(
    services: List<DeliveryServiceProduct>,
    onServiceClick: (String) -> Unit,
    onHistoryClick: () -> Unit,
    onFavoritesClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp)
    ) {
        Text(
            "Layanan TEMBUS",
            fontSize = 22.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = (-0.5).sp,
            color = MaterialTheme.colorScheme.onSurface
        )
        Spacer(Modifier.height(16.dp))
        
        // Grid 3 columns
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // Row 1: two parcel products stay visually distinct. The
            // service API remains the source of truth; no missing product is
            // fabricated when a deployment has only one enabled tier.
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Filter services by category
                val parcelServices = services.filter { it.code !in setOf("tambal_ban_motor", "tambal_ban_mobil", "towing_motor", "towing_mobil", "food_delivery", "food") }
                val paketInstan = parcelServices.find { it.serviceCategory == "on_demand" || it.code == "p2p" }
                val ekspedisiAntarKota = parcelServices.find { it.serviceCategory == "regular" || it.code == "regular" }
                val tambalBanMotor = services.find { it.code == "tambal_ban_motor" }

                paketInstan?.let {
                    ServiceGridItem(
                        service = it,
                        title = "Paket Instan",
                        subtitle = "Cepat • ETA sesuai rute",
                        icon = Icons.Default.TwoWheeler,
                        color = MaterialTheme.colorScheme.primaryContainer,
                        onClick = { onServiceClick(it.code) },
                        modifier = Modifier.weight(1f)
                    )
                } ?: Spacer(Modifier.weight(1f))

                ekspedisiAntarKota?.let {
                    ServiceGridItem(
                        service = it,
                        title = "Ekspedisi Antar-Kota",
                        subtitle = "Hemat • ETA terjadwal",
                        icon = Icons.Default.LocalShipping,
                        color = Color(0xFFE8EAF6),
                        onClick = { onServiceClick(it.code) },
                        modifier = Modifier.weight(1f)
                    )
                } ?: Spacer(Modifier.weight(1f))

                tambalBanMotor?.let {
                    ServiceGridItem(
                        service = it,
                        icon = Icons.Default.TwoWheeler,
                        color = Color(0xFFE8F5E9), // Light green
                        onClick = { onServiceClick(it.code) },
                        modifier = Modifier.weight(1f)
                    )
                } ?: Spacer(Modifier.weight(1f))
            }
            
            // Row 2: Tambal Ban Mobil and towing products.
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                val tambalBanMobil = services.find { it.code == "tambal_ban_mobil" }
                val towingMotor = services.find { it.code == "towing_motor" }
                val towingMobil = services.find { it.code == "towing_mobil" }
                tambalBanMobil?.let {
                    ServiceGridItem(
                        service = it,
                        icon = Icons.Default.DirectionsCar,
                        color = Color(0xFFE3F2FD),
                        onClick = { onServiceClick(it.code) },
                        modifier = Modifier.weight(1f)
                    )
                } ?: Spacer(Modifier.weight(1f))

                towingMotor?.let {
                    ServiceGridItem(
                        service = it,
                        icon = Icons.Default.LocalShipping,
                        color = Color(0xFFFFF3E0), // Light orange
                        onClick = { onServiceClick(it.code) },
                        modifier = Modifier.weight(1f)
                    )
                } ?: Spacer(Modifier.weight(1f))
                
                towingMobil?.let {
                    ServiceGridItem(
                        service = it,
                        icon = Icons.Default.LocalShipping,
                        color = Color(0xFFFCE4EC), // Light pink
                        onClick = { onServiceClick(it.code) },
                        modifier = Modifier.weight(1f)
                    )
                } ?: Spacer(Modifier.weight(1f))
                
            }

            // Row 3: Food Delivery (FOOD-BIKE-030/030b), Favorit (C3)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                val foodDelivery = services.find { it.code == "food_delivery" || it.code == "food" }
                foodDelivery?.let {
                    ServiceGridItem(
                        service = it,
                        icon = Icons.Default.Restaurant,
                        color = Color(0xFFFFF8E1), // Light amber
                        onClick = { onServiceClick(it.code) },
                        modifier = Modifier.weight(1f)
                    )
                } ?: Spacer(Modifier.weight(1f))
                
                // Favorit (C3)
                ServiceGridItemFixed(
                    label = "Favorit",
                    icon = Icons.Default.Favorite,
                    color = Color(0xFFFCE4EC), // Light pink
                    onClick = onFavoritesClick,
                    modifier = Modifier.weight(1f)
                )
                
                ServiceGridItemFixed(
                    label = "Riwayat",
                    icon = Icons.Default.History,
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    onClick = onHistoryClick,
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun ServiceGridItem(
    service: DeliveryServiceProduct,
    title: String = service.name,
    subtitle: String? = null,
    icon: ImageVector,
    color: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .aspectRatio(1f) // Square
            .clickable { onClick() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = color),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.White.copy(alpha = 0.7f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    icon,
                    contentDescription = title,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(28.dp)
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                title,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
                maxLines = 2
            )
            subtitle?.let {
                Text(
                    it,
                    fontSize = 9.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    maxLines = 2
                )
            }
        }
    }
}

@Composable
private fun ServiceGridItemFixed(
    label: String,
    icon: ImageVector,
    color: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .aspectRatio(1f)
            .clickable { onClick() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = color),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.White.copy(alpha = 0.7f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    icon,
                    contentDescription = "",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(28.dp)
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                label,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )
        }
    }
}
