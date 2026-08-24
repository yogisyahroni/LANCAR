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




internal val LogisticsOrange = AccentDark // 5.18:1 utk badge putih (WCAG AA)
internal val SageBase = Background
internal val DeepForest = PrimaryDark

internal fun acceptOrderViaReceiver(context: Context, order: Order) {
    val acceptIntent = Intent(context, com.tembus.courier.receiver.NotificationReceiver::class.java).apply {
        action = com.tembus.courier.receiver.NotificationReceiver.ACTION_ACCEPT
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_ORDER_ID, order.orderId)
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_DISPATCH_ID, order.dispatchId)
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_OFFER_EXPIRES_AT, order.offerExpiresAt?.toString())
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_OFFER_TTL_SECONDS, order.offerTtlSeconds?.toString())
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_PICKUP_ADDRESS, order.pickupAddress)
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_PICKUP_TIME, order.pickupTime)
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_DROP_ADDRESS, order.dropAddress)
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_DISTANCE, order.distance)
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_FEE, order.fee)
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_MODEL, order.model)
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_LEG_NUMBER, order.legNumber)
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_WORKFLOW_ROLE, order.workflowRole)
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_CUSTOMER_NAME, order.customerName)
    }
    context.sendBroadcast(acceptIntent)
}

internal fun rejectOrderViaReceiver(context: Context, order: Order) {
    val rejectIntent = Intent(context, com.tembus.courier.receiver.NotificationReceiver::class.java).apply {
        action = com.tembus.courier.receiver.NotificationReceiver.ACTION_DISMISS
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_ORDER_ID, order.orderId)
        putExtra(com.tembus.courier.receiver.NotificationReceiver.EXTRA_DISPATCH_ID, order.dispatchId)
    }
    context.sendBroadcast(rejectIntent)
}

private val CourierRouteStateSaver = Saver<CourierRouteState, List<String>>(
    save = { state ->
        listOf(
            state.screen.name,
            state.orderId.orEmpty(),
            state.callId.orEmpty(),
            state.scanType,
            state.proofMode,
            state.callTargetType,
            state.serviceType,
            state.returnToServiceType
        )
    },
    restore = { raw ->
        val screen = raw.getOrNull(0)
            ?.let { value -> runCatching { CourierRouteScreen.valueOf(value) }.getOrNull() }
            ?: CourierRouteScreen.HOME
        CourierRouteState(
            screen = screen,
            orderId = raw.getOrNull(1)?.takeIf { it.isNotBlank() },
            callId = raw.getOrNull(2)?.takeIf { it.isNotBlank() },
            scanType = raw.getOrNull(3) ?: CourierProofTypes.PICKUP_SCAN,
            proofMode = raw.getOrNull(4) ?: CourierProofTypes.DELIVERY_POD_PHOTO,
            callTargetType = raw.getOrNull(5)?.takeIf { it.isNotBlank() } ?: "customer",
            serviceType = raw.getOrNull(6) ?: "",
            returnToServiceType = raw.getOrNull(7) ?: ""
        )
    }
)

/**
 * Main Screen — Courier Dashboard
 *
 * Uses real data from OrderViewModel backed by Room DB + backend sync.
 * No more demo/hardcoded data.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    initialOrderId: String? = null,
    initialChatOrderId: String? = null,
    authSessionManager: AuthSessionManager,
    onConsumedDeepLink: () -> Unit = {},
    onLogout: () -> Unit = {}
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

    var selectedTab by remember { mutableStateOf(0) }
    var routeState by rememberSaveable(stateSaver = CourierRouteStateSaver) {
        mutableStateOf(CourierRouteState())
    }
    var selectedOrder by remember { mutableStateOf<Order?>(null) }
    val showPodScreen = routeState.screen == CourierRouteScreen.PROOF
    val showOrderDetail = routeState.screen == CourierRouteScreen.ORDER_DETAIL
    val showScanScreen = routeState.screen == CourierRouteScreen.SCAN
    val showChatScreen = routeState.screen == CourierRouteScreen.CHAT
    val showCallScreen = routeState.screen == CourierRouteScreen.CALL
    val showFaceVerifyScreen = routeState.screen == CourierRouteScreen.FACE_VERIFY
    val activeScanType = routeState.scanType
    val activeProofMode = routeState.proofMode
    var pickupScanVerifiedOrderIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var pickupPhotoVerifiedOrderIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    // Face verification state — NOT persisted (intentional: clear on app restart for security)
    var faceVerifiedOrderIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var showLogoutDialog by remember { mutableStateOf(false) }
    var pendingDutySecurityTarget by remember { mutableStateOf<Boolean?>(null) }
    var showMissingPhotoWarning by remember { mutableStateOf(false) }
    var inlineErrorMessage by rememberSaveable { mutableStateOf<String?>(null) }
    var pendingOnlineAfterForegroundPermission by remember { mutableStateOf(false) }
    var showForegroundLocationPermissionDialog by remember { mutableStateOf(false) }
    var showBackgroundLocationPermissionDialog by remember { mutableStateOf(false) }
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

    suspend fun sendSafetyEvent(order: Order?, eventType: String, severity: String, message: String, photoFile: File? = null) {
        val location = getLastKnownDutyLocation(context)
        val result = orderViewModel.createSafetyEvent(
            orderId = order?.orderId,
            eventType = eventType,
            severity = severity,
            latitude = location?.latitude,
            longitude = location?.longitude,
            accuracy = location?.accuracy,
            message = message,
            photoFile = photoFile
        )
        snackbarHostState.showSnackbar(
            result.getOrElse { it.message ?: "Laporan belum terkirim. Coba lagi." }
        )
    }

    suspend fun performDutyToggle(online: Boolean) {
        if (!online) {
            val hasActiveJobs = allOrders.any { it.status != "delivered" && it.status != "failed" }
            if (hasActiveJobs) {
                snackbarHostState.showSnackbar("Peringatan: Selesaikan semua tugas pengiriman sebelum nonaktif.")
                return
            }
        }

        if (online) {
            val isRooted = com.tembus.courier.util.SecurityUtils.isDeviceRooted(context)
            if (isRooted) {
                snackbarHostState.showSnackbar("Akses ditolak: perangkat terdeteksi rooted. Gunakan perangkat operasional yang aman.")
                return
            }
        }

        try {
            if (online) {
                val location = getLastKnownDutyLocation(context)
                if (location == null) {
                    snackbarHostState.showSnackbar("Lokasi perangkat sedang dikunci. Aktifkan GPS dan coba lagi untuk mulai On Duty.")
                    return
                }

                val dutyResult = orderViewModel.updateDutyStatus(
                    online = true,
                    latitude = location.latitude,
                    longitude = location.longitude,
                    accuracy = location.accuracy
                )
                dutyResult.onFailure { e ->
                    snackbarHostState.showSnackbar(
                        e.message ?: "Lokasi Anda belum memenuhi area operasional aktif."
                    )
                    return
                }

                authSessionManager.setOnlineStatus(true)
                val intent = LocationTrackerService.startIntent(context)
                androidx.core.content.ContextCompat.startForegroundService(context, intent)
                snackbarHostState.showSnackbar("Status aktif. Tracking operasional berjalan.")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasBackgroundLocationPermission(context)) {
                    showBackgroundLocationPermissionDialog = true
                }
            } else {
                val dutyResult = orderViewModel.updateDutyStatus(online = false)
                dutyResult.onFailure { e ->
                    snackbarHostState.showSnackbar(e.message ?: "Gagal memperbarui status Off Duty.")
                    return
                }

                authSessionManager.setOnlineStatus(false)
                context.stopService(LocationTrackerService.stopIntent(context))
                snackbarHostState.showSnackbar("Status nonaktif. Tracking berhenti.")
            }
        } catch (e: Exception) {
            snackbarHostState.showSnackbar("Gagal memperbarui status tracking.")
        }
    }

    val foregroundLocationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true ||
            hasForegroundLocationPermission(context)
        if (granted && pendingOnlineAfterForegroundPermission) {
            pendingOnlineAfterForegroundPermission = false
            if (localSecuritySettings.active) {
                pendingDutySecurityTarget = true
            } else {
                scope.launch { performDutyToggle(true) }
            }
        } else if (!granted) {
            pendingOnlineAfterForegroundPermission = false
            scope.launch {
                snackbarHostState.showSnackbar("Izin lokasi diperlukan sebelum kurir bisa On Duty.")
            }
        }
    }

    val backgroundLocationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        scope.launch {
            snackbarHostState.showSnackbar(
                if (granted || hasBackgroundLocationPermission(context)) {
                    "Tracking background aktif untuk pekerjaan berjalan."
                } else {
                    "Tracking tetap berjalan saat aplikasi terbuka. Aktifkan background location dari pengaturan untuk mode operasional penuh."
                }
            )
        }
    }

    fun requestDutyToggle(online: Boolean) {
        if (online && courierProfile?.profilePhotoUrl.isNullOrBlank()) {
            showMissingPhotoWarning = true
            return
        }

        if (online && !hasForegroundLocationPermission(context)) {
            pendingOnlineAfterForegroundPermission = true
            showForegroundLocationPermissionDialog = true
            return
        }

        if (online && localSecuritySettings.active) {
            pendingDutySecurityTarget = true
        } else {
            scope.launch { performDutyToggle(online) }
        }
    }

    fun openFaceVerify(order: Order) {
        selectedOrder = order
        routeState = CourierRouteReducer.faceVerify(order.orderId)
    }

    fun openServiceFaceVerify(orderId: String, serviceType: String) {
        routeState = CourierRouteReducer.faceVerify(orderId, returnToServiceType = serviceType)
    }

    fun openOrderDetail(order: Order) {
        selectedOrder = order
        routeState = CourierRouteReducer.detail(order.orderId)
    }

    fun openChat(order: Order) {
        selectedOrder = order
        routeState = CourierRouteReducer.chat(order.orderId)
    }

    fun openCall(order: Order, callId: String? = null) {
        selectedOrder = order
        routeState = CourierRouteReducer.call(order.orderId, callId, order.communicationCallTargetType())
    }

    fun openScan(order: Order?, scanType: String = CourierProofTypes.PICKUP_SCAN) {
        selectedOrder = order
        routeState = CourierRouteReducer.scan(order?.orderId, scanType)
    }

    fun openProof(order: Order, proofMode: String) {
        selectedOrder = order
        routeState = CourierRouteReducer.proof(order.orderId, proofMode)
    }

    fun closeRoute() {
        selectedOrder = null
        routeState = CourierRouteReducer.home()
    }

    fun backToOrderOrHome() {
        routeState = CourierRouteReducer.backFromChild(routeState)
        if (routeState.screen == CourierRouteScreen.HOME) {
            selectedOrder = null
        }
    }

    LaunchedEffect(routeState.orderId, routeState.screen, roleOrders, onDemandOffers) {
        val orderId = routeState.orderId ?: return@LaunchedEffect
        if (selectedOrder?.orderId == orderId) return@LaunchedEffect
        val cachedOrder = roleOrders.firstOrNull { it.orderId == orderId }
            ?: onDemandOffers.firstOrNull { it.orderId == orderId }
            ?: orderViewModel.getOrderById(orderId)
        if (cachedOrder != null) {
            selectedOrder = cachedOrder
        }
    }

    LaunchedEffect(Unit) {
        callEventsViewModel.incomingCallInvites.collect { invite ->
            val order = orderViewModel.getOrderById(invite.orderId)
                ?: roleOrders.firstOrNull { it.orderId == invite.orderId }
                ?: onDemandOffers.firstOrNull { it.orderId == invite.orderId }
            if (order != null) {
                selectedOrder = order
                routeState = CourierRouteReducer.call(invite.orderId, invite.callId, order.communicationCallTargetType())
            } else {
                snackbarHostState.showSnackbar("Panggilan masuk diterima, tetapi order belum tersinkron.")
            }
        }
    }

    if (courierRole == "on_demand" && onDemandOffers.isNotEmpty()) {
        val capacityBlocked = activeOnDemandJobCount >= maxActiveOnDemandJobs
        OnDemandOfferQueueDialog(
            offers = onDemandOffers,
            mapsProviderConfig = mapsProviderConfig,
            activeJobCount = activeOnDemandJobCount,
            maxActiveJobs = maxActiveOnDemandJobs,
            acceptBlocked = capacityBlocked,
            onAccept = { offer ->
                orderViewModel.acceptOffer(offer) { accepted ->
                    openOrderDetail(accepted)
                }
            },
            onReject = { offer -> orderViewModel.rejectOffer(offer) },
            onExpired = { offer -> orderViewModel.rejectOffer(offer, "ttl_expired") }
        )
    }

    // Navigate to order detail if app was opened from notification
    LaunchedEffect(initialOrderId) {
        if (initialOrderId != null) {
            val order = orderViewModel.getOrderById(initialOrderId)
            if (order != null) {
                openOrderDetail(order)
                onConsumedDeepLink()
            }
        }
    }

    // Navigate to Chat Screen directly if app was opened from a Chat notification
    LaunchedEffect(initialChatOrderId) {
        if (initialChatOrderId != null) {
            val order = orderViewModel.getOrderById(initialChatOrderId)
            if (order != null) {
                openChat(order)
                onConsumedDeepLink()
            }
        }
    }

    // Show error as Snackbar and persistent inline retry state.
    LaunchedEffect(error) {
        error?.let { msg ->
            inlineErrorMessage = msg
            snackbarHostState.showSnackbar(
                message = msg,
                duration = SnackbarDuration.Short
            )
            orderViewModel.clearError()
        }
    }

    // Main synchronization loop (App Foreground)
    LaunchedEffect(isOnline, courierRole, syncIntervalMs, lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            if (!isOnline) return@repeatOnLifecycle

            val baseIntervalMs = if (courierRole == "on_demand") {
                ON_DEMAND_FOREGROUND_SYNC_INTERVAL_MS
            } else {
                syncIntervalMs
            }
            val minIntervalMs = if (courierRole == "on_demand") {
                ON_DEMAND_FOREGROUND_SYNC_MIN_INTERVAL_MS
            } else {
                (syncIntervalMs * 0.66).toLong()
            }
            var intervalMs = baseIntervalMs
            while (isActive) {
                val result = orderViewModel.refreshOrdersFromBackend(
                    showUserErrors = false,
                    showLoading = false,
                    minIntervalMs = minIntervalMs
                )
                intervalMs = if (result.isSuccess) {
                    baseIntervalMs
                } else {
                    min(intervalMs * 2, FOREGROUND_SYNC_MAX_BACKOFF_MS)
                }
                delay(intervalMs)
            }
        }
    }

    LaunchedEffect(isOnline, lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            OrderSyncSignalBus.events.collect {
                if (isOnline) {
                    orderViewModel.refreshOrdersFromBackend(
                        showUserErrors = false,
                        showLoading = false,
                        minIntervalMs = PUSH_SYNC_MIN_INTERVAL_MS
                    )
                }
            }
        }
    }

    // ── PoD Screen ─────────────────────────────────────────────
    selectedOrder?.takeIf { showPodScreen }?.let { order ->
        ProofOfDeliveryScreen(
            order = order,
            proofMode = activeProofMode,
            onImageConfirmed = { _ ->
                if (CourierProofTypes.isPickupProof(activeProofMode)) {
                    pickupPhotoVerifiedOrderIds = pickupPhotoVerifiedOrderIds + order.orderId
                    scope.launch {
                        val updatedOrder = orderViewModel.getOrderById(order.orderId)
                            ?: order.copy(pickupPhotoVerified = true)
                        val hasPickupScan = pickupScanVerifiedOrderIds.contains(order.orderId) ||
                            updatedOrder.pickupScanVerified ||
                            updatedOrder.scanType == "pickup" ||
                            updatedOrder.scanType == CourierProofTypes.PICKUP_SCAN
                        selectedOrder = updatedOrder
                        snackbarHostState.currentSnackbarData?.dismiss()
                        snackbarHostState.showSnackbar(
                            if (hasPickupScan) {
                                "Pickup lengkap. Mulai pengantaran."
                            } else {
                                "Foto barang tersimpan. Scan kode paket masih wajib."
                            }
                        )
                    }
                    routeState = CourierRouteReducer.detail(order.orderId)
                } else {
                    orderViewModel.fetchOrdersFromBackend()
                    closeRoute()
                }
            },
            onBack = {
                backToOrderOrHome()
            }
        )
        return
    }

    // ── Face Verification Screen ───────────────────────────────
    selectedOrder?.takeIf { showFaceVerifyScreen }?.let { order ->
        FaceVerificationScreen(
            orderId = order.orderId,
            verificationType = "pickup",
            workContext = routeState.returnToServiceType,
            onVerified = {
                faceVerifiedOrderIds = faceVerifiedOrderIds + order.orderId
                val returnToServiceType = routeState.returnToServiceType
                when (returnToServiceType) {
                    "tambal_ban" -> {
                        orderViewModel.updateOrderStatusAndSync(order.orderId, "inspecting")
                        selectedOrder = selectedOrder?.copy(status = "inspecting")
                        routeState = CourierRouteReducer.tambalBanFlow(order.orderId)
                        scope.launch {
                            snackbarHostState.showSnackbar("Verifikasi wajah berhasil. Lanjutkan inspeksi ban.")
                        }
                    }
                    "towing" -> {
                        orderViewModel.updateOrderStatusAndSync(order.orderId, "inspecting")
                        selectedOrder = selectedOrder?.copy(status = "inspecting")
                        routeState = CourierRouteReducer.towingFlow(order.orderId)
                        scope.launch {
                            snackbarHostState.showSnackbar("Verifikasi wajah berhasil. Lanjutkan inspeksi kendaraan.")
                        }
                    }
                    else -> {
                        routeState = CourierRouteReducer.detail(order.orderId)
                        scope.launch {
                            snackbarHostState.showSnackbar("Verifikasi wajah berhasil. Lanjutkan scan paket.")
                        }
                    }
                }
            },
            onBack = { backToOrderOrHome() }
        )
        return
    }

    // ── Order Detail Screen ────────────────────────────────────
    selectedOrder?.takeIf { showOrderDetail }?.let { order ->
        LaunchedEffect(order.orderId) {
            if (order.normalizedWorkflowRole() == "on_demand") {
                orderViewModel.loadRoutePreview(order.orderId)
            }
            orderViewModel.fetchOrderStatusTransitions(order.normalizedWorkflowRole())
        }
        OrderDetailScreen(
            order = order,
            routePreview = routePreviews[order.orderId],
            mapsProviderConfig = mapsProviderConfig,
            cancelPickupReasons = cancelPickupReasons,
            statusTransitions = statusTransitions,
            pickupScanVerified = pickupScanVerifiedOrderIds.contains(order.orderId) ||
                order.pickupScanVerified ||
                order.scanType == "pickup" ||
                order.scanType == CourierProofTypes.PICKUP_SCAN,
            pickupPhotoVerified = pickupPhotoVerifiedOrderIds.contains(order.orderId) || order.pickupPhotoVerified,
            faceVerifiedForPickup = faceVerifiedOrderIds.contains(order.orderId),
            onBack = {
                closeRoute()
            },
            onUpdateStatus = { newStatus ->
                // Optimistic local update + backend sync
                orderViewModel.updateOrderStatusAndSync(
                    orderId = order.orderId,
                    status = newStatus
                )
                selectedOrder = selectedOrder?.copy(status = newStatus)
            },
            onVerifyPickup = {
                openScan(order, CourierProofTypes.PICKUP_SCAN)
            },
            onVerifyFace = {
                openFaceVerify(order)
            },
            onOpenTambalBanFlow = {
                routeState = CourierRouteReducer.tambalBanFlow(order.orderId)
            },
            onOpenTowingFlow = {
                routeState = CourierRouteReducer.towingFlow(order.orderId)
            },
            onCapturePickupProof = {
                openProof(order, CourierProofTypes.PICKUP_PHOTO)
            },
            onCapturePod = {
                openProof(order, CourierProofTypes.DELIVERY_POD_PHOTO)
            },
            onChatClick = {
                openChat(order)
            },
            onCallClick = {
                openCall(order)
            },
            onLogLocalSecurity = { actionType, cb ->
                orderViewModel.logLocalSecurityEvent(actionType, onComplete = cb)
            },
            onSosClick = {
                scope.launch {
                    val location = getLastKnownDutyLocation(context)
                    if (location == null) {
                        snackbarHostState.showSnackbar("Gagal memicu SOS: Lokasi GPS tidak tersedia. Pastikan GPS aktif.")
                        return@launch
                    }
                    val result = orderViewModel.triggerSos(
                        latitude = location.latitude,
                        longitude = location.longitude
                    )
                    result.onSuccess { data ->
                        val prefs = context.getSharedPreferences("sos_prefs", android.content.Context.MODE_PRIVATE)
                        prefs.edit()
                            .putBoolean("is_sos_active", true)
                            .putString("active_incident_id", data.incidentId)
                            .apply()
                        snackbarHostState.showSnackbar("Panggilan Darurat (SOS) telah dikirim ke pusat komando.")
                    }.onFailure {
                        snackbarHostState.showSnackbar("Gagal memicu SOS: ${it.message}")
                    }
                }
            },
            onReportIssue = { eventType, severity, message, photoFile ->
                scope.launch {
                    sendSafetyEvent(order, eventType, severity, message, photoFile)
                }
            },
            onCancelPickup = { reasonCode, reasonNote, photoFile ->
                scope.launch {
                    val location = getLastKnownDutyLocation(context)
                    val result = orderViewModel.cancelOnDemandPickup(
                        orderId = order.orderId,
                        reasonCode = reasonCode,
                        reasonNote = reasonNote,
                        latitude = location?.latitude,
                        longitude = location?.longitude,
                        accuracy = location?.accuracy,
                        photoFile = photoFile
                    )
                    result.onSuccess { message ->
                        closeRoute()
                        snackbarHostState.showSnackbar(message)
                    }.onFailure { error ->
                        snackbarHostState.showSnackbar(error.message ?: "Pembatalan pickup belum terkirim. Coba lagi.")
                    }
                }
            }
        )
        return
    }

    // ── Chat Screen ────────────────────────────────────────────
    selectedOrder?.takeIf { showChatScreen }?.let { order ->
        ChatScreen(
            orderId = order.orderId,
            conversationTitle = order.communicationChatTitle(),
            conversationSubtitle = order.communicationChatSubtitle(),
            inputPlaceholder = order.communicationChatPlaceholder(),
            isDeliveryGroup = order.communicationIsDeliveryGroup(),
            onCallClick = {
                openCall(order)
            },
            onBackClick = {
                backToOrderOrHome()
            },
            order = order
        )
        return
    }

    // ── In-app Call Screen ─────────────────────────────────────
    selectedOrder?.takeIf { showCallScreen }?.let { order ->
        InAppCallScreen(
            orderId = order.orderId,
            targetName = order.communicationCallTargetLabel(),
            targetType = routeState.callTargetType,
            initialState = if (routeState.callId.isNullOrBlank()) InAppCallState.OUTGOING else InAppCallState.INCOMING,
            routeCallId = routeState.callId,
            onBackClick = { backToOrderOrHome() },
            onOpenChat = {
                routeState = CourierRouteReducer.chat(order.orderId)
            }
        )
        return
    }

    // ── Scan Screen ────────────────────────────────────────────
    if (showScanScreen) {
        ScanScreen(
            initialOrderId = selectedOrder?.orderId,
            scanType = activeScanType,
            title = if (activeScanType == CourierProofTypes.PICKUP_SCAN) "Verifikasi Barang" else "Verifikasi Tujuan",
            onScanSuccess = { orderId ->
                scope.launch {
                    // Load real order from DB (may have been added by notification)
                    val order = orderViewModel.getOrderById(orderId)
                    if (order != null) {
                        if (activeScanType == CourierProofTypes.PICKUP_SCAN) {
                            pickupScanVerifiedOrderIds = pickupScanVerifiedOrderIds + orderId
                            val hasPickupPhoto = pickupPhotoVerifiedOrderIds.contains(orderId) || order.pickupPhotoVerified
                            if (hasPickupPhoto) {
                                selectedOrder = order.copy(pickupScanVerified = true)
                                orderViewModel.fetchOrdersFromBackend()
                                snackbarHostState.showSnackbar("Pickup lengkap. Mulai pengantaran.")
                            } else {
                                selectedOrder = order.copy(pickupScanVerified = true)
                                snackbarHostState.showSnackbar("Scan berhasil. Lanjutkan foto barang untuk mulai pengantaran.")
                            }
                        } else {
                            selectedOrder = order
                        }
                        routeState = CourierRouteReducer.detail(orderId)
                    } else {
                        snackbarHostState.showSnackbar("Order $orderId tidak ditemukan")
                    }
                }
            },
            onBack = {
                backToOrderOrHome()
            }
        )
        return
    }

    // ── Inbox Screen ──────────────────────────────────────────
    if (routeState.screen == CourierRouteScreen.SERVICE_UPGRADE) {
        ServiceUpgradeScreen(
            onNavigateBack = { routeState = CourierRouteReducer.home() }
        )
        return
    }

    // ── Tambal Ban Flow Screen ──────────────────────────────
    if (routeState.screen == CourierRouteScreen.TAMBAL_BAN_FLOW) {
        val orderId = routeState.orderId ?: return
        TambalBanFlowScreen(
            orderId = orderId,
            onBackClick = { routeState = CourierRouteReducer.home() },
            onComplete = { routeState = CourierRouteReducer.home() },
            onVerifyFace = { id, serviceType ->
                openServiceFaceVerify(id, serviceType)
            },
            onOpenCompletion = { id, serviceType ->
                routeState = CourierRouteReducer.completion(id, serviceType)
            }
        )
        return
    }

    // ── Towing Flow Screen ──────────────────────────────────
    if (routeState.screen == CourierRouteScreen.TOWING_FLOW) {
        val orderId = routeState.orderId ?: return
        TowingFlowScreen(
            orderId = orderId,
            onBackClick = { routeState = CourierRouteReducer.home() },
            onComplete = { routeState = CourierRouteReducer.home() },
            onVerifyFace = { id, serviceType ->
                openServiceFaceVerify(id, serviceType)
            },
            onOpenCompletion = { id, serviceType ->
                routeState = CourierRouteReducer.completion(id, serviceType)
            }
        )
        return
    }

    // ── Completion Screen ────────────────────────────────────
    if (routeState.screen == CourierRouteScreen.COMPLETION) {
        val orderId = routeState.orderId ?: return
        val serviceType = routeState.serviceType
        CompletionScreen(
            serviceType = serviceType,
            onBackClick = { routeState = CourierRouteReducer.home() },
            onComplete = { notes, completionPhoto, signatureBitmap ->
                scope.launch {
                    orderViewModel.submitServiceReport(
                        orderId = orderId,
                        serviceType = serviceType,
                        notes = notes,
                        completionPhoto = completionPhoto,
                        signatureBitmap = signatureBitmap
                    )
                }
                routeState = CourierRouteReducer.home()
            }
        )
        return
    }

    if (routeState.screen == CourierRouteScreen.INBOX) {
        InboxScreen(
            onBackClick = { routeState = CourierRouteReducer.home() }
        )
        return
    }

    // ── Logout Confirmation Dialog ─────────────────────────────
    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("Keluar Aplikasi") },
            text = { Text("Kamu yakin ingin keluar? Semua data offline akan tetap tersimpan.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLogoutDialog = false
                        scope.launch {
                            orderViewModel.clearAllOrders()
                            authSessionManager.clearSession()
                            onLogout()
                        }
                    }
                ) {
                    Text("Keluar", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) {
                    Text("Batal")
                }
            }
        )
    }

    if (showForegroundLocationPermissionDialog) {
        AlertDialog(
            onDismissRequest = {
                showForegroundLocationPermissionDialog = false
                pendingOnlineAfterForegroundPermission = false
            },
            title = { Text("Aktifkan Lokasi") },
            text = {
                Text("Lokasi foreground dibutuhkan untuk validasi area kerja, rute pickup, dan bukti pengantaran. TEMBUS hanya memakai lokasi saat kurir On Duty.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showForegroundLocationPermissionDialog = false
                        foregroundLocationPermissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
                        )
                    }
                ) {
                    Text("Izinkan lokasi")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showForegroundLocationPermissionDialog = false
                        pendingOnlineAfterForegroundPermission = false
                    }
                ) {
                    Text("Batal")
                }
            }
        )
    }

    if (showBackgroundLocationPermissionDialog) {
        AlertDialog(
            onDismissRequest = { showBackgroundLocationPermissionDialog = false },
            title = { Text("Tracking Saat App Ditutup") },
            text = {
                Text("Agar dispatcher dan pelanggan tetap mendapat posisi akurat selama pekerjaan aktif, aktifkan izin lokasi background. Izin ini hanya dipakai saat status On Duty.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showBackgroundLocationPermissionDialog = false
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                data = Uri.parse("package:${context.packageName}")
                            }
                            context.startActivity(intent)
                        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            backgroundLocationPermissionLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                        }
                    }
                ) {
                    Text("Buka pengaturan")
                }
            },
            dismissButton = {
                TextButton(onClick = { showBackgroundLocationPermissionDialog = false }) {
                    Text("Nanti")
                }
            }
        )
    }

    pendingDutySecurityTarget?.let { targetOnline ->
        FaceVerificationScreen(
            orderId = null,
            verificationType = if (targetOnline) "on_duty" else "off_duty",
            onVerified = {
                val actionType = if (targetOnline) "on_duty" else "off_duty"
                pendingDutySecurityTarget = null
                orderViewModel.logLocalSecurityEvent(actionType) {
                    scope.launch { performDutyToggle(targetOnline) }
                }
            },
            onBack = { pendingDutySecurityTarget = null }
        )
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            if (!isOnDemandCourier) {
                TopAppBar(
                    title = {
                        Column {
                            Text("TEMBUS Mitra Kurir", fontWeight = FontWeight.Bold)
                            Text(
                                text = if (isOnline) "On duty" else "Off duty",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.82f)
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Primary,
                        titleContentColor = MaterialTheme.colorScheme.onPrimary,
                        actionIconContentColor = MaterialTheme.colorScheme.onPrimary
                    ),
                    actions = {
                        // Sync indicator
                        AnimatedVisibility(visible = isSyncing, enter = fadeIn(), exit = fadeOut()) {
                            CircularProgressIndicator(
                                modifier = Modifier
                                    .size(20.dp)
                                    .padding(end = 8.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        }
                        IconButton(onClick = { orderViewModel.fetchOrdersFromBackend() }) {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = "Muat ulang"
                            )
                        }
                        IconButton(onClick = { routeState = CourierRouteReducer.inbox() }) {
                            BadgedBox(
                                badge = {
                                    if (unreadNotificationCount > 0) {
                                        Badge { Text("$unreadNotificationCount") }
                                    }
                                }
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Notifications,
                                    contentDescription = "Notifikasi"
                                )
                            }
                        }
                    }
                )
            }
        },
        bottomBar = {
            if (isOnDemandCourier) {
                OnDemandBottomNavigation(
                    selectedTab = selectedTab,
                    offerCount = onDemandOffers.size,
                    onSelectTab = { selectedTab = it }
                )
            } else {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Home, contentDescription = "Beranda") },
                        label = { Text("Beranda") },
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 }
                    )
                    NavigationBarItem(
                        icon = {
                            BadgedBox(
                                badge = {
                                    if (pendingOrders.isNotEmpty()) {
                                        Badge { Text("${pendingOrders.size}") }
                                    }
                                }
                            ) {
                                Icon(Icons.Default.LocalShipping, contentDescription = "Order")
                            }
                        },
                        label = { Text("Order") },
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Person, contentDescription = "Profil") },
                        label = { Text("Profil") },
                        selected = selectedTab == 2,
                        onClick = { selectedTab = 2 }
                    )
                }
            }
        }
    ) { paddingValues ->
        if (isOnDemandCourier && selectedTab == 0) {
            OnDemandMapHome(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                orders = roleOrders,
                offers = onDemandOffers,
                services = onDemandServices,
                capabilityProfile = capabilityProfile,
                courierVehicleType = courierVehicleType,
                routePreviews = routePreviews,
                activeRoutePlan = activeRoutePlan,
                hotspots = onDemandHotspots,
                mapsProviderConfig = mapsProviderConfig,
                isOnline = isOnline,
                onOnlineToggle = { online -> requestDutyToggle(online) },
                onOpenDelivery = { order ->
                    if (order.isMaintenanceService()) {
                        routeState = if (order.serviceCode?.startsWith("towing") == true) {
                            CourierRouteReducer.towingFlow(order.orderId)
                        } else {
                            CourierRouteReducer.tambalBanFlow(order.orderId)
                        }
                    } else {
                        openOrderDetail(order)
                    }
                },
                onViewOrders = { selectedTab = 1 }
            )
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(paddingValues)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                inlineErrorMessage?.let { message ->
                    CourierInlineErrorState(
                        message = message,
                        onRetry = {
                            inlineErrorMessage = null
                            orderViewModel.fetchOrdersFromBackend()
                        },
                        onDismiss = { inlineErrorMessage = null }
                    )
                }
                
                BatteryOptimizationCard()
                
                when (selectedTab) {
                    0 -> HomeContent(
                    courierName = displayCourierName,
                    courierRole = courierRole,
                    totalOrders = roleOrders.size,
                    pendingCount = rolePendingOrders.size,
                    deliveredCount = roleDeliveredToday.size,
                    todayEarningsIdr = roleEarningsToday,
                    orders = roleOrders,
                    offers = if (courierRole == "on_demand") onDemandOffers else emptyList(),
                    services = onDemandServices,
                    capabilityProfile = capabilityProfile,
                    courierVehicleType = courierVehicleType,
            routePreviews = routePreviews,
            activeRoutePlan = activeRoutePlan,
            hotspots = onDemandHotspots,
            mapsProviderConfig = mapsProviderConfig,
                    isOnline = isOnline,
                    onOnlineToggle = { online -> requestDutyToggle(online) },
                    onCapturePod = { order ->
                        openProof(order, CourierProofTypes.DELIVERY_POD_PHOTO)
                    },
                    onOpenDelivery = { order ->
                        if (order.isMaintenanceService()) {
                            routeState = if (order.serviceCode?.startsWith("towing") == true) {
                                CourierRouteReducer.towingFlow(order.orderId)
                            } else {
                                CourierRouteReducer.tambalBanFlow(order.orderId)
                            }
                        } else {
                            openOrderDetail(order)
                        }
                    },
                    onViewOrders = { selectedTab = 1 },
                    onScanPackage = {
                        openScan(null, CourierProofTypes.PICKUP_SCAN)
                    }
                )
                    1 -> OrdersContent(
                    orders = roleOrders,
                    courierRole = courierRole,
                    isSyncing = isSyncing,
                    isOnline = isOnline,
                    lastRemoteSyncAt = lastRemoteSyncAt,
                    onOrderClick = { order ->
                        openOrderDetail(order)
                    },
                    onSync = { orderViewModel.syncPendingOrders() },
                    onRefresh = { orderViewModel.fetchOrdersFromBackend() }
                )
                    2 -> if (isOnDemandCourier) {
                        WalletContent(
                            courierName = displayCourierName,
                            todayEarningsIdr = roleEarningsToday,
                            totalEarningsIdr = courierProfile?.totalEarningsIdr ?: allOrders.sumOf { it.cleanPayoutIdr() },
                            localSecurityManager = localSecurityManager,
                            earningsLedger = earningsLedger,
                            payoutSummary = payoutSummary,
                            payoutRequests = payoutRequests,
                            isPayoutSubmitting = isPayoutSubmitting,
                            onRefreshPayout = { orderViewModel.fetchPayoutState() },
                            onRequestPayout = { amountIdr, pin ->
                                orderViewModel.submitPayoutRequest(amountIdr, pin)
                            }
                        )
                    } else {
                        ProfileContent(
                            courierProfile = courierProfile,
                            courierName = displayCourierName,
                            courierRole = courierRole,
                            localSecurityManager = localSecurityManager,
                            pendingSyncCount = rolePendingOrders.size,
                            todayEarningsIdr = roleEarningsToday,
                            totalEarningsIdr = courierProfile?.totalEarningsIdr ?: allOrders.sumOf { it.cleanPayoutIdr() },
                            performanceSummary = performanceSummary,
                            capabilityProfile = capabilityProfile,
                            authToken = authSessionManager.getAuthTokenSync(),
                            onCompleteTraining = {
                                scope.launch {
                                    val result = orderViewModel.completeTraining()
                                    snackbarHostState.showSnackbar(result.getOrElse { it.message ?: "Training belum tersimpan." })
                                }
                            },
                            onLogout = { showLogoutDialog = true },
                            onSyncNow = { orderViewModel.syncPendingOrders() },
                            onOptimizeBattery = {
                                (context as? com.tembus.courier.ui.MainActivity)?.checkAndRequestBatteryWhitelist()
                            },
                            onClearCache = {
                                try {
                                    val deleted = context.cacheDir.deleteRecursively()
                                    scope.launch {
                                        snackbarHostState.showSnackbar(
                                            if (deleted) "Optimalisasi: Berhasil membersihkan berkas cache."
                                            else "Beberapa cache sedang digunakan dan dilewati."
                                        )
                                    }
                                } catch (e: Exception) {
                                    scope.launch { snackbarHostState.showSnackbar("Gagal merestart cache.") }
                                }
                            },
                            onUpdateCapacity = { maxWeightKg, maxPackages ->
                                scope.launch {
                                    val result = orderViewModel.updateCourierCapacity(maxWeightKg, maxPackages)
                                    snackbarHostState.showSnackbar(result.getOrElse { it.message ?: "Gagal update kapasitas" }.toString())
                                }
                            },
                            onRequestServiceUpgrade = { routeState = CourierRouteReducer.serviceUpgrade() },
                            onUpdateRadius = { radiusKm ->
                                scope.launch {
                                    val result = orderViewModel.updateCourierRadius(radiusKm)
                                    snackbarHostState.showSnackbar(
                                        result.fold(
                                            onSuccess = { "Radius diubah ke $radiusKm km" },
                                            onFailure = { it.message ?: "Gagal update radius" }
                                        )
                                    )
                                }
                            }
                            )
                    }
                    3 -> ProfileContent(
                    courierProfile = courierProfile,
                    courierName = displayCourierName,
                    courierRole = courierRole,
                    localSecurityManager = localSecurityManager,
                    pendingSyncCount = rolePendingOrders.size,
                    todayEarningsIdr = roleEarningsToday,
                    totalEarningsIdr = courierProfile?.totalEarningsIdr ?: allOrders.sumOf { it.cleanPayoutIdr() },
                    performanceSummary = performanceSummary,
                    capabilityProfile = capabilityProfile,
                    authToken = authSessionManager.getAuthTokenSync(),
                    onCompleteTraining = {
                        scope.launch {
                            val result = orderViewModel.completeTraining()
                            snackbarHostState.showSnackbar(result.getOrElse { it.message ?: "Training belum tersimpan." })
                        }
                    },
                    onLogout = { showLogoutDialog = true },
                    onSyncNow = { orderViewModel.syncPendingOrders() },
                    onOptimizeBattery = {
                        (context as? com.tembus.courier.ui.MainActivity)?.checkAndRequestBatteryWhitelist()
                    },
                    onClearCache = {
                        try {
                            val deleted = context.cacheDir.deleteRecursively()
                            scope.launch {
                                snackbarHostState.showSnackbar(
                                    if (deleted) "Optimalisasi: Berhasil membersihkan berkas cache."
                                    else "Beberapa cache sedang digunakan dan dilewati."
                                )
                            }
                        } catch (e: Exception) {
                            scope.launch { snackbarHostState.showSnackbar("Gagal merestart cache.") }
                        }
                    },
                    onUpdateCapacity = { maxWeightKg, maxPackages ->
                        scope.launch {
                            val result = orderViewModel.updateCourierCapacity(maxWeightKg, maxPackages)
                            snackbarHostState.showSnackbar(result.getOrElse { it.message ?: "Gagal update kapasitas" }.toString())
                        }
                    },
                    onRequestServiceUpgrade = { routeState = CourierRouteReducer.serviceUpgrade() },
                    onUpdateRadius = { radiusKm ->
                        scope.launch {
                            val result = orderViewModel.updateCourierRadius(radiusKm)
                            snackbarHostState.showSnackbar(
                                result.fold(
                                    onSuccess = { "Radius diubah ke $radiusKm km" },
                                    onFailure = { it.message ?: "Gagal update radius" }
                                )
                            )
                        }
                    }
                )
                }
            }
        }
        
        if (showMissingPhotoWarning) {
            AlertDialog(
                onDismissRequest = { showMissingPhotoWarning = false },
                title = { Text(text = "Akses Operasional Terkunci") },
                text = { Text(text = "Anda belum melakukan foto. Tunggu sampai kami menghubungi Anda untuk sesi ambil foto dan jaket operasional di Basecamp kami.") },
                confirmButton = {
                    TextButton(onClick = { showMissingPhotoWarning = false }) {
                        Text(text = "Mengerti")
                    }
                }
            )
        }
    }
}

@Composable
private fun HomeContent(
    courierName: String,
    courierRole: String,
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
    onCapturePod: (Order) -> Unit,
    onOpenDelivery: (Order) -> Unit,
    onViewOrders: () -> Unit,
    onScanPackage: () -> Unit
) {
    val activeOrder = orders.firstOrNull { it.status == "in_transit" || it.status == "picked_up" }
    val roleLabel = courierRoleLabel(courierRole)
    val roleHint = courierRoleHint(courierRole)
    val pendingLabel = courierPendingLabel(courierRole)
    val completedLabel = courierCompletedLabel(courierRole)
    val taskTitle = courierCurrentTaskTitle(courierRole)
    val emptyTitle = courierEmptyTaskTitle(courierRole)
    val emptyHint = if (isOnline) {
        "Cek daftar order atau tunggu tugas berikutnya."
    } else {
        "Aktifkan untuk bekerja atau cek daftar order."
    }

    // ponytail: single on_demand mode — retired regular/HomeContent branch 2026-08.
    OnDemandHomeHubEnterprise(
        courierName = courierName,
        totalOrders = totalOrders,
        pendingCount = pendingCount,
        deliveredCount = deliveredCount,
        todayEarningsIdr = todayEarningsIdr,
        orders = orders,
        offers = offers,
        services = services,
        capabilityProfile = capabilityProfile,
        courierVehicleType = courierVehicleType,
        routePreviews = routePreviews,
        activeRoutePlan = activeRoutePlan,
        hotspots = hotspots,
        mapsProviderConfig = mapsProviderConfig,
        isOnline = isOnline,
        onOnlineToggle = onOnlineToggle,
        onOpenDelivery = onOpenDelivery,
        onViewOrders = onViewOrders
    )
}

@Composable
internal fun isCourierDataStale(lastRemoteSyncAt: Long?): Boolean {
    if (lastRemoteSyncAt == null) return true
    return System.currentTimeMillis() - lastRemoteSyncAt > 2 * 60 * 1000
}
