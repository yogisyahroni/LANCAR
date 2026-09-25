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
import androidx.compose.ui.graphics.vector.ImageVector
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
import com.tembus.courier.data.model.etaMinutesValue
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
import com.tembus.courier.ui.theme.TembusComponentDefaults
import com.tembus.courier.ui.theme.TembusSpacing
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
    availabilityReason: String? = null,
    remediationPath: String? = null,
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
                    service.maxEtaMinutes.takeIf { it > 0 }?.let { "ETA maks $it menit" } ?: "ETA dari server",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (lockedByAdmin) {
                    Text(
                        availabilityReason ?: "Capability belum tersedia",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    remediationPath?.let { remediation ->
                        Text(
                            "Solusi: $remediation",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
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
            capabilityIsAvailable(capability)
        }
        ?.map { it.serviceCode }
        ?.toSet()
        .orEmpty()
    val capabilityMaxActive = capabilityProfile?.serviceCapabilities
        ?.filter { capability ->
            capability.serviceCategory == "on_demand" &&
                capabilityIsAvailable(capability)
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
                "${if (hotspot.demandEstimate) "Estimasi" else "Aktual"} • ${hotspot.pendingOrders} pickup menunggu • ${hotspot.intensity.replaceFirstChar { it.uppercase() }}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                "Sumber: ${hotspot.demandSource.replace('_', ' ')} • ${hotspot.freshness.replace('_', ' ')}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Text(hotspot.code ?: "zone", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = Primary)
    }
}

private enum class OfferServiceMode {
    FOOD,
    PACKAGE,
    TAMBAL_BAN,
    TOWING,
    OTHER
}

private fun Order.offerServiceMode(): OfferServiceMode {
    val identity = listOf(serviceCode, serviceCategory, serviceFamily, serviceName)
        .filterNotNull()
        .joinToString(" ")
        .lowercase()
    return when {
        "tambal" in identity -> OfferServiceMode.TAMBAL_BAN
        "towing" in identity || "dere k" in identity -> OfferServiceMode.TOWING
        "food" in identity || "makanan" in identity -> OfferServiceMode.FOOD
        "paket" in identity || "package" in identity || "parcel" in identity || "instant" in identity -> OfferServiceMode.PACKAGE
        else -> OfferServiceMode.OTHER
    }
}

private fun OfferServiceMode.label(): String = when (this) {
    OfferServiceMode.FOOD -> "Food"
    OfferServiceMode.PACKAGE -> "Paket"
    OfferServiceMode.TAMBAL_BAN -> "Tambal Ban"
    OfferServiceMode.TOWING -> "Towing"
    OfferServiceMode.OTHER -> "Layanan lain"
}

private fun OfferServiceMode.icon(): ImageVector = when (this) {
    OfferServiceMode.FOOD -> Icons.Default.Restaurant
    OfferServiceMode.PACKAGE -> Icons.Default.Inventory2
    OfferServiceMode.TAMBAL_BAN -> Icons.Default.Build
    OfferServiceMode.TOWING -> Icons.Default.LocalShipping
    OfferServiceMode.OTHER -> Icons.Default.Route
}

private fun OfferServiceMode.color(): Color = when (this) {
    OfferServiceMode.FOOD -> Color(0xFFE67E22)
    OfferServiceMode.PACKAGE -> Color(0xFF2563EB)
    OfferServiceMode.TAMBAL_BAN -> Color(0xFFB45309)
    OfferServiceMode.TOWING -> Color(0xFFDC2626)
    OfferServiceMode.OTHER -> Primary
}

private fun String.humanizeOfferToken(): String = trim()
    .replace('_', ' ')
    .replace('-', ' ')
    .split(Regex("\\s+"))
    .filter(String::isNotBlank)
    .joinToString(" ") { it.replaceFirstChar { character -> character.uppercase() } }

private fun Order.offerRouteModelLabel(): String? = listOf(serviceRouteModel, routeSnapshot?.routeProfile)
    .firstOrNull { !it.isNullOrBlank() }
    ?.let { raw ->
        when (raw.lowercase()) {
            "p2p", "point_to_point" -> "Titik ke titik"
            "home_service", "home-service" -> "Layanan ke lokasi"
            "multi_stop", "multi-stop" -> "Multi-stop"
            else -> raw.humanizeOfferToken()
        }
    }

private fun Order.offerRouteEtaLabel(): String? {
    val eta = etaMinutesValue()
    return eta.takeIf { it > 0 }?.let { "$it menit" }
}

private fun Order.offerProofLabels(): List<String> {
    val proof = proofRequirements ?: return emptyList()
    return buildList {
        if (proof.faceVerificationRequired) add("Verifikasi wajah")
        proof.requiredSteps.mapNotNull { it.trim().takeIf(String::isNotBlank)?.humanizeOfferToken() }
            .forEach(::add)
        proof.geofenceRadiusM.takeIf { it > 0 }?.let { add("Lokasi ≤ ${it} m") }
        proof.podLabel.trim().takeIf { it.isNotBlank() && !it.equals("POD", ignoreCase = true) }
            ?.let { add(it) }
    }.distinct()
}

@Composable
private fun OfferServiceFacts(
    order: Order,
    activeCapabilities: List<CourierServiceCapability> = emptyList(),
    dark: Boolean = false
) {
    val mode = order.offerServiceMode()
    val modeColor = mode.color()
    val capability = activeCapabilities.firstOrNull { it.serviceCode == order.serviceCode }
    val foreground = if (dark) Color.White else DeepForest
    val muted = if (dark) Color.White.copy(alpha = 0.72f) else Color.DarkGray
    val surface = if (dark) Color.White.copy(alpha = 0.06f) else modeColor.copy(alpha = 0.08f)
    val border = if (dark) Color.White.copy(alpha = 0.12f) else modeColor.copy(alpha = 0.25f)
    val serviceName = order.serviceName?.trim()?.takeIf { it.isNotBlank() }
        ?: order.serviceCode?.trim()?.takeIf { it.isNotBlank() }?.humanizeOfferToken()
        ?: "Nama layanan tidak dikirim server"
    val capabilityAvailable = capability?.let(::capabilityIsAvailable) == true
    val capabilityText = when {
        capabilityAvailable -> "Kemampuan aktif"
        capability != null -> "Status kemampuan: ${capability.status.humanizeOfferToken()}"
        order.serviceCode.isNullOrBlank() -> "Kemampuan belum dipetakan"
        else -> "Kemampuan diverifikasi saat menerima"
    }
    val proofLabels = order.offerProofLabels()

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = surface,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, border)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                Surface(color = modeColor.copy(alpha = if (dark) 0.28f else 0.16f), shape = RoundedCornerShape(9.dp)) {
                    Icon(mode.icon(), contentDescription = mode.label(), tint = modeColor, modifier = Modifier.padding(8.dp).size(18.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(mode.label(), color = foreground, fontWeight = FontWeight.Black, style = MaterialTheme.typography.labelLarge)
                    Text(serviceName, color = muted, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text(capabilityText, color = if (capabilityAvailable) Success else muted, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
            }

            if (capability != null && !capabilityAvailable) {
                Text(capabilityAvailabilityReason(capability), color = if (dark) Color(0xFFFFB4AB) else MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
                capabilityRemediation(capability)?.let { remediation ->
                    Text("Solusi: $remediation", color = muted, style = MaterialTheme.typography.labelSmall)
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                order.offerRouteModelLabel()?.let { InfoPill(icon = Icons.Default.Route, text = it) }
                order.offerRouteEtaLabel()?.let { InfoPill(icon = Icons.Default.Schedule, text = "ETA $it") }
                order.routeProvider?.takeIf { it.isNotBlank() }?.let { InfoPill(icon = Icons.Default.Map, text = it) }
            }

            if (proofLabels.isNotEmpty()) {
                Text("Bukti layanan: ${proofLabels.joinToString(" • ")}", color = muted, style = MaterialTheme.typography.labelSmall)
            } else if (order.proofRequirements != null) {
                Text("Bukti layanan mengikuti kebijakan server", color = muted, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
internal fun OnDemandOfferQueueDialog(
    offers: List<Order>,
    mapsProviderConfig: MapsProviderConfig,
    activeJobCount: Int,
    maxActiveJobs: Int,
    acceptBlocked: Boolean,
    acceptBlockedReason: String? = null,
    activeCapabilities: List<CourierServiceCapability> = emptyList(),
    capabilityProfile: CourierCapabilityProfile? = null,
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
        acceptBlockedReason
            ?: "Selesaikan pekerjaan aktif dulu. Profil operasional saat ini mengizinkan $maxActiveJobs pekerjaan aktif."
    } else {
        "Kapasitas aktif $activeJobCount/$maxActiveJobs pekerjaan."
    }
    val activeCapabilityText = activeCapabilities
        .filter(::capabilityIsAvailable)
        .map { it.serviceName.trim() }
        .filter(String::isNotBlank)
        .distinct()
        .joinToString(", ")

    // Tambal Ban has a dedicated, full-screen offer design in Figma. Keep the
    // generic queue for mixed/other offers, but do not squeeze this service
    // into the old centered dialog card.
    val focusedTambalOffer = orderedOffers.singleOrNull { it.offerServiceMode() == OfferServiceMode.TAMBAL_BAN }
    if (focusedTambalOffer != null) {
        FigmaTambalBanOfferScreen(
            order = focusedTambalOffer,
            mapsProviderConfig = mapsProviderConfig,
            capabilityProfile = capabilityProfile,
            acceptBlocked = acceptBlocked,
            blockedReason = capacityText,
            onAccept = { onAccept(focusedTambalOffer) },
            onReject = { onReject(focusedTambalOffer) },
            onExpired = { onExpired(focusedTambalOffer) }
        )
        return
    }

    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.58f))
                .padding(horizontal = 18.dp, vertical = 24.dp),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.surface,
                shape = TembusComponentDefaults.sheetShape(),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.24f)),
                shadowElevation = 12.dp
            ) {
                Column(
                    modifier = Modifier.padding(TembusSpacing.Large),
                    verticalArrangement = Arrangement.spacedBy(TembusSpacing.Medium)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Surface(color = LogisticsOrange.copy(alpha = 0.14f), shape = TembusComponentDefaults.chipShape()) {
                            Icon(Icons.Default.Bolt, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.padding(10.dp).size(22.dp))
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Tawaran masuk", color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black)
                            Text(
                                "${orderedOffers.size} pekerjaan menunggu keputusan",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall
                            )
                            Text(
                                if (activeCapabilityText.isNotBlank()) "Kemampuan aktif: $activeCapabilityText"
                                else "Kemampuan aktif mengikuti profil operasional",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.labelSmall,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }

                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = if (acceptBlocked) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceVariant,
                        shape = TembusComponentDefaults.cardShape(),
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
                            Text(capacityText, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
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
                                activeCapabilities = activeCapabilities,
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

/**
 * Full-screen Tambal Ban offer, matching the Courier Apps Figma frame 13:951.
 *
 * This is intentionally a server-snapshot screen: no sample payout, customer,
 * location, photo, or vehicle values are invented in the UI. Missing data is
 * represented by a clear fallback state instead.
 */
@Composable
private fun FigmaTambalBanOfferScreen(
    order: Order,
    mapsProviderConfig: MapsProviderConfig,
    capabilityProfile: CourierCapabilityProfile?,
    acceptBlocked: Boolean,
    blockedReason: String,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onExpired: () -> Unit
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val vehicle = order.vehicleDetails
    val courierVehicle = capabilityProfile?.vehicle ?: capabilityProfile?.vehicles?.firstOrNull()
    val netEarnings = order.estimatedNetEarningsIdr().toRupiahCompact()
    val serviceLabel = order.serviceName?.trim()?.takeIf { it.isNotBlank() } ?: "Tambal Ban Motor"
    val customerName = order.customerName.trim().ifBlank { "Customer" }
    val vehicleLabel = listOf(vehicle?.make, vehicle?.model)
        .mapNotNull { it?.trim()?.takeIf(String::isNotBlank) }
        .joinToString(" ")
        .ifBlank { vehicle?.type?.trim().orEmpty().ifBlank { "Kendaraan customer" } }
    val courierVehicleLabel = listOf(courierVehicle?.brand, courierVehicle?.model)
        .mapNotNull { it?.trim()?.takeIf(String::isNotBlank) }
        .joinToString(" ")
        .ifBlank { "Mitra TEMBUS" }
    val courierPlate = courierVehicle?.plateNumber?.trim().orEmpty()
    val damageLabel = listOf(
        vehicle?.requestedHoleCount?.let { "$it lubang sesuai permintaan customer" },
        vehicle?.damage,
        vehicle?.condition
    ).mapNotNull { it?.trim()?.takeIf(String::isNotBlank) }
        .firstOrNull() ?: "Detail kerusakan akan disinkronkan"
    val etaLabel = order.etaMinutesValue().takeIf { it > 0 }?.let { "$it menit" } ?: "ETA sinkron"
    val distanceLabel = order.distance.trim().ifBlank {
        order.routeDistanceMeters.takeIf { it > 0 }?.let { meters ->
            if (meters >= 1_000) String.format("%.1f km", meters / 1_000.0) else "$meters m"
        } ?: "Jarak sinkron"
    }
    val pickupPoint = remember(order.pickupLatitude, order.pickupLongitude) {
        val lat = order.pickupLatitude
        val lng = order.pickupLongitude
        if (lat != null && lng != null) LatLng(lat, lng) else null
    }
    val photoUrls = buildList {
        vehicle?.photoItems.orEmpty().forEach { item ->
            item.url.trim().takeIf(String::isNotBlank)?.let { add(item.role.humanizeOfferToken() to it) }
        }
        vehicle?.photoUrls.orEmpty().forEach { url ->
            url.trim().takeIf(String::isNotBlank)?.let { add("Foto kondisi" to it) }
        }
    }.distinctBy { it.second }.take(2)
    val specificationItems = buildList {
        vehicle?.requestedHoleCount?.let { add("Permintaan customer: $it lubang") }
        vehicle?.condition?.trim()?.takeIf(String::isNotBlank)?.let { add("Kondisi: $it") }
        vehicle?.accessConstraints?.trim()?.takeIf(String::isNotBlank)?.let { add("Akses: $it") }
        vehicle?.notes?.trim()?.takeIf(String::isNotBlank)?.let { add("Catatan: $it") }
        add("Foto dan bukti kerja mengikuti SOP layanan TEMBUS")
    }.distinct()
    val breakdown = order.pricingBreakdown
    val priceBreakdown = buildList {
        breakdown?.serviceFeeIdr?.takeIf { it > 0 }?.let { add("Jasa" to it.toRupiahCompact()) }
        breakdown?.travelFeeIdr?.takeIf { it > 0 }?.let { add("Jarak" to it.toRupiahCompact()) }
        val platformFee = breakdown?.platformFeeIdr?.takeIf { it > 0 } ?: order.platformCommissionIdr.takeIf { it > 0 }
        platformFee?.let { add("Platform" to "-${it.toRupiahCompact()}") }
    }

    var now by remember(order.dispatchId, order.orderId) { mutableStateOf(System.currentTimeMillis()) }
    var expiredSent by remember(order.dispatchId, order.orderId) { mutableStateOf(false) }
    val expiresAt = order.offerExpiresAt ?: remember(order.dispatchId, order.orderId) {
        System.currentTimeMillis() + (order.offerTtlSeconds ?: ON_DEMAND_OFFER_TTL_SECONDS) * 1000L
    }
    val remainingSeconds = offerRemainingSeconds(expiresAt, now)
    val expired = remainingSeconds <= 0
    val actionEnabled = !acceptBlocked && !expired

    LaunchedEffect(order.dispatchId, order.orderId, expiresAt) {
        while (isActive && System.currentTimeMillis() < expiresAt) {
            now = System.currentTimeMillis()
            delay(250L)
        }
        now = System.currentTimeMillis()
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

    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = false,
            dismissOnClickOutside = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(TambalOfferCanvas)
                .statusBarsPadding()
                .navigationBarsPadding()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 14.dp, vertical = 10.dp)
                    .padding(bottom = 82.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Surface(color = TambalOfferGreenSoft, shape = RoundedCornerShape(999.dp)) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Surface(modifier = Modifier.size(8.dp), color = TambalOfferGreen, shape = CircleShape) {}
                            Text("ONLINE", color = TambalOfferGreen, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Black)
                        }
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "$courierVehicleLabel${courierPlate.takeIf { it.isNotBlank() }?.let { " • $it" } ?: ""}",
                            color = TambalOfferGreen,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Black,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text("Siap menerima order Tambal Ban", color = TambalOfferMuted, style = MaterialTheme.typography.labelSmall)
                    }
                    Surface(color = Color.White, shape = CircleShape, border = BorderStroke(1.dp, TambalOfferBorder)) {
                        Icon(Icons.Default.NotificationsNone, contentDescription = "Notifikasi", tint = TambalOfferGreen, modifier = Modifier.padding(10.dp).size(20.dp))
                    }
                }

                Surface(color = TambalOfferGreen, shape = RoundedCornerShape(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Icon(Icons.Default.Bolt, contentDescription = null, tint = TambalOfferMint, modifier = Modifier.size(17.dp))
                            Text("Pendapatan Mayan Siaga", color = Color.White, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        }
                        Surface(color = TambalOfferOrange, shape = RoundedCornerShape(999.dp)) {
                            Text(
                                if (expired) "Tawaran berakhir" else "Batas ${remainingSeconds}s • $netEarnings",
                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                                color = Color.White,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Black
                            )
                        }
                    }
                }

                Surface(modifier = Modifier.fillMaxWidth(), color = Color.White, shape = RoundedCornerShape(17.dp), border = BorderStroke(1.dp, TambalOfferBorder)) {
                    Column(modifier = Modifier.padding(9.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Surface(color = TambalOfferOrangeTint, shape = RoundedCornerShape(999.dp)) {
                                Row(modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                    Icon(Icons.Default.Place, contentDescription = null, tint = TambalOfferOrange, modifier = Modifier.size(15.dp))
                                    Text("LOKASI LAYANAN", color = TambalOfferOrange, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Black)
                                }
                            }
                            Surface(color = TambalOfferGreenSoft, shape = RoundedCornerShape(999.dp)) {
                                Text(distanceLabel, modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp), color = TambalOfferGreen, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Black)
                            }
                        }
                        if (pickupPoint != null) {
                            Box(modifier = Modifier.fillMaxWidth().height(208.dp).clip(RoundedCornerShape(13.dp))) {
                                RuntimeMapRenderer(
                                    modifier = Modifier.fillMaxSize(),
                                    providerConfig = mapsProviderConfig,
                                    markers = listOf(RuntimeMapMarker("tambal-offer-${order.orderId}", pickupPoint, "Lokasi layanan", order.pickupAddress)),
                                    routePoints = listOf(pickupPoint),
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
                                    routeColor = TambalOfferOrange,
                                    fallbackTitle = "Lokasi layanan",
                                    fallbackMessage = "Peta mengikuti koordinat order dari server."
                                )
                                Surface(modifier = Modifier.align(Alignment.BottomStart).padding(9.dp), color = Color.White.copy(alpha = 0.94f), shape = RoundedCornerShape(999.dp)) {
                                    Row(modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                        Icon(Icons.Default.Navigation, contentDescription = null, tint = TambalOfferGreen, modifier = Modifier.size(15.dp))
                                        Text("$distanceLabel • $etaLabel", color = TambalOfferGreen, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        } else {
                            Surface(modifier = Modifier.fillMaxWidth().height(208.dp), color = TambalOfferCanvas, shape = RoundedCornerShape(13.dp)) {
                                Column(modifier = Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                    Icon(Icons.Default.LocationOff, contentDescription = null, tint = TambalOfferMuted, modifier = Modifier.size(30.dp))
                                    Text("Lokasi layanan belum tersedia", color = TambalOfferMuted, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                                    Text("Menunggu koordinat dari server", color = TambalOfferMuted, style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                        Text(order.pickupAddress.ifBlank { "Alamat lokasi layanan sedang disinkronkan" }, color = Color(0xFF111713), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }

                Surface(modifier = Modifier.fillMaxWidth(), color = Color.White, shape = RoundedCornerShape(17.dp), border = BorderStroke(1.dp, TambalOfferBorder)) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Tawaran Tambal Ban", color = TambalOfferOrange, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Black)
                                Text("Pendapatan Bersih Mitra", color = TambalOfferMuted, style = MaterialTheme.typography.labelSmall)
                                Text(netEarnings, color = TambalOfferGreen, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Black)
                            }
                            Surface(color = TambalOfferGreenSoft, shape = RoundedCornerShape(999.dp)) {
                                Text("Tarif terkunci", modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp), color = TambalOfferGreen, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Black)
                            }
                        }
                        if (priceBreakdown.isNotEmpty()) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                priceBreakdown.forEach { (label, value) ->
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(label, color = TambalOfferMuted, style = MaterialTheme.typography.labelSmall)
                                        Text(value, color = Color(0xFF111713), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                }
                            }
                        }
                        Surface(color = TambalOfferCanvas, shape = RoundedCornerShape(11.dp)) {
                            Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = TambalOfferGreen, modifier = Modifier.size(19.dp))
                                Text("Tarif berasal dari server dan tidak berubah karena inspeksi tambahan.", color = TambalOfferMuted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }

                TambalOfferSectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        if (order.customerPhotoUrl.isNotBlank()) {
                            AsyncImage(model = ImageRequest.Builder(context).data(order.customerPhotoUrl).crossfade(true).build(), contentDescription = "Foto $customerName", modifier = Modifier.size(44.dp).clip(CircleShape), contentScale = ContentScale.Crop)
                        } else {
                            Surface(color = TambalOfferGreenSoft, shape = CircleShape) {
                                Icon(Icons.Default.Person, contentDescription = null, tint = TambalOfferGreen, modifier = Modifier.padding(10.dp).size(24.dp))
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(customerName, color = Color(0xFF111713), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Black)
                            Text(vehicleLabel, color = TambalOfferMuted, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Icon(Icons.Default.Phone, contentDescription = null, tint = TambalOfferGreen, modifier = Modifier.size(22.dp))
                    }
                    Surface(color = TambalOfferGreenSoft, shape = RoundedCornerShape(11.dp)) {
                        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.TireRepair, contentDescription = null, tint = TambalOfferOrange, modifier = Modifier.size(19.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Kondisi kerusakan", color = TambalOfferMuted, style = MaterialTheme.typography.labelSmall)
                                Text(damageLabel, color = Color(0xFF111713), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                TambalOfferSectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        Icon(Icons.Default.PhotoCamera, contentDescription = null, tint = TambalOfferGreen, modifier = Modifier.size(18.dp))
                        Text("Foto lokasi & ban", color = Color(0xFF111713), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Black)
                        Text("${photoUrls.size} foto", color = TambalOfferMuted, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                    if (photoUrls.isEmpty()) {
                        Surface(color = TambalOfferCanvas, shape = RoundedCornerShape(11.dp)) {
                            Text("Customer belum mengirim foto kondisi.", modifier = Modifier.padding(10.dp), color = TambalOfferMuted, style = MaterialTheme.typography.bodySmall)
                        }
                    } else {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            photoUrls.forEachIndexed { index, (_, url) ->
                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    AsyncImage(model = ImageRequest.Builder(context).data(url).crossfade(true).build(), contentDescription = "Foto kondisi ${index + 1}", modifier = Modifier.fillMaxWidth().height(108.dp).clip(RoundedCornerShape(11.dp)), contentScale = ContentScale.Crop)
                                    Text(photoUrls[index].first.ifBlank { "Foto kondisi" }, color = TambalOfferMuted, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                    Surface(color = TambalOfferCanvas, shape = RoundedCornerShape(11.dp)) {
                        Row(modifier = Modifier.padding(9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Icon(Icons.Default.Security, contentDescription = null, tint = TambalOfferGreen, modifier = Modifier.size(17.dp))
                            Text("Gunakan perlengkapan sesuai standar keselamatan TEMBUS.", color = TambalOfferMuted, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }

                TambalOfferSectionCard {
                    Text("Rute penanganan darurat", color = Color(0xFF111713), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Black)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Surface(modifier = Modifier.size(12.dp), color = TambalOfferGreen, shape = CircleShape) {}
                            Box(modifier = Modifier.width(2.dp).height(38.dp).background(TambalOfferGreen.copy(alpha = 0.25f)))
                            Surface(modifier = Modifier.size(12.dp), color = TambalOfferOrange, shape = CircleShape) {}
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(13.dp)) {
                            Column {
                                Text("Posisi Anda sekarang", color = TambalOfferMuted, style = MaterialTheme.typography.labelSmall)
                                Text("Menuju lokasi layanan", color = Color(0xFF111713), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                            }
                            Column {
                                Text("TKP penanganan ban", color = TambalOfferOrange, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                Text(order.pickupAddress.ifBlank { "Alamat lokasi layanan sedang disinkronkan" }, color = Color(0xFF111713), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                TambalOfferSectionCard {
                    Text("Spesifikasi & standar peralatan", color = Color(0xFF111713), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Black)
                    specificationItems.forEach { item ->
                        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.CheckBox, contentDescription = null, tint = TambalOfferGreen, modifier = Modifier.size(18.dp))
                            Text(item, color = Color(0xFF111713), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                        }
                    }
                }

                if (acceptBlocked) {
                    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(11.dp)) {
                        Text(blockedReason, modifier = Modifier.padding(10.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                    }
                }
                Button(
                    onClick = {
                        if (actionEnabled) {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onAccept()
                        }
                    },
                    enabled = actionEnabled,
                    modifier = Modifier.fillMaxWidth().height(54.dp),
                    shape = RoundedCornerShape(999.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = TambalOfferOrange, contentColor = Color.White, disabledContainerColor = Color(0xFFD7DCD8), disabledContentColor = TambalOfferMuted)
                ) {
                    Icon(Icons.Default.TaskAlt, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(7.dp))
                    Text("Terima $serviceLabel ($netEarnings)", fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.width(4.dp))
                    Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(18.dp))
                }
                OutlinedButton(
                    onClick = onReject,
                    enabled = !expired,
                    modifier = Modifier.fillMaxWidth().height(44.dp),
                    shape = RoundedCornerShape(999.dp),
                    border = BorderStroke(1.dp, TambalOfferBorder),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = TambalOfferMuted)
                ) {
                    Icon(Icons.Default.Cancel, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(7.dp))
                    Text("Tolak tawaran", fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(6.dp))
                    Surface(color = TambalOfferGreenSoft, shape = RoundedCornerShape(999.dp)) {
                        Text("Bebas penalti SOP", modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp), color = TambalOfferGreen, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                }
            }

            Surface(
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
                color = Color.White,
                shadowElevation = 8.dp,
                border = BorderStroke(1.dp, TambalOfferBorder)
            ) {
                Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 7.dp), horizontalArrangement = Arrangement.SpaceAround) {
                    TambalOfferNavItem(Icons.Default.WorkOutline, "Kerja", selected = true)
                    TambalOfferNavItem(Icons.Default.ReceiptLong, "Order")
                    TambalOfferNavItem(Icons.Default.AccountBalanceWallet, "Dompet")
                    TambalOfferNavItem(Icons.Default.ChatBubbleOutline, "Pesan")
                    TambalOfferNavItem(Icons.Default.PersonOutline, "Akun")
                }
            }
        }
    }
}

@Composable
private fun TambalOfferSectionCard(content: @Composable ColumnScope.() -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color.White,
        shape = RoundedCornerShape(17.dp),
        border = BorderStroke(1.dp, TambalOfferBorder)
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp), content = content)
    }
}

@Composable
private fun TambalOfferNavItem(icon: ImageVector, label: String, selected: Boolean = false) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.widthIn(min = 52.dp)) {
        Icon(icon, contentDescription = label, tint = if (selected) TambalOfferOrange else TambalOfferMuted, modifier = Modifier.size(22.dp))
        Text(label, color = if (selected) TambalOfferOrange else TambalOfferMuted, style = MaterialTheme.typography.labelSmall, fontWeight = if (selected) FontWeight.Black else FontWeight.Medium)
    }
}

@Composable
internal fun OnDemandOfferQueueItem(
    order: Order,
    mapsProviderConfig: MapsProviderConfig,
    activeCapabilities: List<CourierServiceCapability> = emptyList(),
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
    val remainingSeconds = offerRemainingSeconds(expiresAt, now)
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

    if (order.offerServiceMode() == OfferServiceMode.TAMBAL_BAN) {
        StitchTambalBanOfferCard(
            order = order,
            mapsProviderConfig = mapsProviderConfig,
            promoted = promoted,
            acceptBlocked = acceptBlocked,
            blockedReason = blockedReason,
            remainingSeconds = remainingSeconds,
            pickupPoint = pickupPoint,
            onAccept = {
                if (!acceptBlocked && !expired) {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    onAccept()
                }
            },
            onReject = {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                onReject()
            }
        )
        return
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        shape = TembusComponentDefaults.cardShape(),
        border = BorderStroke(1.dp, if (promoted) LogisticsOrange.copy(alpha = 0.65f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.28f))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(if (promoted) "Prioritas berikutnya" else order.orderId.ifBlank { "Tawaran lain" }, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Black)
                    Text(order.displayServiceName(), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
                }
                Surface(color = if (expired) MaterialTheme.colorScheme.errorContainer else LogisticsOrange.copy(alpha = 0.14f), shape = TembusComponentDefaults.chipShape()) {
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

            OfferServiceFacts(order = order, activeCapabilities = activeCapabilities)

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
                enabled = offerCanAccept(expiresAt, now, acceptBlocked),
                onAccept = {
                    if (offerCanAccept(expiresAt, now, acceptBlocked)) {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onAccept()
                    }
                }
            )
        }
    }
}

/**
 * Offer Tambal Ban mengikuti screen Stitch "Tawaran Order Tambal Ban Siaga".
 * Semua isi yang bersifat order/customer/vehicle tetap berasal dari snapshot Order;
 * foto hanya dirender jika URL memang dikirim oleh backend.
 */
@Composable
private fun StitchTambalBanOfferCard(
    order: Order,
    mapsProviderConfig: MapsProviderConfig,
    promoted: Boolean,
    acceptBlocked: Boolean,
    blockedReason: String,
    remainingSeconds: Int,
    pickupPoint: LatLng?,
    onAccept: () -> Unit,
    onReject: () -> Unit
) {
    val context = LocalContext.current
    val vehicle = order.vehicleDetails
    val netEarnings = order.estimatedNetEarningsIdr().toRupiahCompact()
    val serviceLabel = order.serviceName?.trim()?.takeIf { it.isNotBlank() } ?: "Tambal Ban Motor"
    val customerName = order.customerName.trim().ifBlank { "Pelanggan" }
    val vehicleLabel = listOf(vehicle?.make, vehicle?.model)
        .mapNotNull { it?.trim()?.takeIf(String::isNotBlank) }
        .joinToString(" ")
        .ifBlank { vehicle?.type?.trim().orEmpty().ifBlank { "Kendaraan customer" } }
    val damageLabel = listOf(vehicle?.damage, vehicle?.condition)
        .mapNotNull { it?.trim()?.takeIf(String::isNotBlank) }
        .firstOrNull()
        ?: vehicle?.requestedHoleCount?.let { "$it lubang sesuai permintaan" }
        ?: "Detail kerusakan akan disinkronkan"
    val etaLabel = order.etaMinutesValue().takeIf { it > 0 }?.let { "ETA $it mnt" } ?: "ETA sinkron"
    val distanceLabel = order.distance.trim().ifBlank {
        order.routeDistanceMeters.takeIf { it > 0 }?.let { meters ->
            if (meters >= 1_000) String.format("%.1f km", meters / 1_000.0) else "$meters m"
        } ?: "Jarak sinkron"
    }
    val photoUrls = buildList {
        vehicle?.photoItems.orEmpty().forEach { item -> item.url.trim().takeIf(String::isNotBlank)?.let(::add) }
        vehicle?.photoUrls.orEmpty().forEach { url -> url.trim().takeIf(String::isNotBlank)?.let(::add) }
    }.distinct().take(2)
    val specificationItems = buildList {
        vehicle?.requestedHoleCount?.let { add("Permintaan customer: $it lubang") }
        vehicle?.condition?.trim()?.takeIf(String::isNotBlank)?.let { add("Kondisi: $it") }
        vehicle?.accessConstraints?.trim()?.takeIf(String::isNotBlank)?.let { add("Akses: $it") }
        vehicle?.notes?.trim()?.takeIf(String::isNotBlank)?.let { add("Catatan: $it") }
    }
    val expired = remainingSeconds <= 0
    val actionEnabled = !acceptBlocked && !expired

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = TambalOfferCanvas,
        shape = TembusComponentDefaults.cardShape(),
        border = BorderStroke(1.dp, TambalOfferBorder),
        shadowElevation = if (promoted) 10.dp else 4.dp
    ) {
        Column(
            modifier = Modifier.padding(TembusSpacing.Medium),
            verticalArrangement = Arrangement.spacedBy(TembusSpacing.Medium)
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = TambalOfferGreen,
                shape = RoundedCornerShape(14.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Default.Build, contentDescription = null, tint = TambalOfferOrange)
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "TAWARAN TAMBAL BAN SIAGA",
                            color = TambalOfferMint,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Black
                        )
                        Text(
                            "Panggilan masuk di sekitar lokasi kamu",
                            color = Color.White,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    Surface(
                        color = TambalOfferOrange.copy(alpha = 0.18f),
                        shape = TembusComponentDefaults.chipShape()
                    ) {
                        Text(
                            if (expired) "Expired" else "${remainingSeconds}s",
                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
                            color = if (expired) Color(0xFFFFB4AB) else TambalOfferOrange,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Black
                        )
                    }
                }
            }

            if (pickupPoint != null) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = Color.White,
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, TambalOfferBorder)
                ) {
                    Box(modifier = Modifier.fillMaxWidth().height(184.dp)) {
                        RuntimeMapRenderer(
                            modifier = Modifier.fillMaxSize(),
                            providerConfig = mapsProviderConfig,
                            markers = listOf(
                                RuntimeMapMarker(
                                    id = "tambal-offer-${order.orderId}",
                                    position = pickupPoint,
                                    title = "Lokasi layanan",
                                    snippet = order.pickupAddress
                                )
                            ),
                            routePoints = listOf(pickupPoint),
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
                            routeColor = TambalOfferOrange,
                            fallbackTitle = "Lokasi layanan",
                            fallbackMessage = "Peta mengikuti koordinat order dari server."
                        )
                        Surface(
                            modifier = Modifier.align(Alignment.BottomStart).padding(10.dp),
                            color = Color.White.copy(alpha = 0.94f),
                            shape = TembusComponentDefaults.chipShape()
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(Icons.Default.Navigation, contentDescription = null, tint = Primary, modifier = Modifier.size(16.dp))
                                Text("$distanceLabel • $etaLabel", color = Color(0xFF111713), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Color.White,
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, TambalOfferBorder)
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Pendapatan Bersih Mitra", color = TambalOfferMuted, style = MaterialTheme.typography.bodySmall)
                            Text(netEarnings, color = TambalOfferGreen, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black)
                        }
                        Surface(color = TambalOfferGreenSoft, shape = TembusComponentDefaults.chipShape()) {
                            Text("Tarif server", modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp), color = TambalOfferGreen, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        TambalOfferMetric(Icons.Default.Route, distanceLabel, Modifier.weight(1f))
                        TambalOfferMetric(Icons.Default.Schedule, etaLabel, Modifier.weight(1f))
                        TambalOfferMetric(Icons.Default.Sync, "Sync", Modifier.weight(1f))
                    }
                    Surface(color = TambalOfferCanvas, shape = RoundedCornerShape(11.dp)) {
                        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.LockClock, contentDescription = null, tint = TambalOfferGreen, modifier = Modifier.size(18.dp))
                            Text("Pendapatan dan detail layanan dikunci server sebelum diterima.", color = TambalOfferMuted, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Color.White,
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, TambalOfferBorder)
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (order.customerPhotoUrl.isNotBlank()) {
                            AsyncImage(
                                model = ImageRequest.Builder(context).data(order.customerPhotoUrl).crossfade(true).build(),
                                contentDescription = "Foto $customerName",
                                modifier = Modifier.size(46.dp).clip(CircleShape),
                                contentScale = ContentScale.Crop
                            )
                        } else {
                            Surface(color = TambalOfferGreenSoft, shape = CircleShape) {
                                Icon(Icons.Default.Person, contentDescription = null, tint = TambalOfferGreen, modifier = Modifier.padding(11.dp).size(24.dp))
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(customerName, color = Color(0xFF111713), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Black)
                            Text(vehicleLabel, color = TambalOfferMuted, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Surface(color = TambalOfferOrangeTint, shape = TembusComponentDefaults.chipShape()) {
                            Icon(Icons.Default.TireRepair, contentDescription = null, tint = TambalOfferOrange, modifier = Modifier.padding(9.dp).size(20.dp))
                        }
                    }
                    Surface(color = TambalOfferGreenSoft, shape = RoundedCornerShape(11.dp)) {
                        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.TireRepair, contentDescription = null, tint = TambalOfferOrange, modifier = Modifier.size(19.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Kondisi kerusakan", color = TambalOfferMuted, style = MaterialTheme.typography.labelSmall)
                                Text(damageLabel, color = Color(0xFF111713), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Color.White,
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, TambalOfferBorder)
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        Icon(Icons.Default.PhotoCamera, contentDescription = null, tint = TambalOfferGreen, modifier = Modifier.size(18.dp))
                        Text("Foto lokasi & ban", color = Color(0xFF111713), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Black)
                        Surface(color = TambalOfferCanvas, shape = TembusComponentDefaults.chipShape()) {
                            Text("${photoUrls.size} foto", modifier = Modifier.padding(horizontal = 7.dp, vertical = 4.dp), color = TambalOfferMuted, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                    if (photoUrls.isNotEmpty()) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            photoUrls.forEachIndexed { index, url ->
                                AsyncImage(
                                    model = ImageRequest.Builder(context).data(url).crossfade(true).build(),
                                    contentDescription = "Foto kondisi ${index + 1}",
                                    modifier = Modifier.weight(1f).height(110.dp).clip(RoundedCornerShape(11.dp)),
                                    contentScale = ContentScale.Crop
                                )
                            }
                        }
                    } else {
                        Surface(color = TambalOfferCanvas, shape = RoundedCornerShape(11.dp)) {
                            Text("Customer belum mengirim foto kondisi. Konfirmasi ulang saat tiba di lokasi.", modifier = Modifier.padding(11.dp), color = TambalOfferMuted, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Color.White,
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, TambalOfferBorder)
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Rute penanganan darurat", color = Color(0xFF111713), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Black)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Surface(modifier = Modifier.size(13.dp), color = TambalOfferGreen, shape = CircleShape) {}
                            Box(modifier = Modifier.width(2.dp).height(38.dp).background(TambalOfferGreen.copy(alpha = 0.25f)))
                            Surface(modifier = Modifier.size(13.dp), color = TambalOfferOrange, shape = CircleShape) {}
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            Column {
                                Text("Posisi Anda sekarang", color = TambalOfferMuted, style = MaterialTheme.typography.labelSmall)
                                Text("Menuju lokasi layanan", color = Color(0xFF111713), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                            }
                            Column {
                                Text("TKP penanganan ban", color = TambalOfferOrange, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                Text(order.pickupAddress.ifBlank { "Alamat lokasi layanan sedang disinkronkan" }, color = Color(0xFF111713), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            if (specificationItems.isNotEmpty()) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = Color.White,
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, TambalOfferBorder)
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Spesifikasi & standar peralatan", color = Color(0xFF111713), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Black)
                        specificationItems.forEach { item ->
                            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.Default.CheckBox, contentDescription = null, tint = Success, modifier = Modifier.size(18.dp))
                                Text(item, color = Color(0xFF111713), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                            }
                        }
                    }
                }
            }

            if (acceptBlocked) {
                Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(11.dp)) {
                    Text(blockedReason, modifier = Modifier.padding(11.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                }
            }

            Button(
                onClick = onAccept,
                enabled = actionEnabled,
                modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = RoundedCornerShape(999.dp),
                colors = ButtonDefaults.buttonColors(containerColor = TambalOfferOrange, contentColor = Color.White, disabledContainerColor = Color(0xFFD7DCD8), disabledContentColor = TambalOfferMuted)
            ) {
                Icon(Icons.Default.TaskAlt, contentDescription = null, modifier = Modifier.size(21.dp))
                Spacer(Modifier.width(8.dp))
                Text("Terima $serviceLabel ($netEarnings)", fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.width(5.dp))
                Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(19.dp))
            }
            OutlinedButton(
                onClick = onReject,
                enabled = !expired,
                modifier = Modifier.fillMaxWidth().height(46.dp),
                shape = RoundedCornerShape(999.dp),
                border = BorderStroke(1.dp, TambalOfferBorder),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = TambalOfferMuted)
            ) {
                Icon(Icons.Default.Cancel, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(7.dp))
                Text("Tolak tawaran", fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(6.dp))
                Surface(color = TambalOfferGreenSoft, shape = TembusComponentDefaults.chipShape()) {
                    Text("Bebas penalti", modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp), color = TambalOfferGreen, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun TambalOfferMetric(
    icon: ImageVector,
    value: String,
    modifier: Modifier = Modifier
) {
    Surface(modifier = modifier, color = TambalOfferGreenSoft, shape = RoundedCornerShape(10.dp)) {
        Row(modifier = Modifier.padding(horizontal = 8.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Icon(icon, contentDescription = null, tint = TambalOfferGreen, modifier = Modifier.size(16.dp))
            Text(value, color = Color(0xFF111713), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

private val TambalOfferCanvas = Color(0xFFF7F8F6)
private val TambalOfferGreen = Color(0xFF003A20)
private val TambalOfferGreenSoft = Color(0xFFE6F0E8)
private val TambalOfferMint = Color(0xFF96F7B5)
private val TambalOfferOrange = Color(0xFFFF6A00)
private val TambalOfferOrangeTint = Color(0xFFFFF0E6)
private val TambalOfferBorder = Color(0xFFDDE3DE)
private val TambalOfferMuted = Color(0xFF69736C)

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
    val remainingSeconds = offerRemainingSeconds(expiresAt, now)
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
                .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.62f))
                .padding(horizontal = 28.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface, TembusComponentDefaults.sheetShape())
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.24f), TembusComponentDefaults.sheetShape())
                    .padding(TembusSpacing.Large),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "Pesanan baru",
                    color = MaterialTheme.colorScheme.onSurface,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Black
                )
                Text(
                    text = "Waktu tersisa: $remainingSeconds detik",
                    color = if (remainingSeconds <= 5) MaterialTheme.colorScheme.error else LogisticsOrange,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp),
                    color = LogisticsOrange,
                    trackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.18f)
                )

                OfferServiceFacts(order = order)

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Jarak", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.titleSmall)
                    Text(order.distance.ifBlank { "Jarak dihitung" }, color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Pendapatan bersih", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.titleSmall)
                    Text(order.estimatedNetEarningsIdr().toRupiahCompact(), color = LogisticsOrange, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                }

                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = TembusComponentDefaults.cardShape(),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.24f))
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        OfferRouteRow(
                            icon = Icons.Default.LocationOn,
                            label = if (order.isMaintenanceService()) "Lokasi layanan" else "Titik Jemput",
                            value = order.pickupAddress.ifBlank {
                                if (order.isMaintenanceService()) "Alamat lokasi layanan sedang disinkronkan" else "Alamat jemput sedang disinkronkan"
                            }
                        )
                        if (!order.isMaintenanceService()) {
                            OfferRouteRow(
                                icon = Icons.Default.Place,
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
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = TembusComponentDefaults.cardShape()
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
                            routeColor = LogisticsOrange,
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
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    thumbColor = LogisticsOrange,
                    textColor = MaterialTheme.colorScheme.onSurfaceVariant,
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
                    shape = TembusComponentDefaults.buttonShape(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.52f))
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
 * Swipe gesture pada offer card (drag dari kiri ke kanan).
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
