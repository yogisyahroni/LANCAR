package com.tembus.courier.ui.screens.sos

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.*
import com.tembus.courier.ui.localization.CourierText as Text
import com.tembus.courier.ui.localization.CourierTextCatalog
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun EmergencyNavigationScreen(
    victimName: String,
    victimLat: Double? = null,
    victimLng: Double? = null,
    distanceMeters: Int,
    onCallVictim: () -> Unit,
    onArrived: () -> Unit
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val isArrived = distanceMeters <= 50
    val hasVictimLocation = victimLat != null && victimLng != null

    Column(
        modifier = Modifier.fillMaxSize()
    ) {
        // Navigation Button Area
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(16.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    Icons.Default.Map,
                    contentDescription = CourierTextCatalog.translate("Map"),
                    modifier = Modifier.size(64.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
                Spacer(Modifier.height(16.dp))
                Button(onClick = {
                    val lat = victimLat
                    val lng = victimLng
                    if (lat != null && lng != null) {
                        val uri = android.net.Uri.parse("geo:0,0?q=$lat,$lng(Lokasi+Darurat)")
                        val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, uri)
                        if (intent.resolveActivity(context.packageManager) != null) {
                            context.startActivity(intent)
                        } else {
                            val fallbackUri = android.net.Uri.parse("https://www.openstreetmap.org/?mlat=$lat&mlon=$lng#map=18/$lat/$lng")
                            val fallbackIntent = android.content.Intent(android.content.Intent.ACTION_VIEW, fallbackUri)
                            context.startActivity(fallbackIntent)
                        }
                    }
                }, enabled = hasVictimLocation) {
                    Text("Buka Navigasi Peta")
                }
                if (!hasVictimLocation) {
                    Text("Koordinat lokasi darurat belum tersedia dari server.", style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        // Bottom Info Panel
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = MaterialTheme.shapes.large,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "Menuju Lokasi: $victimName",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                
                Text(
                    text = "Jarak Tersisa: $distanceMeters meter",
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (isArrived) Color(0xFF4CAF50) else MaterialTheme.colorScheme.onSurfaceVariant
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    OutlinedButton(
                        onClick = onCallVictim,
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Default.Call, contentDescription = CourierTextCatalog.translate("Telepon"))
                        Spacer(Modifier.width(8.dp))
                        Text("Telepon")
                    }

                    Button(
                        onClick = onArrived,
                        modifier = Modifier.weight(1f),
                        enabled = isArrived, // Only enabled if within 50 meters
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF4CAF50)
                        )
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = CourierTextCatalog.translate("Tiba"))
                        Spacer(Modifier.width(8.dp))
                        Text("Saya Tiba")
                    }
                }

                if (!isArrived) {
                    Text(
                        text = "Tombol 'Saya Tiba' akan aktif saat Anda berada dalam radius 50 meter dari korban.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
        }
    }
}
