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
internal fun OnDemandHomeHubEnterprise(
    courierName: String,
    totalOrders: Int,
    pendingCount: Int,
    deliveredCount: Int,
    todayEarningsIdr: Int,
    orders: List<Order>,
    offers: List<Order>,
    services: List<CourierServiceProduct>,
    capabilityProfile: CourierCapabilityProfile?,
    courierVehicleType: String,
    routePreviews: Map<String, CourierRoutePreview>,
    activeRoutePlan: CourierActiveRoutePlan?,
    hotspots: List<CourierHotspot>,
    mapsProviderConfig: MapsProviderConfig,
    isOnline: Boolean,
    onOnlineToggle: (Boolean) -> Unit,
    onOpenDelivery: (Order) -> Unit,
    onViewOrders: () -> Unit
) {
    val activeOrder = orders.firstOrNull { it.status.lowercase() in setOf("accepted", "picked_up", "in_transit") }
    val vehicleGroup = normalizedVehicleGroup(courierVehicleType)
    val capabilityItems = capabilityProfile?.serviceCapabilities
        ?.filter { it.serviceCategory == "on_demand" }
        .orEmpty()
    val capabilityByCode = capabilityItems.associateBy { it.serviceCode }
    val serviceByCode = services.associateBy { it.code }
    val serviceItems = if (capabilityItems.isNotEmpty()) {
        capabilityItems
            .map { capability -> serviceByCode[capability.serviceCode] ?: capability.toServiceProduct(vehicleGroup) }
            .filter { it.supportsVehicleGroup(vehicleGroup) }
    } else {
        services.filter { it.supportsVehicleGroup(vehicleGroup) }
    }
    var disabledServiceCodesText by rememberSaveable(vehicleGroup) { mutableStateOf("") }
    val disabledServiceCodes = remember(disabledServiceCodesText) {
        disabledServiceCodesText.split(",").filter { it.isNotBlank() }.toSet()
    }
    val activeServiceItems = serviceItems.filter { service ->
        val capability = capabilityByCode[service.code]
        val enabledByCapability = capability?.status?.equals("enabled", ignoreCase = true) ?: true
        enabledByCapability && service.code !in disabledServiceCodes
    }
    val hotspotTotal = hotspots.sumOf { it.pendingOrders }
    val pickupPoint = activeOrder?.let { order ->
        val lat = order.pickupLatitude
        val lng = order.pickupLongitude
        if (lat != null && lng != null) LatLng(lat, lng) else null
    }
    val dropPoint = activeOrder?.let { order ->
        val lat = order.dropLatitude
        val lng = order.dropLongitude
        if (lat != null && lng != null) LatLng(lat, lng) else null
    }
    val activeRoutePreview = activeOrder?.let { routePreviews[it.orderId] }
    val plannedRoutePoints = remember(activeRoutePlan) {
        activeRoutePlan?.segments
            ?.flatMap { segment -> decodeRuntimeRoutePolyline(segment.routePolyline) }
            ?.takeIf { it.isNotEmpty() }
            ?: activeRoutePlan?.stops
                ?.mapNotNull { stop ->
                    val lat = stop.latitude
                    val lng = stop.longitude
                    if (lat != null && lng != null) LatLng(lat, lng) else null
                }
            ?: emptyList()
    }
    val activeRoutePoints = plannedRoutePoints.ifEmpty {
        activeRoutePreview?.let { preview ->
        decodeRuntimeRoutePolyline(preview.routePolyline ?: preview.routeSnapshot?.routePolyline)
            .ifEmpty {
                preview.polyline.map { point -> LatLng(point.latitude, point.longitude) }
            }
        }.orEmpty()
    }
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(pickupPoint ?: LatLng(0.0, 0.0), 13f)
    }

    LaunchedEffect(pickupPoint, dropPoint) {
        val pickup = pickupPoint ?: return@LaunchedEffect
        val center = if (dropPoint != null) {
            LatLng((pickup.latitude + dropPoint.latitude) / 2, (pickup.longitude + dropPoint.longitude) / 2)
        } else {
            pickup
        }
        cameraPositionState.position = CameraPosition.fromLatLngZoom(center, if (dropPoint != null) 12f else 13.5f)
    }

    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = if (isOnline) DeepForest else MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(8.dp),
            border = BorderStroke(1.dp, if (isOnline) DeepForest.copy(alpha = 0.28f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.22f)),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (isOnline) "Siap bekerja" else "Belum aktif bekerja",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Black,
                            color = if (isOnline) Color.White else DeepForest
                        )
                        Text(
                            text = if (isOnline) "Tawaran masuk otomatis sesuai zona dan prioritas." else "Aktifkan saat sudah siap menerima pekerjaan.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (isOnline) Color.White.copy(alpha = 0.78f) else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = isOnline,
                        onCheckedChange = onOnlineToggle,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = LogisticsOrange,
                            uncheckedThumbColor = Color.White,
                            uncheckedTrackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.38f)
                        )
                    )
                }

                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = if (isOnline) Color.White.copy(alpha = 0.10f) else PrimaryLight.copy(alpha = 0.72f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(
                            modifier = Modifier.size(34.dp),
                            color = if (isOnline) Success.copy(alpha = 0.18f) else Color.White,
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(
                                if (isOnline) Icons.Default.GpsFixed else Icons.Default.GpsOff,
                                contentDescription = null,
                                tint = if (isOnline) Success else Primary,
                                modifier = Modifier.padding(7.dp)
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                if (isOnline) "On duty" else "Off duty",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = if (isOnline) Color.White else DeepForest
                            )
                            Text(
                                if (isOnline) "Lokasi aktif. Tawaran dikirim bertahap 15 detik." else "Tracking berhenti sampai duty diaktifkan.",
                                style = MaterialTheme.typography.labelMedium,
                                color = if (isOnline) Color.White.copy(alpha = 0.72f) else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(8.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.14f)),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Halo, $courierName", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black, color = DeepForest)
                        Text(
                            text = "Pendapatan bersih hari ini",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Surface(color = LogisticsOrange.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                        Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.padding(10.dp).size(22.dp))
                    }
                }
                Text(
                    todayEarningsIdr.toRupiahCompact(),
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Black,
                    color = DeepForest
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    InfoPill(icon = Icons.Default.Bolt, text = "${offers.size} tawaran")
                    InfoPill(icon = Icons.Default.CheckCircle, text = "$deliveredCount selesai")
                    InfoPill(icon = Icons.Default.Inventory2, text = "$totalOrders order")
                }
                // S2-COURIER-03: Daily earnings target progress bar
                DailyEarningsTargetBar(todayEarningsIdr = todayEarningsIdr)
            }
        }

        if (activeRoutePlan != null && activeRoutePlan.stops.isNotEmpty()) {
            ActiveRoutePlanCard(activeRoutePlan = activeRoutePlan, onViewOrders = onViewOrders)
        }

        if (activeOrder != null) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = DeepForest),
                shape = RoundedCornerShape(8.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
                    if (pickupPoint != null) {
                        RuntimeMapRenderer(
                            modifier = Modifier.fillMaxWidth().height(180.dp),
                            providerConfig = mapsProviderConfig,
                            markers = buildList {
                                add(RuntimeMapMarker("pickup", pickupPoint, activeOrder.pickupAddress.ifBlank { "Pickup" }))
                                dropPoint?.let { add(RuntimeMapMarker("dropoff", it, "Tujuan", activeOrder.dropAddress)) }
                            },
                            routePoints = activeRoutePoints,
                            followLocation = pickupPoint,
                            mapUiSettings = MapUiSettings(
                                zoomControlsEnabled = false,
                                myLocationButtonEnabled = false,
                                mapToolbarEnabled = false,
                                scrollGesturesEnabled = false,
                                zoomGesturesEnabled = false,
                                tiltGesturesEnabled = false,
                                rotationGesturesEnabled = false
                            ),
                            routeColor = LogisticsOrange,
                            fallbackTitle = "Rute pekerjaan aktif",
                            fallbackMessage = "Rute dan ETA mengikuti data operasional terbaru."
                        )
                    }
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Pekerjaan aktif", style = MaterialTheme.typography.labelLarge, color = Color.White.copy(alpha = 0.72f), fontWeight = FontWeight.Bold)
                                Text(activeOrder.displayServiceName(), style = MaterialTheme.typography.titleLarge, color = Color.White, fontWeight = FontWeight.Black)
                            }
                            Text(activeOrder.estimatedNetEarningsIdr().toRupiahCompact(), style = MaterialTheme.typography.titleLarge, color = LogisticsOrange, fontWeight = FontWeight.Black)
                        }
                        RouteSummary(activeOrder)
                        Button(
                            onClick = { onOpenDelivery(activeOrder) },
                            modifier = Modifier.fillMaxWidth().height(52.dp),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = LogisticsOrange, contentColor = Color.White)
                        ) {
                            Icon(Icons.Default.Navigation, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Lanjutkan pekerjaan", fontWeight = FontWeight.Black)
                        }
                    }
                }
            }
        } else {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(8.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.14f))
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Tugas sekarang", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                            Text(
                                if (isOnline) "Menunggu tawaran berikutnya" else "Aktifkan duty untuk mulai",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        AssistChip(
                            onClick = onViewOrders,
                            label = { Text("$pendingCount pending") },
                            leadingIcon = { Icon(Icons.Default.Schedule, contentDescription = null, modifier = Modifier.size(16.dp)) }
                        )
                    }
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = PrimaryLight.copy(alpha = 0.48f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Surface(color = Color.White, shape = RoundedCornerShape(8.dp)) {
                                Icon(
                                    if (isOnline) Icons.Default.Radar else Icons.Default.WorkOff,
                                    contentDescription = null,
                                    tint = Primary,
                                    modifier = Modifier.padding(10.dp).size(22.dp)
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    if (isOnline) "Sistem mencari order terdekat" else "Belum menerima pekerjaan",
                                    fontWeight = FontWeight.Bold,
                                    color = DeepForest
                                )
                                Text(
                                    if (isOnline) "Tidak perlu refresh manual." else "Order on-demand akan masuk setelah duty aktif.",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(8.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.14f))
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column {
                        Text("Area permintaan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = DeepForest)
                        Text("Zona aktif di sekitar kamu", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Surface(color = if (hotspotTotal > 0) LogisticsOrange.copy(alpha = 0.12f) else PrimaryLight, shape = RoundedCornerShape(8.dp)) {
                        Row(modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Icon(Icons.Default.LocalFireDepartment, contentDescription = null, tint = if (hotspotTotal > 0) LogisticsOrange else Primary, modifier = Modifier.size(16.dp))
                            Text("$hotspotTotal order", fontWeight = FontWeight.Bold, color = DeepForest)
                        }
                    }
                }
                if (hotspots.isEmpty()) {
                    Text(
                        "Zona permintaan sedang normal. Tetap online untuk menerima tawaran terdekat.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    hotspots.take(3).forEach { hotspot -> HotspotRow(hotspot) }
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(8.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.14f))
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Cakupan layanan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = DeepForest)
                        Text(
                            "${activeServiceItems.size} aktif dari ${serviceItems.size} layanan ${vehicleGroup.toVehicleLabel()}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Surface(color = PrimaryLight, shape = RoundedCornerShape(8.dp)) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Default.Tune, contentDescription = null, tint = Primary, modifier = Modifier.size(16.dp))
                            Text("Preferensi", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = Primary)
                        }
                    }
                }
                if (serviceItems.isEmpty()) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = Warning.copy(alpha = 0.12f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            "Layanan kendaraan ${vehicleGroup.toVehicleLabel()} sedang diverifikasi.",
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = DeepForest
                        )
                    }
                } else {
                    serviceItems.forEach { service ->
                        val capability = capabilityByCode[service.code]
                        val enabledByCapability = capability?.status?.equals("enabled", ignoreCase = true) ?: true
                        val enabled = enabledByCapability && service.code !in disabledServiceCodes
                        ServiceCoverageToggleRow(
                            service = service,
                            vehicleGroup = vehicleGroup,
                            enabled = enabled,
                            lockedByAdmin = !enabledByCapability,
                            onEnabledChange = { checked ->
                                if (!enabledByCapability) return@ServiceCoverageToggleRow
                                val nextCodes = if (checked) {
                                    disabledServiceCodes - service.code
                                } else {
                                    disabledServiceCodes + service.code
                                }
                                disabledServiceCodesText = nextCodes.sorted().joinToString(",")
                            }
                        )
                    }
                }
            }
        }
    }
}

