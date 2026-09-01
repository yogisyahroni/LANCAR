package com.tembus.courier.ui.screens

import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import coil.request.ImageRequest
import android.Manifest
import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.compose.ui.draw.clip
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import com.tembus.courier.ui.localization.CourierText as Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.Priority
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.CancellationTokenSource
import com.tembus.courier.ui.components.maps.CameraPosition
import com.tembus.courier.ui.components.maps.LatLng
import com.tembus.courier.ui.components.maps.RuntimeMap
import com.tembus.courier.ui.components.maps.MapUiSettings
import com.tembus.courier.ui.components.maps.MapMarker
import com.tembus.courier.ui.components.maps.MarkerState
import com.tembus.courier.ui.components.maps.MapPolyline
import com.tembus.courier.ui.components.maps.rememberCameraPositionState
import com.tembus.courier.ui.components.BatteryOptimizationCard
import com.tembus.courier.data.model.CourierServiceProduct
import com.tembus.courier.data.model.CourierHotspot
import com.tembus.courier.data.model.CourierCapabilityProfile
import com.tembus.courier.data.model.CourierServiceCapability
import com.tembus.courier.data.model.CourierEarningsLedger
import com.tembus.courier.data.model.CourierEarningsTransaction
import com.tembus.courier.data.model.CourierPerformanceSummary
import com.tembus.courier.data.model.CourierPayoutRequestItem
import com.tembus.courier.data.model.CourierPayoutSummaryData
import com.tembus.courier.data.model.CourierActiveRoutePlan
import com.tembus.courier.data.model.CourierRoutePreview
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.cleanPayoutIdr
import com.tembus.courier.data.model.displayServiceName
import com.tembus.courier.data.model.estimatedNetEarningsIdr
import com.tembus.courier.data.model.isMaintenanceService
import com.tembus.courier.data.model.normalizedWorkflowRole
import com.tembus.courier.data.model.toRupiahCompact
import com.tembus.courier.domain.CourierProofTypes
import com.tembus.courier.domain.CourierRouteReducer
import com.tembus.courier.domain.CourierRouteScreen
import com.tembus.courier.domain.CourierRouteState
import com.tembus.courier.data.security.LocalDeviceSecurityManager
import com.tembus.courier.data.session.AuthSessionManager
import com.tembus.courier.service.LocationTrackerService
import com.tembus.courier.ui.components.maps.RuntimeMapMarker
import com.tembus.courier.ui.components.maps.RuntimeMapRenderer
import com.tembus.courier.ui.screens.call.CallEventsViewModel
import com.tembus.courier.ui.screens.call.InAppCallScreen
import com.tembus.courier.ui.screens.call.InAppCallState
import com.tembus.courier.ui.screens.order.OrderDetailScreen
import com.tembus.courier.ui.screens.order.OrderScreen
import com.tembus.courier.ui.screens.order.OrderViewModel
import com.tembus.courier.ui.screens.notification.InboxScreen
import com.tembus.courier.ui.screens.service.ServiceUpgradeScreen
import com.tembus.courier.ui.screens.service.TambalBanFlowScreen
import com.tembus.courier.ui.screens.service.TowingFlowScreen
import com.tembus.courier.ui.screens.service.CompletionScreen
import com.tembus.courier.ui.screens.pod.ProofOfDeliveryScreen
import com.tembus.courier.ui.screens.profile.resolvePayoutActionState
import com.tembus.courier.ui.screens.scan.ScanScreen
import com.tembus.courier.ui.screens.chat.ChatScreen
import com.tembus.courier.ui.screens.face.FaceVerificationScreen
import com.tembus.courier.ui.security.LocalSecurityChallengeDialog
import com.tembus.courier.ui.security.LocalSecuritySettingsPanel
import com.tembus.courier.ui.security.SecureScreenEffect
import com.tembus.courier.ui.components.BidirectionalSwipeSlider
import com.tembus.courier.ui.theme.Accent
import com.tembus.courier.ui.theme.AccentDark
import com.tembus.courier.ui.theme.AccentLight
import com.tembus.courier.ui.theme.Background
import com.tembus.courier.ui.theme.CourierMapBase
import com.tembus.courier.ui.theme.CourierPanel
import com.tembus.courier.ui.theme.Outline
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.PrimaryDark
import com.tembus.courier.ui.theme.PrimaryLight
import com.tembus.courier.ui.theme.Secondary
import com.tembus.courier.ui.theme.SecondaryLight
import com.tembus.courier.ui.theme.Success
import com.tembus.courier.ui.theme.Info
import com.tembus.courier.ui.theme.Warning
import com.tembus.courier.util.OrderSyncSignalBus
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import kotlin.math.min

// Extracted from MainScreen.kt (Faza 2 refactor 2026-08)

@Composable
internal fun OnDemandHomeHub(
    courierName: String,
    totalOrders: Int,
    pendingCount: Int,
    deliveredCount: Int,
    todayEarningsIdr: Int,
    orders: List<Order>,
    offers: List<Order>,
    services: List<CourierServiceProduct>,
    hotspots: List<CourierHotspot>,
    mapsProviderConfig: MapsProviderConfig = MapsProviderConfig(),
    isOnline: Boolean,
    onOnlineToggle: (Boolean) -> Unit,
    onOpenDelivery: (Order) -> Unit,
    onViewOrders: () -> Unit
) {
    val activeOrder = orders.firstOrNull { it.status.lowercase() in setOf("accepted", "picked_up", "in_transit") }
    val fallbackCenter = LatLng(0.0, 0.0)
    val pickup = activeOrder?.let { order ->
        val lat = order.pickupLatitude
        val lng = order.pickupLongitude
        if (lat != null && lng != null) LatLng(lat, lng) else null
    } ?: fallbackCenter
    val dropoff = activeOrder?.let { order ->
        val lat = order.dropLatitude
        val lng = order.dropLongitude
        if (lat != null && lng != null) LatLng(lat, lng) else null
    }
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(pickup, if (activeOrder == null) 12.5f else 12f)
    }

    LaunchedEffect(pickup, dropoff) {
        val center = if (dropoff != null) {
            LatLng((pickup.latitude + dropoff.latitude) / 2, (pickup.longitude + dropoff.longitude) / 2)
        } else pickup
        cameraPositionState.position = CameraPosition.fromLatLngZoom(center, if (dropoff != null) 12f else 12.5f)
    }

    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(318.dp)
        ) {
            Surface(
                modifier = Modifier.fillMaxSize(),
                color = SageBase,
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 28.dp, bottomStart = 28.dp, bottomEnd = 16.dp),
                border = BorderStroke(1.dp, Outline.copy(alpha = 0.24f))
            ) {
                RuntimeMapRenderer(
                    modifier = Modifier.fillMaxSize(),
                    providerConfig = mapsProviderConfig,
                    markers = buildList {
                        add(RuntimeMapMarker("pickup", pickup, activeOrder?.pickupAddress ?: "Zona pickup aktif"))
                        dropoff?.let { add(RuntimeMapMarker("dropoff", it, "Tujuan")) }
                        hotspots.take(6).forEach { hotspot ->
                            val lat = hotspot.latitude
                            val lng = hotspot.longitude
                            if (lat != null && lng != null) {
                                add(RuntimeMapMarker("hotspot-${hotspot.code ?: hotspot.name}", LatLng(lat, lng), hotspot.name, "${hotspot.pendingOrders} pickup menunggu"))
                            }
                        }
                    },
                    routePoints = emptyList(),
                    followLocation = pickup,
                    mapUiSettings = MapUiSettings(
                        zoomControlsEnabled = false,
                        myLocationButtonEnabled = false,
                        mapToolbarEnabled = false
                    ),
                    routeColor = LogisticsOrange,
                    fallbackTitle = "Area permintaan",
                    fallbackMessage = "Hotspot dan rute mengikuti data operasional terbaru."
                )
            }

            Surface(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(12.dp),
                color = Color.White.copy(alpha = 0.92f),
                shape = RoundedCornerShape(topStart = 8.dp, topEnd = 20.dp, bottomStart = 20.dp, bottomEnd = 8.dp),
                border = BorderStroke(1.dp, Outline.copy(alpha = 0.28f))
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Default.Bolt, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.size(18.dp))
                    Text(
                        text = if (isOnline) "Mencari pekerjaan" else "Off Duty",
                        fontWeight = FontWeight.Black,
                        color = DeepForest
                    )
                }
            }

            Surface(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(12.dp),
                color = if (isOnline) LogisticsOrange else Color.White,
                shape = RoundedCornerShape(48.dp),
                border = BorderStroke(1.dp, Outline.copy(alpha = 0.28f))
            ) {
                Row(
                    modifier = Modifier.padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Surface(
                        modifier = Modifier.size(56.dp),
                        color = if (isOnline) DeepForest else Color(0xFFE0E3E0),
                        shape = RoundedCornerShape(50),
                        border = BorderStroke(1.dp, Outline.copy(alpha = 0.28f))
                    ) {
                        Icon(
                            if (isOnline) Icons.Default.RadioButtonChecked else Icons.Default.RadioButtonUnchecked,
                            contentDescription = null,
                            tint = if (isOnline) LogisticsOrange else Color.Gray,
                            modifier = Modifier.padding(14.dp)
                        )
                    }
                    Column {
                        Text(if (isOnline) "On Duty" else "Off Duty", fontWeight = FontWeight.Black, color = if (isOnline) PrimaryDark else DeepForest)
                        Text("Aktifkan untuk bekerja", style = MaterialTheme.typography.labelMedium, color = if (isOnline) PrimaryDark.copy(alpha = 0.66f) else Color.Gray)
                    }
                    Switch(
                        checked = isOnline,
                        onCheckedChange = onOnlineToggle,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = DeepForest,
                            uncheckedThumbColor = Color.White,
                            uncheckedTrackColor = Color.Gray.copy(alpha = 0.36f)
                        )
                    )
                }
            }
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = Color(0xFFFFF3E8),
            shape = RoundedCornerShape(topStart = 16.dp, topEnd = 26.dp, bottomStart = 26.dp, bottomEnd = 16.dp),
            border = BorderStroke(1.dp, Accent.copy(alpha = 0.28f))
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Halo, $courierName", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black, color = DeepForest)
                        Text(
                            text = "Pendapatan bersih hari ini",
                            style = MaterialTheme.typography.bodyMedium,
                            color = DeepForest.copy(alpha = 0.68f)
                        )
                    }
                    Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.size(32.dp))
                }
                Text(todayEarningsIdr.toRupiahCompact(), style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Black, color = DeepForest)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    InfoPill(icon = Icons.Default.Bolt, text = "${offers.size} tawaran")
                    InfoPill(icon = Icons.Default.CheckCircle, text = "$deliveredCount selesai")
                    InfoPill(icon = Icons.Default.Inventory2, text = "$totalOrders order")
                }
            }
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = Color.White.copy(alpha = 0.94f),
            shape = RoundedCornerShape(8.dp),
            border = BorderStroke(1.dp, Outline.copy(alpha = 0.24f))
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Area permintaan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = DeepForest)
                    AssistChip(
                        onClick = onViewOrders,
                        label = { Text("${hotspots.sumOf { it.pendingOrders }} order") },
                        leadingIcon = { Icon(Icons.Default.LocalFireDepartment, contentDescription = null, modifier = Modifier.size(16.dp)) }
                    )
                }
                if (hotspots.isEmpty()) {
                    Text(
                        "Zona permintaan sedang normal. Tetap online untuk menerima tawaran terdekat.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    hotspots.take(3).forEach { hotspot ->
                        HotspotRow(hotspot)
                    }
                }
            }
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = Color.White.copy(alpha = 0.94f),
            shape = RoundedCornerShape(8.dp),
            border = BorderStroke(1.dp, Outline.copy(alpha = 0.24f))
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Layanan aktif", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = DeepForest)
                if (services.isEmpty()) {
                    Text(
                        "Layanan aktif sedang disinkronkan.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                services.take(5).forEach { service ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(service.name, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                "ETA ${service.maxEtaMinutes.takeIf { it > 0 } ?: 240} menit • ${service.vehicleTypes.firstOrNull() ?: "motor"}",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Surface(color = PrimaryLight, shape = RoundedCornerShape(8.dp)) {
                            Text(service.serviceFamily.replace("_", " ").uppercase(), modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp), style = MaterialTheme.typography.labelSmall, color = Primary, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(8.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Tugas sekarang", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                    AssistChip(
                        onClick = onViewOrders,
                        label = { Text("$pendingCount pending") },
                        leadingIcon = { Icon(Icons.Default.Schedule, contentDescription = null, modifier = Modifier.size(16.dp)) }
                    )
                }
                if (activeOrder != null) {
                    RouteSummary(activeOrder)
                    Button(
                        onClick = { onOpenDelivery(activeOrder) },
                        modifier = Modifier.fillMaxWidth().height(54.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = LogisticsOrange, contentColor = Color.White),
                        border = BorderStroke(1.dp, LogisticsOrange.copy(alpha = 0.35f))
                    ) {
                        Icon(Icons.Default.Navigation, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Lanjutkan pekerjaan", fontWeight = FontWeight.Black)
                    }
                } else {
                    EmptyActiveOrder(
                        title = if (isOnline) "Menunggu pekerjaan on-demand" else "Belum aktif bekerja",
                        subtitle = if (isOnline) "Tawaran akan muncul otomatis sesuai zona dan prioritas." else "Aktifkan duty saat sudah siap menerima pekerjaan.",
                        onViewOrders = onViewOrders
                    )
                }
            }
        }
    }
}
