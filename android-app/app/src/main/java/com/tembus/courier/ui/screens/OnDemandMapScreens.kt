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
internal fun OnDemandBottomNavigation(
    selectedTab: Int,
    offerCount: Int,
    onSelectTab: (Int) -> Unit
) {
    NavigationBar(containerColor = PrimaryDark, contentColor = Color.White) {
        NavigationBarItem(
            icon = { Icon(Icons.Default.Map, contentDescription = "Peta") },
            label = { Text("Peta") },
            selected = selectedTab == 0,
            onClick = { onSelectTab(0) },
            colors = onDemandNavigationItemColors()
        )
        NavigationBarItem(
            icon = {
                BadgedBox(
                    badge = {
                        if (offerCount > 0) {
            Badge(containerColor = LogisticsOrange, contentColor = Color.White) {
                                Text(offerCount.toString())
                            }
                        }
                    }
                ) {
                    Icon(Icons.Default.History, contentDescription = "Riwayat")
                }
            },
            label = { Text("Riwayat") },
            selected = selectedTab == 1,
            onClick = { onSelectTab(1) },
            colors = onDemandNavigationItemColors()
        )
        NavigationBarItem(
            icon = { Icon(Icons.Default.AccountBalanceWallet, contentDescription = "Dompet") },
            label = { Text("Dompet") },
            selected = selectedTab == 2,
            onClick = { onSelectTab(2) },
            colors = onDemandNavigationItemColors()
        )
        NavigationBarItem(
            icon = { Icon(Icons.Default.Person, contentDescription = "Profil") },
            label = { Text("Profil") },
            selected = selectedTab == 3,
            onClick = { onSelectTab(3) },
            colors = onDemandNavigationItemColors()
        )
    }
}

@Composable
internal fun onDemandNavigationItemColors(): NavigationBarItemColors =
    NavigationBarItemDefaults.colors(
        selectedIconColor = LogisticsOrange,
        selectedTextColor = Color.White,
        indicatorColor = LogisticsOrange.copy(alpha = 0.22f),
        unselectedIconColor = Color.White.copy(alpha = 0.66f),
        unselectedTextColor = Color.White.copy(alpha = 0.66f)
    )

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
                        Icon(Icons.Default.GpsFixed, contentDescription = "Lokasi saya")
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

@Composable
internal fun OnDemandServiceActivationCard(
    serviceItems: List<CourierServiceProduct>,
    activeServiceCount: Int,
    capabilityByCode: Map<String, CourierServiceCapability>,
    disabledServiceCodes: Set<String>,
    vehicleGroup: String,
    isServiceCatalogLoading: Boolean,
    expanded: Boolean,
    onToggleExpanded: () -> Unit,
    onServiceEnabledChange: (CourierServiceProduct, Boolean) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = CourierPanel,
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 8.dp
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Surface(color = LogisticsOrange.copy(alpha = 0.18f), shape = RoundedCornerShape(12.dp)) {
                    Icon(Icons.Default.Tune, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.padding(9.dp).size(20.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Layanan aktif", color = Color.White, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleSmall)
                    Text(
                        if (isServiceCatalogLoading) {
                            "Memuat layanan aktif..."
                        } else if (serviceItems.isEmpty()) {
                            "Layanan ${vehicleGroup.toVehicleLabel()} sedang disinkronkan"
                        } else {
                            "$activeServiceCount dari ${serviceItems.size} layanan ${vehicleGroup.toVehicleLabel()}"
                        },
                        color = Color.White.copy(alpha = 0.68f),
                        style = MaterialTheme.typography.labelMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                TextButton(onClick = onToggleExpanded) {
                    Text(if (expanded) "Tutup" else "Atur", color = LogisticsOrange, fontWeight = FontWeight.Bold)
                }
            }

            AnimatedVisibility(visible = expanded) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (serviceItems.isEmpty()) {
                        Text(
                            "Layanan mengikuti profil kendaraan operasional.",
                            color = Color.White.copy(alpha = 0.72f),
                            style = MaterialTheme.typography.labelMedium
                        )
                    } else {
                        serviceItems.forEach { service ->
                            val capability = capabilityByCode[service.code]
                            val enabledByCapability = capability?.status?.equals("enabled", ignoreCase = true) ?: true
                            val enabled = enabledByCapability && service.code !in disabledServiceCodes
                            OnDemandServiceToggleRow(
                                service = service,
                                enabled = enabled,
                                lockedByAdmin = !enabledByCapability,
                                onEnabledChange = { checked ->
                                    if (enabledByCapability) onServiceEnabledChange(service, checked)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun OnDemandMapDispatchCockpit(
    isOnline: Boolean,
    offerCount: Int,
    activeServiceCount: Int,
    serviceCount: Int,
    vehicleLabel: String,
    leadingOffer: Order?,
    serviceItems: List<CourierServiceProduct>,
    capabilityByCode: Map<String, CourierServiceCapability>,
    disabledServiceCodes: Set<String>,
    isServiceCatalogLoading: Boolean,
    servicePanelExpanded: Boolean,
    onToggleServicePanel: () -> Unit,
    onServiceEnabledChange: (CourierServiceProduct, Boolean) -> Unit,
    onViewOrders: () -> Unit
) {
    var isMinimized by rememberSaveable { mutableStateOf(false) }
    val haptic = LocalHapticFeedback.current

    Surface(
        modifier = Modifier.fillMaxWidth().animateContentSize(
            animationSpec = spring(
                dampingRatio = 0.8f,
                stiffness = 400f
            )
        ),
        color = Color.White.copy(alpha = 0.96f),
        shape = RoundedCornerShape(if (isMinimized) 50.dp else 18.dp),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.12f)),
        shadowElevation = if (isMinimized) 6.dp else 10.dp
    ) {
        if (isMinimized) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { 
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        isMinimized = false 
                    }
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
                    val alpha by infiniteTransition.animateFloat(
                        initialValue = 0.3f,
                        targetValue = 1f,
                        animationSpec = infiniteRepeatable(
                            animation = tween(1000),
                            repeatMode = RepeatMode.Reverse
                        ),
                        label = "pulseAlpha"
                    )
                    
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .clip(CircleShape)
                            .background(if (isOnline) Success.copy(alpha = alpha) else MaterialTheme.colorScheme.outlineVariant)
                    )
                    
                    Text(
                        text = if (isOnline) "Mencari order di sekitar..." else "Duty Nonaktif",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = DeepForest
                    )
                }
                
                Surface(
                    color = PrimaryLight.copy(alpha = 0.3f),
                    shape = CircleShape
                ) {
                    Icon(
                        imageVector = Icons.Default.ExpandLess,
                        contentDescription = "Expand",
                        tint = Primary,
                        modifier = Modifier.padding(4.dp).size(20.dp)
                    )
                }
            }
        } else {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Surface(
                        color = if (isOnline) Success.copy(alpha = 0.12f) else PrimaryLight.copy(alpha = 0.72f),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(
                            imageVector = if (isOnline) Icons.Default.NearMe else Icons.Default.Map,
                            contentDescription = null,
                            tint = if (isOnline) Success else Primary,
                            modifier = Modifier.padding(10.dp).size(22.dp)
                        )
                    }
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(
                            text = if (isOnline) "Siap menerima order" else "Belum aktif",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Black,
                            color = DeepForest
                        )
                        Text(
                            text = if (isOnline) {
                                "Tawaran akan muncul otomatis saat ada order terdekat."
                            } else {
                                "Peta tetap menampilkan posisi kamu. Aktifkan duty saat siap bekerja."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        IconButton(
                            onClick = { 
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                isMinimized = true 
                            },
                            modifier = Modifier.size(28.dp).padding(bottom = 4.dp)
                        ) {
                            Icon(
                                Icons.Default.ExpandMore,
                                contentDescription = "Minimize",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        TextButton(onClick = onViewOrders, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp), modifier = Modifier.height(32.dp)) {
                            Text("Order", color = Primary, fontWeight = FontWeight.Black)
                        }
                    }
                }

            if (leadingOffer != null) {
                val context = LocalContext.current
                OnDemandIncomingOfferSwipePanel(
                    order = leadingOffer,
                    onAccept = { acceptOrderViaReceiver(context, leadingOffer) },
                    onReject = { rejectOrderViaReceiver(context, leadingOffer) }
                )
            } else {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, Primary.copy(alpha = 0.08f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(8.dp)) {
                            Icon(
                                if (isOnline) Icons.Default.Radar else Icons.Default.Schedule,
                                contentDescription = null,
                                tint = Primary,
                                modifier = Modifier.padding(8.dp).size(18.dp)
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                if (isOnline) "Menunggu order di sekitar kamu" else "Aktifkan duty untuk mulai",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Black,
                                color = DeepForest
                            )
                            Text(
                                if (isOnline) "Tidak perlu refresh manual." else "Tracking order aktif setelah duty menyala.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OnDemandCompactStatusItem(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Default.TwoWheeler,
                    title = "Layanan",
                    value = if (serviceCount <= 0) {
                        if (vehicleLabel == "belum tersinkron") "Belum sync" else "$vehicleLabel tersinkron"
                    } else "$activeServiceCount/$serviceCount $vehicleLabel"
                )
                OnDemandCompactStatusItem(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Default.Bolt,
                    title = "Tawaran",
                    value = if (offerCount > 0) "$offerCount menunggu" else "Belum ada"
                )
                TextButton(onClick = onToggleServicePanel) {
                    Text(if (servicePanelExpanded) "Tutup" else "Atur", color = Primary, fontWeight = FontWeight.Black)
                }
            }

            AnimatedVisibility(visible = servicePanelExpanded) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = CourierPanel,
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        if (isServiceCatalogLoading) {
                            Text(
                                "Memuat layanan operasional...",
                                color = Color.White.copy(alpha = 0.68f),
                                style = MaterialTheme.typography.labelMedium
                            )
                        } else if (serviceItems.isEmpty()) {
                            Text(
                                "Layanan akan muncul setelah profil kendaraan tersinkron.",
                                color = Color.White.copy(alpha = 0.72f),
                                style = MaterialTheme.typography.labelMedium
                            )
                        } else {
                            serviceItems.forEach { service ->
                                val capability = capabilityByCode[service.code]
                                val enabledByCapability = capability?.status?.equals("enabled", ignoreCase = true) ?: true
                                val enabled = enabledByCapability && service.code !in disabledServiceCodes
                                OnDemandServiceToggleRow(
                                    service = service,
                                    enabled = enabled,
                                    lockedByAdmin = !enabledByCapability,
                                    onEnabledChange = { checked ->
                                        if (enabledByCapability) onServiceEnabledChange(service, checked)
                                    }
                                )
                            }
                        }
                    }
                }
            }
            }
        }
    }
}

@Composable
internal fun OnDemandMapMetricPill(
    modifier: Modifier = Modifier,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    highlighted: Boolean
) {
    Surface(
        modifier = modifier,
        color = if (highlighted) LogisticsOrange.copy(alpha = 0.12f) else PrimaryLight.copy(alpha = 0.54f),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, if (highlighted) LogisticsOrange.copy(alpha = 0.26f) else Primary.copy(alpha = 0.10f))
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Icon(icon, contentDescription = null, tint = if (highlighted) LogisticsOrange else Primary, modifier = Modifier.size(14.dp))
                Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text(value, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Black, color = DeepForest)
        }
    }
}

@Composable
internal fun OnDemandCompactStatusItem(
    modifier: Modifier = Modifier,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    value: String
) {
    Surface(
        modifier = modifier,
        color = PrimaryLight.copy(alpha = 0.42f),
        shape = RoundedCornerShape(10.dp),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.10f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.size(17.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(value, style = MaterialTheme.typography.labelMedium, color = DeepForest, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
internal fun OnDemandIncomingOfferSwipePanel(order: Order, onAccept: () -> Unit, onReject: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(24.dp),
        shadowElevation = 8.dp
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(color = LogisticsOrange.copy(alpha = 0.12f), shape = CircleShape) {
                    Icon(Icons.Default.Bolt, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.padding(12.dp).size(24.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        if (order.isMaintenanceService()) "Pekerjaan ${order.displayServiceName()} Baru!" else "Pekerjaan On-Demand Baru!",
                        style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = DeepForest
                    )
                    Text(
                        "${order.displayServiceName()} • ${order.estimatedNetEarningsIdr().toRupiahCompact()}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            
            // Details
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Place, contentDescription = null, tint = Primary, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(order.pickupAddress, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Navigation, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(order.dropAddress, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }

            BidirectionalSwipeSlider(
                onAccept = onAccept,
                onReject = onReject
            )
        }
    }
}

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

@Composable
internal fun OnDemandNavigationStatusChip(
    modifier: Modifier = Modifier,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String
) {
    Surface(
        modifier = modifier,
        color = Color.White.copy(alpha = 0.08f),
        shape = RoundedCornerShape(10.dp),
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.10f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(icon, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.size(15.dp))
            Text(label, color = Color.White, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
internal fun OnDemandNavigationRequirement(
    modifier: Modifier = Modifier,
    done: Boolean,
    label: String
) {
    Surface(
        modifier = modifier,
        color = if (done) Success.copy(alpha = 0.14f) else Color.White.copy(alpha = 0.08f),
        shape = RoundedCornerShape(10.dp),
        border = BorderStroke(1.dp, if (done) Success.copy(alpha = 0.38f) else Color.White.copy(alpha = 0.10f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                if (done) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                contentDescription = null,
                tint = if (done) Success else Color.White.copy(alpha = 0.62f),
                modifier = Modifier.size(15.dp)
            )
            Text(label, color = Color.White, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
internal fun OnDemandServiceToggleRow(
    service: CourierServiceProduct,
    enabled: Boolean,
    lockedByAdmin: Boolean,
    onEnabledChange: (Boolean) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color.White.copy(alpha = 0.08f),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.10f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(
                modifier = Modifier.size(10.dp),
                color = if (enabled) Success else Color.White.copy(alpha = 0.28f),
                shape = RoundedCornerShape(50)
            ) {}
            Column(modifier = Modifier.weight(1f)) {
                Text(service.name, color = Color.White, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    if (lockedByAdmin) "Dikunci operasional" else "ETA maks ${service.maxEtaMinutes.takeIf { it > 0 } ?: 240} menit",
                    color = Color.White.copy(alpha = 0.62f),
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Switch(
                checked = enabled,
                onCheckedChange = onEnabledChange,
                enabled = !lockedByAdmin,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = LogisticsOrange,
                    uncheckedThumbColor = Color.White,
                    uncheckedTrackColor = Color.White.copy(alpha = 0.22f)
                )
            )
        }
    }
}

@Composable
internal fun OnDemandActiveOrderCard(
    order: Order,
    onOpenDelivery: (Order) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = CourierPanel,
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 10.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Surface(color = Success.copy(alpha = 0.18f), shape = RoundedCornerShape(12.dp)) {
                Icon(Icons.Default.Navigation, contentDescription = null, tint = Success, modifier = Modifier.padding(10.dp).size(22.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text("Order aktif", color = Color.White.copy(alpha = 0.72f), style = MaterialTheme.typography.labelMedium)
                Text(order.pickupAddress.ifBlank { order.displayServiceName() }, color = Color.White, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(order.estimatedNetEarningsIdr().toRupiahCompact(), color = LogisticsOrange, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            }
            Button(
                onClick = { onOpenDelivery(order) },
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = Color.White)
            ) {
                Text("Buka", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
internal fun ActiveRoutePlanCard(
    activeRoutePlan: CourierActiveRoutePlan,
    onViewOrders: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = CourierPanel.copy(alpha = 0.96f),
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 10.dp
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Surface(color = LogisticsOrange.copy(alpha = 0.18f), shape = RoundedCornerShape(12.dp)) {
                    Icon(Icons.Default.Route, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.padding(10.dp).size(22.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Route plan aktif", color = Color.White, fontWeight = FontWeight.Black)
                    Text(
                        "${activeRoutePlan.stops.size} stop • ${String.format("%.1f", activeRoutePlan.totalDistanceKm)} km • ETA ${activeRoutePlan.totalEtaMinutes} menit",
                        color = Color.White.copy(alpha = 0.68f),
                        style = MaterialTheme.typography.labelMedium
                    )
                }
                Surface(
                    color = if (activeRoutePlan.trafficAware) Success.copy(alpha = 0.18f) else Warning.copy(alpha = 0.18f),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(
                        if (activeRoutePlan.trafficAware) "Traffic" else "Fallback",
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
                        color = if (activeRoutePlan.trafficAware) Success else Warning,
                        fontWeight = FontWeight.Black,
                        style = MaterialTheme.typography.labelSmall
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                activeRoutePlan.stops.take(4).forEachIndexed { index, stop ->
                    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        Surface(
                            modifier = Modifier.size(26.dp),
                            color = if (stop.stopType == "pickup") Primary.copy(alpha = 0.24f) else LogisticsOrange.copy(alpha = 0.22f),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text("${index + 1}", color = Color.White, fontWeight = FontWeight.Black, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                if (stop.stopType == "pickup") "Pickup ${stop.orderNumber ?: stop.orderId.take(8)}" else "Dropoff ${stop.orderNumber ?: stop.orderId.take(8)}",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.labelLarge
                            )
                            Text(
                                "${stop.packageCount} paket • ${stop.address ?: "Alamat sinkron"}",
                                color = Color.White.copy(alpha = 0.62f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                    }
                }
            }

            TextButton(onClick = onViewOrders, modifier = Modifier.align(Alignment.End)) {
                Text("Lihat semua order", color = LogisticsOrange, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
internal fun OnDemandWaitingCard(onViewOrders: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = CourierPanel.copy(alpha = 0.86f),
        shape = RoundedCornerShape(18.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Primary, strokeWidth = 3.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text("Menunggu pesanan terdekat", color = Color.White, fontWeight = FontWeight.Black)
                Text("Tawaran akan muncul otomatis.", color = Color.White.copy(alpha = 0.68f), style = MaterialTheme.typography.labelMedium)
            }
            TextButton(onClick = onViewOrders) {
                Text("Riwayat", color = LogisticsOrange, fontWeight = FontWeight.Bold)
            }
        }
    }
}
