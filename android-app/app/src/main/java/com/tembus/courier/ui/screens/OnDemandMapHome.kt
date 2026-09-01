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
import com.tembus.courier.ui.localization.CourierTextCatalog
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
internal fun OnDemandMapHome(
    modifier: Modifier = Modifier,
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
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val activeRouteNextStop = activeRoutePlan?.stops?.firstOrNull()
    val activeRouteNextOrder = activeRouteNextStop?.let { nextStop ->
        orders.firstOrNull { order ->
            order.orderId == nextStop.orderId && order.status.lowercase() in ACTIVE_ON_DEMAND_STATUSES
        }
    }
    val activeOrder = activeRouteNextOrder ?: orders.firstOrNull {
        it.status.lowercase() in ACTIVE_ON_DEMAND_STATUSES
    }
    var inAppNavigationOrderId by rememberSaveable { mutableStateOf<String?>(null) }
    val inAppNavigationActive = activeOrder != null && inAppNavigationOrderId == activeOrder.orderId
    val leadingOffer = offers.firstOrNull()
    val focusOrder = activeOrder ?: leadingOffer
    var courierLocation by remember { mutableStateOf<LatLng?>(null) }
    var mapFocusOverride by remember { mutableStateOf<LatLng?>(null) }
    var recenterInProgress by remember { mutableStateOf(false) }
    var recenterMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(context) {
        getLastKnownDutyLocation(context)
            ?.toLatLng()
            ?.takeIf { it.isValidNavigationPoint() }
            ?.let { location ->
                courierLocation = location
                if (activeOrder == null && leadingOffer == null) {
                    mapFocusOverride = location
                }
            }
    }

    LaunchedEffect(activeOrder?.orderId) {
        if (activeOrder?.orderId != inAppNavigationOrderId) {
            inAppNavigationOrderId = null
        }
    }

    LaunchedEffect(inAppNavigationActive) {
        while (inAppNavigationActive && isActive) {
            getLastKnownDutyLocation(context)
                ?.toLatLng()
                ?.takeIf { it.isValidNavigationPoint() }
                ?.let { latestLocation ->
                    courierLocation = latestLocation
                    mapFocusOverride = latestLocation
                }
            delay(5_000)
        }
    }

    LaunchedEffect(recenterMessage) {
        if (recenterMessage != null) {
            delay(2_400)
            recenterMessage = null
        }
    }

    LaunchedEffect(mapFocusOverride) {
        if (mapFocusOverride != null) {
            delay(3_000)
            mapFocusOverride = null
        }
    }

    val pickupPoint = focusOrder?.let { order ->
        val lat = order.pickupLatitude
        val lng = order.pickupLongitude
        latLngOrNull(lat, lng)
    }
    val dropPoint = focusOrder?.let { order ->
        val lat = order.dropLatitude
        val lng = order.dropLongitude
        latLngOrNull(lat, lng)
    }
    val plannedRoutePoints = remember(activeRoutePlan) {
        activeRoutePlan?.segments
            ?.flatMap { segment -> decodeRuntimeRoutePolyline(segment.routePolyline) }
            ?.takeIf { it.isNotEmpty() }
            ?: activeRoutePlan?.stops
                ?.mapNotNull { stop -> latLngOrNull(stop.latitude, stop.longitude) }
            ?: emptyList()
    }
    val activeRoutePoints = plannedRoutePoints.ifEmpty {
        activeOrder?.let { order ->
            val preview = routePreviews[order.orderId]
            preview?.let {
                decodeRuntimeRoutePolyline(it.routePolyline ?: it.routeSnapshot?.routePolyline)
                    .ifEmpty { it.polyline.map { point -> LatLng(point.latitude, point.longitude) } }
            }
        }.orEmpty()
    }
    val activeOrderStatus = activeOrder?.status?.lowercase().orEmpty()
    val activeNextStopType = activeRouteNextStop
        ?.takeIf { stop -> stop.orderId == activeOrder?.orderId }
        ?.stopType
        ?.lowercase()
    val navigationTargetIsPickup = activeNextStopType?.let { it == "pickup" }
        ?: (activeOrderStatus == "accepted" || activeOrderStatus == "assigned")
    val navigationTargetPoint = if (navigationTargetIsPickup) {
        pickupPoint ?: dropPoint
    } else {
        dropPoint ?: pickupPoint
    }
    val activeRoutePreview = activeOrder?.let { routePreviews[it.orderId] }
    val leadingRoutePreview = leadingOffer?.let { routePreviews[it.orderId] }
    val offerRoutePoints = if (activeOrder == null && leadingOffer != null) {
        leadingRoutePreview?.let { preview ->
            decodeRuntimeRoutePolyline(preview.routePolyline ?: preview.routeSnapshot?.routePolyline)
                .ifEmpty { preview.polyline.map { point -> LatLng(point.latitude, point.longitude) } }
        }.orEmpty().ifEmpty {
            buildList {
                courierLocation?.let { add(it) }
                pickupPoint?.let { add(it) }
                dropPoint?.let { add(it) }
            }
        }
    } else {
        emptyList()
    }
    val mapMarkers = buildList {
        courierLocation?.let { add(RuntimeMapMarker("courier-location", it, "Lokasi saya")) }
        pickupPoint?.let { add(RuntimeMapMarker("pickup", it, focusOrder.pickupAddress)) }
        dropPoint?.let { add(RuntimeMapMarker("dropoff", it, focusOrder.dropAddress)) }
        hotspots.take(8).forEach { hotspot ->
            val lat = hotspot.latitude
            val lng = hotspot.longitude
            latLngOrNull(lat, lng)?.let { position ->
                add(
                    RuntimeMapMarker(
                        id = "hotspot-${hotspot.code ?: hotspot.name}",
                        position = position,
                        title = hotspot.name,
                        snippet = "${hotspot.pendingOrders} order menunggu"
                    )
                )
            }
        }
    }
    val routePoints = activeRoutePoints.ifEmpty {
        val inAppNavigationRoutePoints = if (inAppNavigationActive) {
            buildList {
                courierLocation?.let { add(it) }
                navigationTargetPoint?.let { add(it) }
            }
        } else {
            emptyList()
        }
        inAppNavigationRoutePoints.ifEmpty {
            offerRoutePoints.ifEmpty {
                buildList {
                    pickupPoint?.let { add(it) }
                    dropPoint?.let { add(it) }
                }
            }
        }
    }
    val mapFocusLocation = when {
        mapFocusOverride != null -> mapFocusOverride
        inAppNavigationActive && courierLocation != null -> courierLocation
        activeOrder != null -> navigationTargetPoint ?: pickupPoint ?: dropPoint
        leadingOffer != null -> pickupPoint ?: dropPoint ?: courierLocation
        courierLocation != null -> courierLocation
        else -> mapMarkers.firstOrNull()?.position
    }
    val vehicleGroup = normalizedVehicleGroup(courierVehicleType)
    val capabilityItems = capabilityProfile?.serviceCapabilities
        ?.filter { it.serviceCategory == "on_demand" }
        .orEmpty()
    val capabilityByCode = capabilityItems.associateBy { it.serviceCode }
    val serviceByCode = services.associateBy { it.code }
    val serviceCatalogReady = capabilityProfile != null || services.isNotEmpty()
    val serviceItems = if (capabilityItems.isNotEmpty()) {
        capabilityItems
            .map { capability -> serviceByCode[capability.serviceCode] ?: capability.toServiceProduct(vehicleGroup) }
            .filter { it.supportsVehicleGroup(vehicleGroup) }
    } else {
        services.filter { it.supportsVehicleGroup(vehicleGroup) }
    }
    var disabledServiceCodesText by rememberSaveable(vehicleGroup) { mutableStateOf("") }
    var servicePanelExpanded by rememberSaveable(vehicleGroup) { mutableStateOf(false) }
    val disabledServiceCodes = remember(disabledServiceCodesText) {
        disabledServiceCodesText.split(",").filter { it.isNotBlank() }.toSet()
    }
    val activeServiceItems = serviceItems.filter { service ->
        val capability = capabilityByCode[service.code]
        val enabledByCapability = capability?.status?.equals("enabled", ignoreCase = true) ?: true
        enabledByCapability && service.code !in disabledServiceCodes
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(CourierMapBase)
    ) {
        RuntimeMapRenderer(
            modifier = Modifier.fillMaxSize(),
            providerConfig = mapsProviderConfig,
            markers = mapMarkers,
            routePoints = routePoints,
            followLocation = mapFocusLocation,
            forceFocus = mapFocusOverride != null || inAppNavigationActive,
            mapUiSettings = MapUiSettings(
                zoomControlsEnabled = false,
                myLocationButtonEnabled = false,
                mapToolbarEnabled = false
            ),
            routeColor = LogisticsOrange,
            fallbackTitle = "Peta operasional",
            fallbackMessage = "Lokasi tampil otomatis setelah GPS, hotspot, atau tawaran aktif tersinkron."
        )

        Surface(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(start = 18.dp, top = 18.dp),
            color = CourierPanel,
            shape = RoundedCornerShape(24.dp),
            shadowElevation = 6.dp
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Surface(
                    modifier = Modifier.size(10.dp),
                    color = if (isOnline) Success else MaterialTheme.colorScheme.error,
                    shape = RoundedCornerShape(50)
                ) {}
                Text(
                    text = if (isOnline) "Online" else "Offline",
                    color = Color.White,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Black
                )
            }
        }

        FilledIconButton(
            onClick = { onOnlineToggle(!isOnline) },
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(end = 18.dp, top = 18.dp)
                .size(64.dp),
            shape = RoundedCornerShape(18.dp),
            colors = IconButtonDefaults.filledIconButtonColors(
                containerColor = if (isOnline) Color(0xFF9B100D) else Primary,
                contentColor = Color.White
            )
        ) {
            Icon(Icons.Default.PowerSettingsNew, contentDescription = if (isOnline) "Nonaktifkan duty" else "Aktifkan duty")
        }

        if (inAppNavigationActive) {
            Surface(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(start = 86.dp, end = 86.dp, top = 102.dp),
                color = CourierPanel.copy(alpha = 0.94f),
                shape = RoundedCornerShape(18.dp),
                shadowElevation = 8.dp
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Surface(color = LogisticsOrange, shape = RoundedCornerShape(10.dp)) {
                        Icon(
                            Icons.Default.Navigation,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.padding(8.dp).size(18.dp)
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Navigasi TEMBUS",
                            color = Color.White,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Black,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            "Ikuti rute dan stop aktif di aplikasi.",
                            color = Color.White.copy(alpha = 0.70f),
                            style = MaterialTheme.typography.labelSmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }

        if (activeOrder == null && leadingOffer == null) {
            Column(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = 18.dp),
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                AnimatedVisibility(
                    visible = recenterMessage != null,
                    enter = fadeIn(),
                    exit = fadeOut()
                ) {
                    Surface(
                        color = CourierPanel.copy(alpha = 0.92f),
                        shape = RoundedCornerShape(14.dp),
                        shadowElevation = 8.dp
                    ) {
                        Text(
                            text = recenterMessage.orEmpty(),
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                            color = Color.White,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                SmallFloatingActionButton(
                    onClick = {
                        if (!recenterInProgress) {
                            scope.launch {
                                recenterInProgress = true
                                val latestLocation = getLastKnownDutyLocation(context)
                                    ?.toLatLng()
                                    ?.takeIf { it.isValidNavigationPoint() }
                                if (latestLocation != null) {
                                    courierLocation = latestLocation
                                    mapFocusOverride = latestLocation
                                    recenterMessage = "Peta dipusatkan ke lokasi kamu."
                                } else {
                                    recenterMessage = "Izinkan lokasi untuk memusatkan peta."
                                }
                                recenterInProgress = false
                            }
                        }
                    },
                    containerColor = Color.White.copy(alpha = 0.96f),
                    contentColor = Primary
                ) {
                    if (recenterInProgress) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = Primary
                        )
                    } else {
                        Icon(Icons.Default.GpsFixed, contentDescription = CourierTextCatalog.translate("Lokasi saya"))
                    }
                }
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(horizontal = 16.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (activeOrder != null) {
                OnDemandNavigationModeCard(
                    order = activeOrder,
                    targetIsPickup = navigationTargetIsPickup,
                    routePreview = activeRoutePreview,
                    activeRoutePlan = activeRoutePlan,
                    navigationModeActive = inAppNavigationActive,
                    onStartNavigation = {
                        inAppNavigationOrderId = activeOrder.orderId
                        mapFocusOverride = courierLocation ?: navigationTargetPoint
                    },
                    onStopNavigation = { inAppNavigationOrderId = null },
                    onOpenExternalMaps = { address, point -> openCourierMapNavigation(context, address, point) },
                    onOpenDelivery = onOpenDelivery
                )
            } else {
                OnDemandMapDispatchCockpit(
                    isOnline = isOnline,
                    offerCount = offers.size,
                    activeServiceCount = activeServiceItems.size,
                    serviceCount = serviceItems.size,
                    vehicleLabel = vehicleGroup.toVehicleLabel(),
                    leadingOffer = leadingOffer,
                    serviceItems = serviceItems,
                    capabilityByCode = capabilityByCode,
                    disabledServiceCodes = disabledServiceCodes,
                    isServiceCatalogLoading = !serviceCatalogReady,
                    servicePanelExpanded = servicePanelExpanded,
                    onToggleServicePanel = { servicePanelExpanded = !servicePanelExpanded },
                    onServiceEnabledChange = { service, checked ->
                        val nextCodes = if (checked) {
                            disabledServiceCodes - service.code
                        } else {
                            disabledServiceCodes + service.code
                        }
                        disabledServiceCodesText = nextCodes.sorted().joinToString(",")
                    },
                    onViewOrders = onViewOrders
                )
            }
        }
    }
}
