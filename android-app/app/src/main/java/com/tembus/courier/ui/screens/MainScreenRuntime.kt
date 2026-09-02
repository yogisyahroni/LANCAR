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
import com.tembus.courier.ui.screens.*
import com.tembus.courier.ui.screens.*


@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MainScreenRuntime(
    initialOrderId: String?,
    initialChatOrderId: String?,
    initialInboxOpen: Boolean,
    authSessionManager: AuthSessionManager,
    onConsumedDeepLink: () -> Unit,
    onLogout: () -> Unit,
 ) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val localSecurityManager = remember(context) {
        LocalDeviceSecurityManager(context.applicationContext)
    }
    val localSecuritySettings by localSecurityManager.settings.collectAsState()

    // Real ViewModel backed by Hilt/Room DB
    val orderViewModel: OrderViewModel = hiltViewModel()
    val callEventsViewModel: CallEventsViewModel = hiltViewModel()
    val notificationViewModel: com.tembus.courier.ui.screens.notification.NotificationViewModel = hiltViewModel()

    val allOrders by orderViewModel.allOrders.collectAsState()
    val pendingOrders by orderViewModel.pendingOrders.collectAsState()
    val deliveredToday by orderViewModel.deliveredTodayOrders.collectAsState()
    val onDemandOffers by orderViewModel.offers.collectAsState()
    val onDemandServices by orderViewModel.onDemandServices.collectAsState()
    val onDemandHotspots by orderViewModel.onDemandHotspots.collectAsState()
    val performanceSummary by orderViewModel.performanceSummary.collectAsState()
    val capabilityProfile by orderViewModel.capabilityProfile.collectAsState()
    val earningsLedger by orderViewModel.earningsLedger.collectAsState()
    val payoutSummary by orderViewModel.payoutSummary.collectAsState()
    val payoutRequests by orderViewModel.payoutRequests.collectAsState()
    val isPayoutSubmitting by orderViewModel.isPayoutSubmitting.collectAsState()
    val routePreviews by orderViewModel.routePreviews.collectAsState()
    val activeRoutePlan by orderViewModel.activeRoutePlan.collectAsState()
    val mapsProviderConfig by orderViewModel.mapsProviderConfig.collectAsState()
    val cancelPickupReasons by orderViewModel.cancelPickupReasons.collectAsState()
    val statusTransitions by orderViewModel.statusTransitions.collectAsState()
    val courierProfile by orderViewModel.courierProfile.collectAsState()
    val isSyncing by orderViewModel.isSyncing.collectAsState()
    val syncIntervalMs by orderViewModel.syncIntervalMs.collectAsState()
    val error by orderViewModel.error.collectAsState()
    val lastRemoteSyncAt by orderViewModel.lastRemoteSyncAt.collectAsState()
    
    val unreadNotificationCount by notificationViewModel.unreadCount.collectAsState()

    val courierName by authSessionManager.courierName.collectAsState(initial = null)
    val isOnline by authSessionManager.isOnline.collectAsState(initial = false)
    val lifecycleOwner = LocalLifecycleOwner.current
    // ponytail: single-mode app — non-on_demand retired 2026-08; always on_demand.
    // Upgrade path: restore role inference only if a regular (P2P) courier mode is reintroduced.
    val courierRole = "on_demand"
    val displayCourierName = courierName?.takeIf { it.isNotBlank() } ?: "Profil sedang disinkronkan"
    val courierVehicleType = capabilityProfile?.vehicle?.vehicleType
        ?: capabilityProfile?.vehicles?.firstOrNull { it.verificationStatus.equals("approved", ignoreCase = true) }?.vehicleType
        ?: capabilityProfile?.vehicles?.firstOrNull()?.vehicleType
        ?: ""
    val roleOrders = allOrders.filterByCourierRole(courierRole)
    val rolePendingOrders = pendingOrders.filterByCourierRole(courierRole)
    val roleDeliveredToday = deliveredToday.filterByCourierRole(courierRole)
    val roleEarningsToday = roleDeliveredToday.sumOf { it.cleanPayoutIdr() }.takeIf { it > 0 }
        ?: courierProfile?.todayEarningsIdr
        ?: 0

    val activeOnDemandOrder = roleOrders.firstOrNull {
        it.normalizedWorkflowRole() == "on_demand" &&
            it.status.lowercase() in setOf("accepted", "picked_up", "in_transit")
    }

    LaunchedEffect(activeOnDemandOrder?.orderId) {
        val activeOrderId = activeOnDemandOrder?.orderId?.takeIf { it.isNotBlank() } ?: return@LaunchedEffect
        if (!routePreviews.containsKey(activeOrderId)) {
            orderViewModel.loadRoutePreview(activeOrderId)
        }
    }

    val selectedTabState = remember { mutableStateOf(0) }
    var selectedTab by selectedTabState
    val routeStateState = rememberSaveable(stateSaver = CourierRouteStateSaver) {
        mutableStateOf(CourierRouteState())
    }
    var routeState by routeStateState
    val selectedOrderState = remember { mutableStateOf<Order?>(null) }
    var selectedOrder by selectedOrderState
    val showPodScreen = routeState.screen == CourierRouteScreen.PROOF
    val showOrderDetail = routeState.screen == CourierRouteScreen.ORDER_DETAIL
    val showScanScreen = routeState.screen == CourierRouteScreen.SCAN
    val showChatScreen = routeState.screen == CourierRouteScreen.CHAT
    val showCallScreen = routeState.screen == CourierRouteScreen.CALL
    val showFaceVerifyScreen = routeState.screen == CourierRouteScreen.FACE_VERIFY
    val activeScanType = routeState.scanType
    val activeProofMode = routeState.proofMode
    val pickupScanVerifiedOrderIdsState = remember { mutableStateOf<Set<String>>(emptySet()) }
    var pickupScanVerifiedOrderIds by pickupScanVerifiedOrderIdsState
    val pickupPhotoVerifiedOrderIdsState = remember { mutableStateOf<Set<String>>(emptySet()) }
    var pickupPhotoVerifiedOrderIds by pickupPhotoVerifiedOrderIdsState
    // Face verification state — NOT persisted (intentional: clear on app restart for security)
    val faceVerifiedOrderIdsState = remember { mutableStateOf<Set<String>>(emptySet()) }
    var faceVerifiedOrderIds by faceVerifiedOrderIdsState
    val showLogoutDialogState = remember { mutableStateOf(false) }
    var showLogoutDialog by showLogoutDialogState
    val pendingDutySecurityTargetState = remember { mutableStateOf<Boolean?>(null) }
    var pendingDutySecurityTarget by pendingDutySecurityTargetState
    val showMissingPhotoWarningState = remember { mutableStateOf(false) }
    var showMissingPhotoWarning by showMissingPhotoWarningState
    val inlineErrorMessageState = rememberSaveable { mutableStateOf<String?>(null) }
    var inlineErrorMessage by inlineErrorMessageState
    val pendingOnlineAfterForegroundPermissionState = remember { mutableStateOf(false) }
    var pendingOnlineAfterForegroundPermission by pendingOnlineAfterForegroundPermissionState
    val showForegroundLocationPermissionDialogState = remember { mutableStateOf(false) }
    var showForegroundLocationPermissionDialog by showForegroundLocationPermissionDialogState
    val showBackgroundLocationPermissionDialogState = remember { mutableStateOf(false) }
    var showBackgroundLocationPermissionDialog by showBackgroundLocationPermissionDialogState
    val isOnDemandCourier = courierRole == "on_demand"
    val activeOnDemandJobCount = roleOrders.count {
        it.normalizedWorkflowRole() == "on_demand" &&
            it.status.lowercase() in ACTIVE_ON_DEMAND_STATUSES
    }
    val maxActiveOnDemandJobs = remember(capabilityProfile, onDemandServices, courierVehicleType) {
        resolveMaxActiveOnDemandJobs(
            capabilityProfile = capabilityProfile,
            services = onDemandServices,
            courierVehicleType = courierVehicleType
        )
    }
    // S2-MA-04 AUDIT — FLAG_SECURE Coverage for Courier App:
    // Tab 0 (Home/Orders)     → NOT secure by default (public order list, no PII shown at list level)
    // Tab 1 (Active Orders)   → NOT secure (same as home)
    // Tab 2 (Earnings/Wallet) → SECURE (IDR amounts, payout account details, earnings history)
    // Tab 3 on-demand courier → SECURE (active job route, recipient address, live location)
    // showOrderDetail         → SECURE (recipient name, phone, address, package contents)
    // showPodScreen           → SECURE (delivery proof photo, recipient signature)
    // showScanScreen          → SECURE (package tracking codes, order context)
    // showChatScreen          → SECURE (customer conversation)
    // showCallScreen          → SECURE (live call, caller identity)
    // LoginScreen + CourierRegistrationScreen → independently call SecureScreenEffect()
    val secureScreenRequired = selectedTab == 2 ||
        (isOnDemandCourier && selectedTab == 3) ||
        showPodScreen ||
        showOrderDetail ||
        showScanScreen ||
        showChatScreen ||
        showCallScreen ||
        showFaceVerifyScreen

    SecureScreenEffect(enabled = secureScreenRequired)

    val actions = rememberMainScreenActionState(context, scope)
    val foregroundLocationPermissionLauncher = actions.foregroundLocationPermissionLauncher
    val backgroundLocationPermissionLauncher = actions.backgroundLocationPermissionLauncher

    suspend fun sendSafetyEvent(order: Order?, eventType: String, reasonCode: String?, severity: String, message: String, photoFile: File? = null) {
        actions.sendSafetyEvent(snackbarHostState, orderViewModel, order, eventType, reasonCode, severity, message, photoFile)
    }

    suspend fun performDutyToggle(online: Boolean) {
        actions.performDutyToggle(snackbarHostState, orderViewModel, authSessionManager, allOrders, online)
    }

    fun requestDutyToggle(online: Boolean) {
        if (online && !hasForegroundLocationPermission(context)) {
            actions.setPendingOnlineAfterForegroundPermission(true)
            showForegroundLocationPermissionDialog = true
            return
        }

        if (online && localSecuritySettings.active) {
            actions.setPendingDutySecurityTarget(true)
        } else {
            scope.launch { performDutyToggle(online) }
        }
    }

    fun openFaceVerify(order: Order) { actions.openFaceVerify({ routeState = it }, { selectedOrder = it }, order) }
    fun openServiceFaceVerify(orderId: String, serviceType: String) { actions.openServiceFaceVerify({ routeState = it }, orderId, serviceType) }
    fun openOrderDetail(order: Order) { actions.openOrderDetail({ routeState = it }, { selectedOrder = it }, order) }
    fun openChat(order: Order) { actions.openChat({ routeState = it }, { selectedOrder = it }, order) }
    fun openCall(order: Order, callId: String? = null) { actions.openCall({ routeState = it }, { selectedOrder = it }, order, callId) }
    fun openScan(order: Order?, scanType: String = CourierProofTypes.PICKUP_SCAN) { actions.openScan({ routeState = it }, { selectedOrder = it }, order, scanType) }
    fun openProof(order: Order, proofMode: String) { actions.openProof({ routeState = it }, { selectedOrder = it }, order, proofMode) }
    fun closeRoute() { actions.closeRoute({ routeState = it }, { selectedOrder = it }) }
    fun backToOrderOrHome() { actions.backToOrderOrHome({ routeState = it }, { selectedOrder = it }, routeState) }

    val deps = MainScreenDeps(
        context = context,
        scope = scope,
        snackbarHostState = snackbarHostState,
        orderViewModel = orderViewModel,
        callEventsViewModel = callEventsViewModel,
        routeState = routeStateState,
        selectedOrder = selectedOrderState,
        selectedTab = selectedTabState,
        courierRole = courierRole,
        isOnline = isOnline,
        lifecycleOwner = lifecycleOwner,
        syncIntervalMs = syncIntervalMs,
        onDemandOffers = onDemandOffers,
        roleOrders = roleOrders,
        capabilityProfile = capabilityProfile,
        mapsProviderConfig = mapsProviderConfig,
        routePreviews = routePreviews,
        cancelPickupReasons = cancelPickupReasons,
        statusTransitions = statusTransitions,
        activeOnDemandJobCount = activeOnDemandJobCount,
        maxActiveOnDemandJobs = maxActiveOnDemandJobs,
        initialOrderId = initialOrderId,
        initialChatOrderId = initialChatOrderId,
        onConsumedDeepLink = onConsumedDeepLink,
        authSessionManager = authSessionManager,
        onLogout = onLogout,
        showPodScreen = showPodScreen,
        showOrderDetail = showOrderDetail,
        showScanScreen = showScanScreen,
        showChatScreen = showChatScreen,
        showCallScreen = showCallScreen,
        showFaceVerifyScreen = showFaceVerifyScreen,
        activeScanType = activeScanType,
        activeProofMode = activeProofMode,
        pickupScanVerifiedOrderIds = pickupScanVerifiedOrderIdsState,
        pickupPhotoVerifiedOrderIds = pickupPhotoVerifiedOrderIdsState,
        faceVerifiedOrderIds = faceVerifiedOrderIdsState,
        showLogoutDialog = showLogoutDialogState,
        pendingDutySecurityTarget = pendingDutySecurityTargetState,
        showMissingPhotoWarning = showMissingPhotoWarningState,
        pendingOnlineAfterForegroundPermission = pendingOnlineAfterForegroundPermissionState,
        showForegroundLocationPermissionDialog = showForegroundLocationPermissionDialogState,
        showBackgroundLocationPermissionDialog = showBackgroundLocationPermissionDialogState,
        inlineErrorMessage = inlineErrorMessageState,
        foregroundLocationPermissionLauncher = foregroundLocationPermissionLauncher,
        backgroundLocationPermissionLauncher = backgroundLocationPermissionLauncher,
        openOrderDetail = { openOrderDetail(it) },
        openChat = { openChat(it) },
        openCall = { o, id -> openCall(o, id) },
        openScan = { o, t -> openScan(o, t) },
        openProof = { o, m -> openProof(o, m) },
        openFaceVerify = { openFaceVerify(it) },
        openServiceFaceVerify = { id, st -> openServiceFaceVerify(id, st) },
        closeRoute = { closeRoute() },
        backToOrderOrHome = { backToOrderOrHome() },
        sendSafetyEvent = { o, et, rc, sv, msg, f -> sendSafetyEvent(o, et, rc, sv, msg, f) },
        performDutyToggle = { performDutyToggle(it) },
        requestDutyToggle = { requestDutyToggle(it) }
    )

    MainScreenEffects(deps)
    MainScreenContent(
        context = context,
        scope = scope,
        snackbarHostState = snackbarHostState,
        isOnDemandCourier = isOnDemandCourier,
        selectedTabState = selectedTabState,
        courierRole = courierRole,
        isSyncing = isSyncing,
        isOnline = isOnline,
        orderViewModel = orderViewModel,
        unreadNotificationCount = unreadNotificationCount,
        pendingOrders = pendingOrders,
        onDemandOffers = onDemandOffers,
        roleOrders = roleOrders,
        rolePendingOrders = rolePendingOrders,
        roleDeliveredToday = roleDeliveredToday,
        roleEarningsToday = roleEarningsToday,
        allOrders = allOrders,
        onDemandServices = onDemandServices,
        capabilityProfile = capabilityProfile,
        courierVehicleType = courierVehicleType,
        routePreviews = routePreviews,
        activeRoutePlan = activeRoutePlan,
        onDemandHotspots = onDemandHotspots,
        mapsProviderConfig = mapsProviderConfig,
        lastRemoteSyncAt = lastRemoteSyncAt,
        displayCourierName = displayCourierName,
        courierProfile = courierProfile,
        localSecurityManager = localSecurityManager,
        localSecuritySettings = localSecuritySettings,
        authSessionManager = authSessionManager,
        earningsLedger = earningsLedger,
        payoutSummary = payoutSummary,
        payoutRequests = payoutRequests,
        isPayoutSubmitting = isPayoutSubmitting,
        performanceSummary = performanceSummary,
        inlineErrorMessage = inlineErrorMessage,
        showLogoutDialog = showLogoutDialogState,
        pendingDutySecurityTargetState = pendingDutySecurityTargetState,
        routeStateState = routeStateState,
        selectedOrderState = selectedOrderState,
        onRouteStateChange = { routeState = it },
        onSelectedOrderChange = { selectedOrder = it },
        onOpenOrdersTab = { selectedTab = 1 },
        onTabChange = { selectedTab = it },
        onToggleOnline = { requestDutyToggle(it) },
        onOpenOrderDetail = { openOrderDetail(it) },
        onOpenProof = { o, p -> openProof(o, p) },
        onOpenScan = { o, s -> openScan(o, s) },
        onOnlineToggleRequested = { online, pending ->
            if (online && !hasForegroundLocationPermission(context)) {
                pendingOnlineAfterForegroundPermission = true
                showForegroundLocationPermissionDialog = true
            } else if (online && localSecuritySettings.active) {
                pendingDutySecurityTarget = true
            } else {
                scope.launch { actions.performDutyToggle(snackbarHostState, orderViewModel, authSessionManager, allOrders, online) }
            }
        },
        requestDutyToggle = { requestDutyToggle(it) },
        onPerformDutyToggle = { online -> performDutyToggle(online) },
        pendingOnlineAfterForegroundPermissionState = pendingOnlineAfterForegroundPermissionState,
        showForegroundLocationPermissionDialogState = showForegroundLocationPermissionDialogState,
        showMissingPhotoWarningState = showMissingPhotoWarningState,
        onDismissInlineError = { inlineErrorMessage = null }
    )

}
