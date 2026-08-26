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
internal fun OnDemandNavigationModeCard(
    order: Order,
    targetIsPickup: Boolean,
    routePreview: CourierRoutePreview?,
    activeRoutePlan: CourierActiveRoutePlan?,
    navigationModeActive: Boolean,
    onStartNavigation: () -> Unit,
    onStopNavigation: () -> Unit,
    onOpenExternalMaps: (String, LatLng?) -> Unit,
    onOpenDelivery: (Order) -> Unit
) {
    val targetStopType = if (targetIsPickup) "pickup" else "dropoff"

    // ===== SOFT-GATE ARRIVAL (maintenance service only, standar industri 100m) =====
    val context = LocalContext.current
    val isArriveAction = navigationModeActive && targetIsPickup && order.isMaintenanceService()
    val targetGatePoint = if (isArriveAction) {
        latLngOrNull(order.pickupLatitude, order.pickupLongitude)
    } else null
    var distanceM by remember(order.orderId) { mutableStateOf<Int?>(null) }
    var overrideArrival by remember(order.orderId) { mutableStateOf(false) }
    LaunchedEffect(order.orderId, targetGatePoint) {
        if (targetGatePoint != null) {
            while (isActive) {
                distanceM = currentDistanceMeters(context, targetGatePoint.latitude, targetGatePoint.longitude)
                delay(3_000)
            }
        }
    }
    val withinArrivalRadius = distanceM != null && distanceM!! <= ARRIVAL_RADIUS_M
    val arrivalGateBlocked = isArriveAction && !overrideArrival && !withinArrivalRadius
    // ===== END SOFT-GATE =====

    val targetPoint = if (targetIsPickup) {
        latLngOrNull(order.pickupLatitude, order.pickupLongitude)
    } else {
        latLngOrNull(order.dropLatitude, order.dropLongitude)
    }
    val targetAddressFallback = if (targetIsPickup) {
        if (order.isMaintenanceService()) "Alamat lokasi layanan sedang disinkronkan" else "Alamat pickup sedang disinkronkan"
    } else {
        if (order.isMaintenanceService()) "Alamat lokasi layanan sedang disinkronkan" else "Alamat penerima sedang disinkronkan"
    }
    val activeStops = activeRoutePlan?.stops.orEmpty()
    val activeStopIndex = activeStops.indexOfFirst { stop ->
        stop.orderId == order.orderId && stop.stopType.equals(targetStopType, ignoreCase = true)
    }
    val activeStop = activeStops.getOrNull(activeStopIndex)
    val targetAddress = activeStop?.address?.takeIf { it.isNotBlank() } ?: targetAddressFallback
    val targetNavigationPoint = activeStop
        ?.let { stop -> latLngOrNull(stop.latitude, stop.longitude) }
        ?: targetPoint
    val hasMultiStopPlan = activeStops.size > 1 && activeStopIndex >= 0
    val isMaintenanceService = order.isMaintenanceService()
    val targetLabel = when {
        hasMultiStopPlan -> "Stop ${activeStopIndex + 1}/${activeStops.size}"
        targetIsPickup -> if (isMaintenanceService) "Lokasi layanan" else "Pickup"
        else -> if (isMaintenanceService) "Lokasi layanan" else "Penerima"
    }
    val pickupModeTitle = when {
        isMaintenanceService -> "Mode menuju lokasi ${order.serviceName ?: "layanan"}"
        else -> "Mode jemput paket"
    }
    val deliveryModeTitle = when {
        isMaintenanceService -> "Mode menuju lokasi ${order.serviceName ?: "layanan"}"
        else -> "Mode antar ke penerima"
    }
    val navigationTitleDynamic = when {
        navigationModeActive -> "Navigasi TEMBUS aktif"
        hasMultiStopPlan -> "Stop berikutnya"
        targetIsPickup -> pickupModeTitle
        else -> deliveryModeTitle
    }
    val primaryActionText = when {
        navigationModeActive && targetIsPickup -> if (isMaintenanceService) "Saya di lokasi" else "Saya di pickup"
        navigationModeActive -> if (isMaintenanceService) "Saya di lokasi tujuan" else "Saya di tujuan"
        hasMultiStopPlan -> "Mulai stop"
        targetIsPickup -> if (isMaintenanceService) "Mulai ke lokasi" else "Mulai ke pickup"
        else -> if (isMaintenanceService) "Mulai ke lokasi tujuan" else "Mulai ke penerima"
    }
    val supportCopy = if (navigationModeActive) {
        "TEMBUS menjaga rute dan stop aktif di layar ini. Gunakan Maps hanya jika butuh panduan suara."
    } else {
        if (isMaintenanceService) {
            "Mulai navigasi di TEMBUS supaya perjalanan ke lokasi layanan dan bukti kerja tetap dalam satu alur."
        } else {
            "Mulai navigasi di TEMBUS supaya pickup, pengantaran, dan bukti kerja tetap dalam satu alur."
        }
    }
    val routeDistanceText = when {
        isMaintenanceService && order.distance.isNotBlank() -> order.distance
        activeRoutePlan != null && activeRoutePlan.totalDistanceKm > 0.0 -> String.format("%.1f km", activeRoutePlan.totalDistanceKm)
        routePreview != null && routePreview.distanceKm > 0.0 -> String.format("%.1f km", routePreview.distanceKm)
        order.distance.isNotBlank() -> order.distance
        else -> "Jarak dihitung"
    }
    val etaText = when {
        activeRoutePlan != null && activeRoutePlan.totalEtaMinutes > 0 -> "ETA ${activeRoutePlan.totalEtaMinutes} mnt"
        routePreview != null && routePreview.etaMinutes > 0 -> "ETA ${routePreview.etaMinutes} mnt"
        order.serviceMaxEtaMinutes > 0 -> "SLA ${order.serviceMaxEtaMinutes} mnt"
        else -> "ETA sinkron"
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = CourierPanel.copy(alpha = 0.97f),
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 12.dp
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(color = LogisticsOrange, shape = RoundedCornerShape(12.dp)) {
                    Icon(
                        imageVector = if (targetIsPickup) Icons.Default.Storefront else Icons.Default.Navigation,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.padding(10.dp).size(22.dp)
                    )
                }
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(
                        navigationTitleDynamic,
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        if (isMaintenanceService) order.displayServiceName()
                        else "${order.displayServiceName()} • ${order.packageCount.coerceAtLeast(1)} paket",
                        style = MaterialTheme.typography.labelMedium,
                        color = Color.White.copy(alpha = 0.68f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Surface(color = Color.White.copy(alpha = 0.12f), shape = RoundedCornerShape(10.dp)) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            order.estimatedNetEarningsIdr().toRupiahCompact(),
                            modifier = Modifier.padding(start = 9.dp, top = 5.dp, end = 9.dp),
                            color = LogisticsOrange,
                            fontWeight = FontWeight.Black,
                            style = MaterialTheme.typography.labelMedium
                        )
                        if (order.isMaintenanceService()) {
                            Text(
                                "Pendapatan bersih",
                                modifier = Modifier.padding(start = 9.dp, bottom = 5.dp, end = 9.dp),
                                color = Color.White.copy(alpha = 0.50f),
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                    }
                }
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Color.White.copy(alpha = 0.08f),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.10f))
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Surface(color = Color.White.copy(alpha = 0.12f), shape = RoundedCornerShape(10.dp)) {
                        Icon(
                            if (targetIsPickup) Icons.Default.Storefront else Icons.Default.LocationOn,
                            contentDescription = null,
                            tint = LogisticsOrange,
                            modifier = Modifier.padding(8.dp).size(18.dp)
                        )
                    }
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(targetLabel, color = Color.White.copy(alpha = 0.68f), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        Text(targetAddress, color = Color.White, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OnDemandNavigationStatusChip(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Default.Route,
                    label = routeDistanceText
                )
                OnDemandNavigationStatusChip(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Default.Schedule,
                    label = etaText
                )
                OnDemandNavigationStatusChip(
                    modifier = Modifier.weight(1f),
                    icon = if (activeRoutePlan?.trafficAware == true) Icons.Default.VerifiedUser else Icons.Default.Sync,
                    label = if (activeRoutePlan?.trafficAware == true) "Traffic" else "Sync"
                )
            }

            Text(
                supportCopy,
                color = Color.White.copy(alpha = 0.70f),
                style = MaterialTheme.typography.bodySmall
            )

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = {
                        if (navigationModeActive) {
                            onOpenDelivery(order)
                        } else {
                            onStartNavigation()
                        }
                    },
                    modifier = Modifier.weight(1.18f).height(50.dp),
                    shape = RoundedCornerShape(12.dp),
                    enabled = !arrivalGateBlocked,
                    colors = ButtonDefaults.buttonColors(containerColor = LogisticsOrange, contentColor = Color.White),
                    contentPadding = PaddingValues(horizontal = 10.dp)
                ) {
                    Icon(
                        if (navigationModeActive) Icons.Default.TaskAlt else Icons.Default.NearMe,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(7.dp))
                    Text(primaryActionText, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                OutlinedButton(
                    onClick = { onOpenExternalMaps(targetAddress, targetNavigationPoint) },
                    modifier = Modifier.weight(0.82f).height(50.dp),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, LogisticsOrange.copy(alpha = 0.64f)),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = LogisticsOrange),
                    contentPadding = PaddingValues(horizontal = 10.dp)
                ) {
                    Icon(Icons.Default.Map, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(7.dp))
                    Text("Buka Maps", fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }

            if (arrivalGateBlocked) {
                Spacer(Modifier.height(6.dp))
                if (distanceM == null) {
                    Text(
                        "Mengecek jarak ke lokasi layanan...",
                        fontSize = 13.sp,
                        color = Color.White.copy(alpha = 0.8f)
                    )
                } else {
                    Text(
                        "Kamu masih ${distanceM}m dari lokasi layanan. Dekati titik (maks. 100m) atau konfirmasi manual.",
                        fontSize = 13.sp,
                        color = Color.White.copy(alpha = 0.8f)
                    )
                }
                TextButton(
                    onClick = { overrideArrival = true },
                    modifier = Modifier.align(Alignment.End)
                ) {
                    Text("Konfirmasi manual", color = LogisticsOrange, fontWeight = FontWeight.Bold)
                }
            }

            if (navigationModeActive) {
                TextButton(
                    onClick = onStopNavigation,
                    modifier = Modifier.align(Alignment.End)
                ) {
                    Text("Keluar mode navigasi", color = Color.White.copy(alpha = 0.76f), fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

