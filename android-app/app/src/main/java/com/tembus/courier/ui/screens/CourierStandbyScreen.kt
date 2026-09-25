package com.tembus.courier.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tembus.courier.data.model.CourierCapabilityProfile
import com.tembus.courier.data.model.CourierHotspot
import com.tembus.courier.data.model.CourierPerformanceSummary
import com.tembus.courier.data.model.CourierServiceProduct
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.toRupiahCompact
import com.tembus.courier.ui.components.maps.LatLng
import com.tembus.courier.ui.components.maps.MapUiSettings
import com.tembus.courier.ui.components.maps.RuntimeMapMarker
import com.tembus.courier.ui.components.maps.RuntimeMapRenderer
import com.tembus.courier.ui.theme.Accent
import com.tembus.courier.ui.theme.AccentSoft
import com.tembus.courier.ui.theme.Background
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.PrimaryDark
import com.tembus.courier.ui.theme.PrimarySoft
import com.tembus.courier.ui.theme.Success
import com.tembus.courier.ui.theme.TembusComponentDefaults
import java.util.Locale

/** Full standby layout matching the courier Figma frame 13-1191. */
@Composable
internal fun CourierStandbyScreen(
    modifier: Modifier = Modifier,
    courierName: String,
    todayEarningsIdr: Int,
    capabilityProfile: CourierCapabilityProfile?,
    courierVehicleType: String,
    performanceSummary: CourierPerformanceSummary?,
    activeServices: List<CourierServiceProduct>,
    hotspots: List<CourierHotspot>,
    mapsProviderConfig: MapsProviderConfig,
    mapMarkers: List<RuntimeMapMarker>,
    routePoints: List<LatLng>,
    mapFocusLocation: LatLng?,
    isOnline: Boolean,
    onDutyToggle: (Boolean) -> Unit,
    onViewOrders: () -> Unit
) {
    val vehicle = capabilityProfile?.vehicle ?: capabilityProfile?.vehicles?.firstOrNull()
    val vehicleName = listOfNotNull(vehicle?.brand, vehicle?.model)
        .joinToString(" ")
        .ifBlank { courierVehicleType.ifBlank { "Kendaraan belum tersinkron" } }
    val vehicleLabel = listOfNotNull(
        vehicleName.takeIf { it.isNotBlank() },
        vehicle?.plateNumber?.takeIf { it.isNotBlank() }
    ).joinToString(" · ")
    val ratingLabel = performanceSummary?.avgRating
        ?.takeIf { it > 0.0 }
        ?.let { "★ ${"%.2f".format(Locale.US, it)}" }
        ?: "Rating belum tersedia"
    val incentive = performanceSummary?.incentives
        ?.firstOrNull { it.targetDeliveries > 0 && it.progressStatus.lowercase() != "earned" }
        ?: performanceSummary?.incentives?.firstOrNull { it.targetDeliveries > 0 }
    val completedCount = performanceSummary?.totalDeliveries

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        StandbyHeader(
            isOnline = isOnline,
            courierName = courierName,
            ratingLabel = ratingLabel,
            vehicleLabel = vehicleLabel,
            onDutyToggle = onDutyToggle
        )

        StandbyEarningsCard(
            todayEarningsIdr = todayEarningsIdr,
            completedCount = completedCount,
            incentive = incentive
        )

        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(292.dp),
            color = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(22.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.18f)),
            shadowElevation = 3.dp
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(22.dp))
            ) {
                RuntimeMapRenderer(
                    modifier = Modifier.fillMaxSize(),
                    providerConfig = mapsProviderConfig,
                    markers = mapMarkers,
                    routePoints = routePoints,
                    followLocation = mapFocusLocation,
                    forceFocus = false,
                    mapUiSettings = MapUiSettings(
                        zoomControlsEnabled = false,
                        myLocationButtonEnabled = false,
                        mapToolbarEnabled = false
                    ),
                    routeColor = Accent,
                    fallbackTitle = "Peta permintaan",
                    fallbackMessage = "Lokasi dan area permintaan muncul setelah data GPS tersinkron."
                )
                Surface(
                    modifier = Modifier.padding(12.dp),
                    color = Color.White.copy(alpha = 0.94f),
                    shape = RoundedCornerShape(999.dp),
                    border = BorderStroke(1.dp, Primary.copy(alpha = 0.12f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Surface(modifier = Modifier.size(8.dp), color = Success, shape = CircleShape) {}
                        Text(
                            if (mapFocusLocation != null) "GPS aktif" else "Menunggu GPS",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = PrimaryDark
                        )
                    }
                }
            }
        }

        CourierStandbyRadarCockpit(
            activeServices = activeServices,
            hotspots = hotspots,
            isOnline = isOnline,
            onDutyToggle = onDutyToggle,
            onViewOrders = onViewOrders
        )
    }
}

@Composable
private fun StandbyHeader(
    isOnline: Boolean,
    courierName: String,
    ratingLabel: String,
    vehicleLabel: String,
    onDutyToggle: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp)
    ) {
        Surface(
            color = if (isOnline) PrimarySoft else MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(999.dp),
            border = BorderStroke(1.dp, if (isOnline) Success.copy(alpha = 0.18f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.22f))
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                Surface(
                    modifier = Modifier.size(9.dp),
                    color = if (isOnline) Success else MaterialTheme.colorScheme.error,
                    shape = CircleShape
                ) {}
                Text(
                    if (isOnline) "ONLINE" else "OFFLINE",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Black,
                    color = PrimaryDark
                )
            }
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                "$ratingLabel · $vehicleLabel",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                courierName.ifBlank { "Mitra TEMBUS" },
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        IconButton(
            onClick = { onDutyToggle(!isOnline) },
            modifier = Modifier.size(42.dp)
        ) {
            Icon(
                Icons.Default.PowerSettingsNew,
                contentDescription = if (isOnline) "Nonaktifkan mode kerja" else "Aktifkan mode kerja",
                tint = if (isOnline) Accent else Primary
            )
        }
    }
}

@Composable
private fun StandbyEarningsCard(
    todayEarningsIdr: Int,
    completedCount: Int?,
    incentive: com.tembus.courier.data.model.CourierIncentive?
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(22.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.16f)),
        shadowElevation = 2.dp
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        "PENDAPATAN HARI INI",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Black,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        todayEarningsIdr.toRupiahCompact(),
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black,
                        color = PrimaryDark
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    completedCount?.let {
                        Surface(color = PrimarySoft, shape = RoundedCornerShape(999.dp)) {
                            Row(
                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Success, modifier = Modifier.size(15.dp))
                                Text("$it selesai", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = PrimaryDark)
                            }
                        }
                    }
                    incentive?.let {
                        Surface(color = AccentSoft, shape = RoundedCornerShape(999.dp)) {
                            Row(
                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(Icons.Default.Star, contentDescription = null, tint = Accent, modifier = Modifier.size(15.dp))
                                Text("Insentif aktif", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = Accent)
                            }
                        }
                    }
                }
            }

            if (incentive != null && incentive.targetDeliveries > 0) {
                val progress = (incentive.progressPercent.coerceIn(0, 100) / 100f)
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        "Target harian: ${((incentive.targetDeliveries - incentive.progressDeliveries).coerceAtLeast(0))} order lagi",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        "${incentive.progressDeliveries}/${incentive.targetDeliveries} Trip",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = PrimaryDark
                    )
                }
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth().height(7.dp),
                    color = Accent,
                    trackColor = PrimarySoft
                )
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Default.Star, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
                    Text(
                        "Target dan insentif mengikuti konfigurasi operasional.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
