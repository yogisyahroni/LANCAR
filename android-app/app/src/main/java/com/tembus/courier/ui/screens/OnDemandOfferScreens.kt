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
internal fun ServiceCoverageToggleRow(
    service: CourierServiceProduct,
    vehicleGroup: String,
    enabled: Boolean,
    lockedByAdmin: Boolean = false,
    onEnabledChange: (Boolean) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (enabled) Color.White else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(
            1.dp,
            if (enabled) MaterialTheme.colorScheme.outline.copy(alpha = 0.12f)
            else MaterialTheme.colorScheme.outline.copy(alpha = 0.22f)
        )
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(
                color = if (enabled) PrimaryLight else MaterialTheme.colorScheme.outline.copy(alpha = 0.10f),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(
                    imageVector = if (vehicleGroup == "car") Icons.Default.LocalShipping else Icons.Default.TwoWheeler,
                    contentDescription = null,
                    tint = if (enabled) Primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(8.dp).size(18.dp)
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    service.name,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    "ETA maks ${service.maxEtaMinutes.takeIf { it > 0 } ?: 240} menit",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                text = if (enabled) "Aktif" else "Off",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Black,
                color = if (enabled) Success else MaterialTheme.colorScheme.onSurfaceVariant
            )
            Switch(
                checked = enabled,
                onCheckedChange = onEnabledChange,
                enabled = !lockedByAdmin,
                modifier = Modifier.height(32.dp),
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = Primary,
                    uncheckedThumbColor = Color.White,
                    uncheckedTrackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.38f)
                )
            )
        }
    }
}

internal fun CourierServiceProduct.supportsVehicleGroup(vehicleGroup: String): Boolean {
    if (vehicleGroup.isBlank()) return false
    if (vehicleTypes.isEmpty()) return true
    return vehicleTypes.any { normalizedVehicleGroup(it) == vehicleGroup }
}

internal fun CourierServiceCapability.toServiceProduct(vehicleGroup: String): CourierServiceProduct {
    return CourierServiceProduct(
        code = serviceCode,
        name = serviceName,
        description = description,
        serviceFamily = serviceFamily,
        serviceCategory = serviceCategory,
        routeModel = routeModel,
        maxWeightKg = maxWeightKg,
        vehicleTypes = listOf(vehicleGroup),
        batchingAllowed = batchingAllowed,
        maxPackagesPerOrder = maxPackagesPerOrder,
        maxActiveOrdersRegular = maxActiveOrdersRegular,
        maxActiveOrdersOnDemand = maxActiveOrdersOnDemand,
        sameCustomerBatchingRequired = sameCustomerBatchingRequired,
        allowNewOfferWhilePickup = allowNewOfferWhilePickup,
        allowNewOfferWhileDelivery = allowNewOfferWhileDelivery,
        assignmentRadiusPickupKm = assignmentRadiusPickupKm,
        assignmentRadiusDeliveryKm = assignmentRadiusDeliveryKm,
        proofGeofenceRadiusM = proofGeofenceRadiusM,
        proofMinAccuracyM = proofMinAccuracyM,
        faceVerificationRequired = faceVerificationRequired,
        failedDeliveryPolicy = failedDeliveryPolicy,
        podLabel = podLabel
    )
}

internal fun resolveMaxActiveOnDemandJobs(
    capabilityProfile: CourierCapabilityProfile?,
    services: List<CourierServiceProduct>,
    courierVehicleType: String
): Int {
    val vehicleGroup = normalizedVehicleGroup(courierVehicleType)
    val enabledCapabilityCodes = capabilityProfile?.serviceCapabilities
        ?.filter { capability ->
            capability.serviceCategory == "on_demand" &&
                capability.status.equals("enabled", ignoreCase = true)
        }
        ?.map { it.serviceCode }
        ?.toSet()
        .orEmpty()
    val capabilityMaxActive = capabilityProfile?.serviceCapabilities
        ?.filter { capability ->
            capability.serviceCategory == "on_demand" &&
                capability.status.equals("enabled", ignoreCase = true)
        }
        ?.maxOfOrNull { it.maxActiveOrdersOnDemand.coerceAtLeast(1) }
        ?: 1
    val serviceMaxActive = services
        .filter { service ->
            service.serviceCategory == "on_demand" &&
                service.supportsVehicleGroup(vehicleGroup) &&
                (enabledCapabilityCodes.isEmpty() || service.code in enabledCapabilityCodes)
        }
        .maxOfOrNull { it.maxActiveOrdersOnDemand.coerceAtLeast(1) }
        ?: 1

    return maxOf(capabilityMaxActive, serviceMaxActive, 1)
}

internal fun normalizedVehicleGroup(raw: String?): String {
    val value = raw?.trim()?.lowercase().orEmpty()
    return when {
        value.isBlank() -> ""
        value in setOf("car", "mobil", "van", "box", "pickup", "truck") -> "car"
        else -> "motor"
    }
}

internal fun String.toVehicleLabel(): String = when (this) {
    "car" -> "mobil"
    "" -> "belum tersinkron"
    else -> "motor"
}

internal fun decodeRuntimeRoutePolyline(encoded: String?): List<LatLng> {
    if (encoded.isNullOrBlank()) return emptyList()
    val routePoints = mutableListOf<LatLng>()
    var index = 0
    var lat = 0
    var lng = 0

    while (index < encoded.length) {
        var result = 0
        var shift = 0
        do {
            if (index >= encoded.length) return routePoints
            val byteValue = encoded[index++].code - 63
            result = result or ((byteValue and 0x1f) shl shift)
            shift += 5
        } while (byteValue >= 0x20)
        lat += if ((result and 1) != 0) (result shr 1).inv() else result shr 1

        result = 0
        shift = 0
        do {
            if (index >= encoded.length) return routePoints
            val byteValue = encoded[index++].code - 63
            result = result or ((byteValue and 0x1f) shl shift)
            shift += 5
        } while (byteValue >= 0x20)
        lng += if ((result and 1) != 0) (result shr 1).inv() else result shr 1
        routePoints.add(LatLng(lat / 1E5, lng / 1E5))
    }

    return routePoints
}

@Composable
internal fun HotspotRow(hotspot: CourierHotspot) {
    val color = when (hotspot.intensity.lowercase()) {
        "high" -> LogisticsOrange
        "medium" -> Warning
        else -> Primary
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Surface(color = color.copy(alpha = 0.14f), shape = RoundedCornerShape(8.dp)) {
            Icon(Icons.Default.LocalFireDepartment, contentDescription = null, tint = color, modifier = Modifier.padding(8.dp).size(18.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(hotspot.name, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${hotspot.pendingOrders} pickup menunggu • ${hotspot.intensity.replaceFirstChar { it.uppercase() }}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Text(hotspot.code ?: "zone", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = Primary)
    }
}

@Composable
internal fun OnDemandOfferQueueDialog(
    offers: List<Order>,
    mapsProviderConfig: MapsProviderConfig,
    activeJobCount: Int,
    maxActiveJobs: Int,
    acceptBlocked: Boolean,
    onAccept: (Order) -> Unit,
    onReject: (Order) -> Unit,
    onExpired: (Order) -> Unit
) {
    val orderedOffers = remember(offers) {
        offers.sortedWith(
            compareBy<Order> { it.offerExpiresAt ?: Long.MAX_VALUE }
                .thenByDescending { it.cleanPayoutIdr() }
        )
    }
    val capacityText = if (acceptBlocked) {
        "Selesaikan pekerjaan aktif dulu. Profil operasional saat ini mengizinkan $maxActiveJobs pekerjaan aktif."
    } else {
        "Kapasitas aktif $activeJobCount/$maxActiveJobs pekerjaan."
    }

    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.58f))
                .padding(horizontal = 18.dp, vertical = 24.dp),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Color(0xF70A2218),
                shape = RoundedCornerShape(24.dp),
                shadowElevation = 12.dp
            ) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Surface(color = LogisticsOrange, shape = RoundedCornerShape(12.dp)) {
                            Icon(Icons.Default.Bolt, contentDescription = null, tint = Color.Black, modifier = Modifier.padding(10.dp).size(22.dp))
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Tawaran Masuk", color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black)
                            Text(
                                "${orderedOffers.size} pekerjaan menunggu keputusan",
                                color = Color.White.copy(alpha = 0.72f),
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }

                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = if (acceptBlocked) MaterialTheme.colorScheme.error.copy(alpha = 0.14f) else Primary.copy(alpha = 0.14f),
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(
                            1.dp,
                            if (acceptBlocked) MaterialTheme.colorScheme.error.copy(alpha = 0.42f) else Primary.copy(alpha = 0.38f)
                        )
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.Top,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                if (acceptBlocked) Icons.Default.LockClock else Icons.Default.VerifiedUser,
                                contentDescription = null,
                                tint = if (acceptBlocked) MaterialTheme.colorScheme.error else Primary,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(capacityText, color = Color.White.copy(alpha = 0.86f), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                        }
                    }

                    Column(
                        modifier = Modifier
                            .heightIn(max = 560.dp)
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        orderedOffers.forEachIndexed { index, offer ->
                            OnDemandOfferQueueItem(
                                order = offer,
                                mapsProviderConfig = mapsProviderConfig,
                                promoted = index == 0,
                                acceptBlocked = acceptBlocked,
                                blockedReason = capacityText,
                                onAccept = { onAccept(offer) },
                                onReject = { onReject(offer) },
                                onExpired = { onExpired(offer) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun OnDemandOfferQueueItem(
    order: Order,
    mapsProviderConfig: MapsProviderConfig,
    promoted: Boolean,
    acceptBlocked: Boolean,
    blockedReason: String,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onExpired: () -> Unit
) {
    val haptic = LocalHapticFeedback.current
    var now by remember(order.dispatchId, order.orderId) { mutableStateOf(System.currentTimeMillis()) }
    var expiredSent by remember(order.dispatchId, order.orderId) { mutableStateOf(false) }
    val expiresAt = order.offerExpiresAt ?: remember(order.dispatchId, order.orderId) {
        System.currentTimeMillis() + (order.offerTtlSeconds ?: ON_DEMAND_OFFER_TTL_SECONDS) * 1000L
    }
    val totalTtlMs = ((order.offerTtlSeconds ?: ON_DEMAND_OFFER_TTL_SECONDS) * 1000L).coerceAtLeast(1L)
    val remainingMs = (expiresAt - now).coerceAtLeast(0L)
    val remainingSeconds = ((remainingMs + 999L) / 1000L).toInt()
    val progress = (remainingMs.toFloat() / totalTtlMs.toFloat()).coerceIn(0f, 1f)
    val pickupPoint = remember(order.pickupLatitude, order.pickupLongitude) {
        val lat = order.pickupLatitude
        val lng = order.pickupLongitude
        if (lat != null && lng != null) LatLng(lat, lng) else null
    }
    val dropPoint = remember(order.dropLatitude, order.dropLongitude) {
        val lat = order.dropLatitude
        val lng = order.dropLongitude
        if (lat != null && lng != null) LatLng(lat, lng) else null
    }
    val expired = remainingSeconds <= 0

    LaunchedEffect(order.dispatchId, order.orderId, expiresAt) {
        while (now < expiresAt) {
            delay(250L)
            now = System.currentTimeMillis()
        }
    }

    LaunchedEffect(remainingSeconds) {
        if (remainingSeconds in 1..5) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        }
        if (expired && !expiredSent) {
            expiredSent = true
            onExpired()
        }
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (promoted) Color.White else Color.White.copy(alpha = 0.92f),
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, if (promoted) LogisticsOrange.copy(alpha = 0.65f) else Color.White.copy(alpha = 0.22f))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(if (promoted) "Prioritas berikutnya" else order.orderId.ifBlank { "Tawaran lain" }, color = DeepForest, fontWeight = FontWeight.Black)
                    Text(order.displayServiceName(), color = Color.DarkGray, style = MaterialTheme.typography.labelMedium)
                }
                Surface(color = if (expired) MaterialTheme.colorScheme.error.copy(alpha = 0.12f) else LogisticsOrange.copy(alpha = 0.16f), shape = RoundedCornerShape(10.dp)) {
                    Text(
                        if (expired) "Expired" else "${remainingSeconds}s",
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        color = if (expired) MaterialTheme.colorScheme.error else LogisticsOrange,
                        fontWeight = FontWeight.Black,
                        style = MaterialTheme.typography.labelMedium
                    )
                }
            }

            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier.fillMaxWidth().height(7.dp),
                color = if (remainingSeconds <= 5) MaterialTheme.colorScheme.error else LogisticsOrange,
                trackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.16f)
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                InfoPill(icon = Icons.Default.Route, text = order.distance.ifBlank { "Jarak dihitung" })
                InfoPill(icon = Icons.Default.Payments, text = order.estimatedNetEarningsIdr().toRupiahCompact())
            }

            OfferRouteRow(
                icon = Icons.Default.Storefront,
                label = if (order.isMaintenanceService()) "Lokasi layanan" else "Pickup",
                value = order.pickupAddress.ifBlank {
                    if (order.isMaintenanceService()) "Alamat lokasi layanan sedang disinkronkan" else "Alamat pickup sedang disinkronkan"
                }
            )
            if (!order.isMaintenanceService()) {
                OfferRouteRow(
                    icon = Icons.Default.Place,
                    label = "Tujuan",
                    value = order.dropAddress.ifBlank { "Alamat tujuan dibuka setelah diterima" }
                )
            }

            if (promoted && (pickupPoint != null || dropPoint != null)) {
                Surface(
                    modifier = Modifier.fillMaxWidth().height(104.dp),
                    color = PrimaryLight.copy(alpha = 0.55f),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    RuntimeMapRenderer(
                        modifier = Modifier.fillMaxSize(),
                        providerConfig = mapsProviderConfig,
                        markers = buildList {
                            pickupPoint?.let { add(RuntimeMapMarker("pickup-${order.orderId}", it, if (order.isMaintenanceService()) "Lokasi layanan" else "Pickup", order.pickupAddress)) }
                            if (!order.isMaintenanceService()) {
                                dropPoint?.let { add(RuntimeMapMarker("dropoff-${order.orderId}", it, "Tujuan", order.dropAddress)) }
                            }
                        },
                        routePoints = buildList {
                            pickupPoint?.let { add(it) }
                            if (!order.isMaintenanceService()) {
                                dropPoint?.let { add(it) }
                            }
                        },
                        followLocation = pickupPoint ?: dropPoint,
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
                        fallbackTitle = "Area tawaran",
                        fallbackMessage = "Peta mengikuti konfigurasi operasional."
                    )
                }
            }

            if (acceptBlocked) {
                Text(blockedReason, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            }

            SwipeToAcceptTrack(
                remainingSeconds = remainingSeconds,
                trackColor = Color.Black.copy(alpha = 0.08f),
                thumbColor = LogisticsOrange,
                textColor = Color.DarkGray,
                enabled = !expired && !acceptBlocked,
                onAccept = {
                    if (!expired && !acceptBlocked) {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onAccept()
                    }
                }
            )
        }
    }
}

@Composable
internal fun OnDemandOfferDialog(
    order: Order,
    mapsProviderConfig: MapsProviderConfig,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onExpired: () -> Unit
) {
    val haptic = LocalHapticFeedback.current
    var now by remember(order.dispatchId, order.orderId) { mutableStateOf(System.currentTimeMillis()) }
    var expiredSent by remember(order.dispatchId, order.orderId) { mutableStateOf(false) }
    val expiresAt = order.offerExpiresAt ?: remember(order.dispatchId, order.orderId) {
        System.currentTimeMillis() + (order.offerTtlSeconds ?: ON_DEMAND_OFFER_TTL_SECONDS) * 1000L
    }
    val totalTtlMs = ((order.offerTtlSeconds ?: ON_DEMAND_OFFER_TTL_SECONDS) * 1000L).coerceAtLeast(1L)
    val remainingMs = (expiresAt - now).coerceAtLeast(0L)
    val remainingSeconds = ((remainingMs + 999L) / 1000L).toInt()
    val progress = (remainingMs.toFloat() / totalTtlMs.toFloat()).coerceIn(0f, 1f)
    val pickupPoint = remember(order.pickupLatitude, order.pickupLongitude) {
        val lat = order.pickupLatitude
        val lng = order.pickupLongitude
        if (lat != null && lng != null) LatLng(lat, lng) else null
    }
    val dropPoint = remember(order.dropLatitude, order.dropLongitude) {
        val lat = order.dropLatitude
        val lng = order.dropLongitude
        if (lat != null && lng != null) LatLng(lat, lng) else null
    }

    LaunchedEffect(order.dispatchId, order.orderId, expiresAt) {
        while (now < expiresAt) {
            delay(250L)
            now = System.currentTimeMillis()
        }
    }

    LaunchedEffect(remainingSeconds) {
        if (remainingSeconds in 1..5) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        }
        if (remainingSeconds <= 0 && !expiredSent) {
            expiredSent = true
            onExpired()
        }
    }

    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.62f))
                .padding(horizontal = 28.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xF20A2218), RoundedCornerShape(24.dp))
                    .padding(22.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "Pesanan Baru",
                    color = Primary,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Black
                )
                Text(
                    text = "Waktu tersisa: $remainingSeconds detik",
                    color = if (remainingSeconds <= 5) Color(0xFFFF5252) else Color(0xFFFF6F61),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp),
                    color = Primary,
                    trackColor = Color.White.copy(alpha = 0.18f)
                )

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Jarak", color = Color.White.copy(alpha = 0.82f), style = MaterialTheme.typography.titleSmall)
                    Text(order.distance.ifBlank { "Jarak dihitung" }, color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Pendapatan", color = Color.White.copy(alpha = 0.82f), style = MaterialTheme.typography.titleSmall)
                    Text(order.estimatedNetEarningsIdr().toRupiahCompact(), color = Primary, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                }

                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = Color.White.copy(alpha = 0.04f),
                    shape = RoundedCornerShape(18.dp),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.08f))
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        OfferRouteRowDark(
                            icon = Icons.Default.LocationOn,
                            tint = Primary,
                            label = if (order.isMaintenanceService()) "Lokasi layanan" else "Titik Jemput",
                            value = order.pickupAddress.ifBlank {
                                if (order.isMaintenanceService()) "Alamat lokasi layanan sedang disinkronkan" else "Alamat jemput sedang disinkronkan"
                            }
                        )
                        if (!order.isMaintenanceService()) {
                            OfferRouteRowDark(
                                icon = Icons.Default.Place,
                                tint = Color(0xFFFF3B30),
                                label = "Tujuan",
                                value = order.dropAddress.ifBlank { "Alamat tujuan dibuka setelah diterima" }
                            )
                        }
                    }
                }

                if (pickupPoint != null || dropPoint != null) {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(96.dp),
                        color = Color.Black.copy(alpha = 0.22f),
                        shape = RoundedCornerShape(18.dp)
                    ) {
                        RuntimeMapRenderer(
                            modifier = Modifier.fillMaxSize(),
                            providerConfig = mapsProviderConfig,
                            markers = buildList {
                                pickupPoint?.let { add(RuntimeMapMarker("pickup", it, if (order.isMaintenanceService()) "Lokasi layanan" else "Titik Jemput", order.pickupAddress)) }
                                if (!order.isMaintenanceService()) {
                                    dropPoint?.let { add(RuntimeMapMarker("dropoff", it, "Tujuan", order.dropAddress)) }
                                }
                            },
                            routePoints = buildList {
                                pickupPoint?.let { add(it) }
                                if (!order.isMaintenanceService()) {
                                    dropPoint?.let { add(it) }
                                }
                            },
                            followLocation = pickupPoint ?: dropPoint,
                            mapUiSettings = MapUiSettings(
                                zoomControlsEnabled = false,
                                myLocationButtonEnabled = false,
                                mapToolbarEnabled = false,
                                scrollGesturesEnabled = false,
                                zoomGesturesEnabled = false,
                                tiltGesturesEnabled = false,
                                rotationGesturesEnabled = false
                            ),
                            routeColor = Primary,
                            fallbackTitle = "Area pesanan",
                            fallbackMessage = "Peta mengikuti konfigurasi operasional."
                        )
                    }
                }

                // ── Swipe-to-Accept + Tolak ───────────────────────────
                // S2-COURIER-01: Ganti tap dengan swipe gesture untuk mencegah
                // accidental accept saat kurir riding. Threshold 80% seperti
                // rekomendasi skill 02-courier-app-flow.md Section A.
                // Reject tetap tap biasa (outlined button) karena tidak butuh
                // pengamanan sekuat accept.
                SwipeToAcceptTrack(
                    remainingSeconds = remainingSeconds,
                    onAccept = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onAccept()
                    }
                )
                OutlinedButton(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onReject()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(28.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFF5252)),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.48f))
                ) {
                    Text("Tolak", fontWeight = FontWeight.Black)
                }
            }
        }
    }
}

/**
 * Swipe-to-Accept track widget untuk on-demand order offer.
 *
 * Pattern dari Grab/Gojek/Uber Driver: swipe gesture (drag dari kiri ke kanan)
 * untuk mengurangi risiko accidental accept saat kurir riding.
 *
 * - Threshold: 80% lebar track
 * - Snap-back animation: kalau swipe belum mencapai threshold
 * - Progress feedback: track terisi warna seiring swipe
 * - Haptic: getaran pendek saat threshold tercapai
 * - Timer: countdown tetap visible selama swipe
 *
 * @param remainingSeconds Detik tersisa sebelum auto-reject
 * @param onAccept Callback saat swipe mencapai threshold
 */
@Composable
internal fun SwipeToAcceptTrack(
    remainingSeconds: Int, 
    trackColor: Color = Color.White.copy(alpha = 0.10f),
    thumbColor: Color = Color.White,
    textColor: Color = Color.White.copy(alpha = 0.55f),
    enabled: Boolean = true,
    onAccept: () -> Unit
) {
    val haptic = LocalHapticFeedback.current
    val density = LocalDensity.current
    var trackWidthPx by remember { mutableFloatStateOf(0f) }
    val swipeProgress = remember { Animatable(0f) }
    var hasTriggered by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val thumbSize = 52.dp
    val trackPadding = 4.dp
    val threshold = 0.80f // 80% — standar industri (skill 02-courier-app-flow.md)

    val progressColor = Primary

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(thumbSize + trackPadding * 2)
            .clip(RoundedCornerShape(thumbSize / 2))
            .background(trackColor)
            .onSizeChanged { size -> trackWidthPx = size.width.toFloat() }
    ) {
        // Progress fill — terisi warna hijau seiring swipe
        val progressWidth by swipeProgress.asState()
        Box(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .fillMaxHeight()
                .width(with(density) { (progressWidth * trackWidthPx).toDp() }.coerceAtMost(
                    with(density) { trackWidthPx.toDp() }
                ))
                .clip(RoundedCornerShape(thumbSize / 2))
                .background(progressColor.copy(alpha = 0.35f))
        )

        // Teks panduan — sembunyi saat swipe mulai
        if (progressWidth < 0.05f && remainingSeconds > 0) {
            Text(
                text = "SWIPE UNTUK TERIMA  →",
                modifier = Modifier.align(Alignment.Center),
                color = textColor,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp
            )
        }

        // Draggable thumb
        val thumbOffsetPx = swipeProgress.value * (trackWidthPx - with(density) { thumbSize.toPx() })
        Box(
            modifier = Modifier
                .offset { IntOffset(thumbOffsetPx.toInt(), 0) }
                .padding(trackPadding)
                .size(thumbSize - trackPadding * 2)
                .clip(CircleShape)
                .background(thumbColor)
                .pointerInput(remainingSeconds, enabled) {
                    if (!enabled) return@pointerInput
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            scope.launch {
                                if (swipeProgress.value >= threshold && !hasTriggered) {
                                    hasTriggered = true
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    // Animasikan ke ujung kanan sebelum trigger
                                    swipeProgress.animateTo(
                                        1f,
                                        animationSpec = tween(150, easing = FastOutSlowInEasing)
                                    )
                                    onAccept()
                                } else if (!hasTriggered) {
                                    // Snap-back kalau belum mencapai threshold
                                    swipeProgress.animateTo(
                                        0f,
                                        animationSpec = tween(300, easing = FastOutSlowInEasing)
                                    )
                                }
                            }
                        },
                        onHorizontalDrag = { _, dragAmount ->
                            if (remainingSeconds > 0 && !hasTriggered) {
                                scope.launch {
                                    val delta = dragAmount / (trackWidthPx - with(density) { thumbSize.toPx() })
                                    val newValue = (swipeProgress.value + delta).coerceIn(0f, 1f)
                                    swipeProgress.snapTo(newValue)
                                }
                            }
                        }
                    )
                }
        )
    }
}

@Composable
internal fun OfferRouteRowDark(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    label: String,
    value: String
) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(23.dp))
        Column {
            Text(label, style = MaterialTheme.typography.labelLarge, color = Color.White, fontWeight = FontWeight.Black)
            Text(
                value,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.82f),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
internal fun OfferRouteRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String
) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.size(20.dp))
        Column {
            Text(label, style = MaterialTheme.typography.labelMedium, color = Color.Gray)
            Text(value.ifBlank { "-" }, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = Color.Black)
        }
    }
}

// S2-COURIER-03: Daily earnings target progress bar
// Target harian bisa dikonfigurasi via backend (feature flag / config)
internal const val DAILY_EARNINGS_TARGET_IDR = 150_000
