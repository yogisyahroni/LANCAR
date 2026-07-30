package com.tembus.courier.ui.screens

import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import coil.request.ImageRequest
import android.Manifest
import android.content.Context
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

private val LogisticsOrange = Accent
private val SageBase = Background
private val DeepForest = PrimaryDark

private fun acceptOrderViaReceiver(context: Context, order: Order) {
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

private fun rejectOrderViaReceiver(context: Context, order: Order) {
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
            state.callTargetType
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
            callTargetType = raw.getOrNull(5)?.takeIf { it.isNotBlank() } ?: "customer"
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
    val courierRole = normalizeCourierMode(courierProfile?.applicationChannel ?: inferCourierRole(allOrders))
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
            onVerified = {
                faceVerifiedOrderIds = faceVerifiedOrderIds + order.orderId
                routeState = CourierRouteReducer.detail(order.orderId)
                scope.launch {
                    snackbarHostState.showSnackbar("Verifikasi wajah berhasil. Lanjutkan scan paket.")
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
            }
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
            onComplete = { routeState = CourierRouteReducer.home() }
        )
        return
    }

    // ── Towing Flow Screen ──────────────────────────────────
    if (routeState.screen == CourierRouteScreen.TOWING_FLOW) {
        val orderId = routeState.orderId ?: return
        TowingFlowScreen(
            orderId = orderId,
            onBackClick = { routeState = CourierRouteReducer.home() },
            onComplete = { routeState = CourierRouteReducer.home() }
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
                    openOrderDetail(order)
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
                        openOrderDetail(order)
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
                            onRequestServiceUpgrade = { routeState = CourierRouteReducer.serviceUpgrade() }
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
                    onRequestServiceUpgrade = { routeState = CourierRouteReducer.serviceUpgrade() }
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
private fun OnDemandBottomNavigation(
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
private fun onDemandNavigationItemColors(): NavigationBarItemColors =
    NavigationBarItemDefaults.colors(
        selectedIconColor = Color.White,
        selectedTextColor = Color.White,
        indicatorColor = LogisticsOrange.copy(alpha = 0.9f),
        unselectedIconColor = Color.White.copy(alpha = 0.66f),
        unselectedTextColor = Color.White.copy(alpha = 0.66f)
    )

@Composable
private fun OnDemandMapHome(
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
                    color = if (isOnline) Color(0xFF00C853) else Color(0xFFFF3B30),
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
private fun OnDemandServiceActivationCard(
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
private fun OnDemandMapDispatchCockpit(
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
                            .background(if (isOnline) Success.copy(alpha = alpha) else Color.Gray)
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
                    color = Color(0xFFF7F8FA),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, Primary.copy(alpha = 0.08f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Surface(color = Color.White, shape = RoundedCornerShape(8.dp)) {
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
                    value = if (serviceCount <= 0) "$vehicleLabel tersinkron" else "$activeServiceCount/$serviceCount $vehicleLabel"
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
private fun OnDemandMapMetricPill(
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
private fun OnDemandCompactStatusItem(
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
private fun OnDemandIncomingOfferSwipePanel(order: Order, onAccept: () -> Unit, onReject: () -> Unit) {
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
                    Text("Pekerjaan On-Demand Baru!", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = DeepForest)
                    Text(
                        "${order.displayServiceName()} • ${order.cleanPayoutIdr().toRupiahCompact()}",
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
private fun OnDemandNavigationModeCard(
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
    val targetPoint = if (targetIsPickup) {
        latLngOrNull(order.pickupLatitude, order.pickupLongitude)
    } else {
        latLngOrNull(order.dropLatitude, order.dropLongitude)
    }
    val targetAddressFallback = if (targetIsPickup) {
        order.pickupAddress.ifBlank { "Alamat pickup sedang disinkronkan" }
    } else {
        order.dropAddress.ifBlank { "Alamat penerima sedang disinkronkan" }
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
    val targetLabel = when {
        hasMultiStopPlan -> "Stop ${activeStopIndex + 1}/${activeStops.size}"
        targetIsPickup -> "Pickup"
        else -> "Penerima"
    }
    val navigationTitle = when {
        navigationModeActive -> "Navigasi TEMBUS aktif"
        hasMultiStopPlan -> "Stop berikutnya"
        targetIsPickup -> "Mode jemput paket"
        else -> "Mode antar ke penerima"
    }
    val primaryActionText = when {
        navigationModeActive && targetIsPickup -> "Saya di pickup"
        navigationModeActive -> "Saya di tujuan"
        hasMultiStopPlan -> "Mulai stop"
        targetIsPickup -> "Mulai ke pickup"
        else -> "Mulai ke penerima"
    }
    val supportCopy = if (navigationModeActive) {
        "TEMBUS menjaga rute dan stop aktif di layar ini. Gunakan Maps hanya jika butuh panduan suara."
    } else {
        "Mulai navigasi di TEMBUS supaya pickup, pengantaran, dan bukti kerja tetap dalam satu alur."
    }
    val routeDistanceText = when {
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
                        navigationTitle,
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        "${order.displayServiceName()} • ${order.packageCount.coerceAtLeast(1)} paket",
                        style = MaterialTheme.typography.labelMedium,
                        color = Color.White.copy(alpha = 0.68f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Surface(color = Color.White.copy(alpha = 0.12f), shape = RoundedCornerShape(10.dp)) {
                    Text(
                        order.cleanPayoutIdr().toRupiahCompact(),
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
                        color = LogisticsOrange,
                        fontWeight = FontWeight.Black,
                        style = MaterialTheme.typography.labelMedium
                    )
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
private fun OnDemandNavigationStatusChip(
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
private fun OnDemandNavigationRequirement(
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
private fun OnDemandServiceToggleRow(
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
private fun OnDemandActiveOrderCard(
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
                Text(order.cleanPayoutIdr().toRupiahCompact(), color = LogisticsOrange, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
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
private fun ActiveRoutePlanCard(
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
private fun OnDemandWaitingCard(onViewOrders: () -> Unit) {
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

    if (courierRole == "on_demand") {
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
        return
    }

    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = if (courierRole == "on_demand") DeepForest else Primary),
            shape = if (courierRole == "on_demand") {
                RoundedCornerShape(topStart = 16.dp, topEnd = 28.dp, bottomStart = 28.dp, bottomEnd = 16.dp)
            } else {
                RoundedCornerShape(8.dp)
            },
            border = if (courierRole == "on_demand") BorderStroke(1.dp, Outline.copy(alpha = 0.24f)) else null
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
                            text = "Halo, $courierName",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Text(
                            text = if (isOnline) roleHint else "Aktifkan untuk bekerja",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White.copy(alpha = 0.82f)
                        )
                    }
                    Switch(
                        checked = isOnline,
                        onCheckedChange = onOnlineToggle,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = if (courierRole == "on_demand") LogisticsOrange else Secondary,
                            uncheckedThumbColor = Color.White,
                            uncheckedTrackColor = Color.White.copy(alpha = 0.36f)
                        )
                    )
                }

                Surface(
                    color = if (courierRole == "on_demand" && isOnline) LogisticsOrange else Color.White.copy(alpha = 0.14f),
                    shape = RoundedCornerShape(topStart = 8.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = if (isOnline) Icons.Default.RadioButtonChecked else Icons.Default.RadioButtonUnchecked,
                            contentDescription = null,
                            tint = if (courierRole == "on_demand" && isOnline) PrimaryDark else if (isOnline) Secondary else Color.White.copy(alpha = 0.78f)
                        )
                        Column {
                            Text(
                                text = if (isOnline) "On Duty" else "Off Duty",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = if (courierRole == "on_demand" && isOnline) PrimaryDark else Color.White
                            )
                            Text(
                            text = if (courierRole == "on_demand" && isOnline) "Siap menerima tawaran prioritas" else if (isOnline) "Lokasi dan sinkronisasi aktif" else "Pelacakan lokasi berhenti",
                                style = MaterialTheme.typography.labelMedium,
                                color = if (courierRole == "on_demand" && isOnline) PrimaryDark.copy(alpha = 0.72f) else Color.White.copy(alpha = 0.78f)
                            )
                        }
                    }
                }
            }
        }

        if (courierRole == "on_demand") {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3E8)),
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 26.dp, bottomStart = 26.dp, bottomEnd = 16.dp),
                border = BorderStroke(1.dp, Accent.copy(alpha = 0.28f))
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Pendapatan Hari Ini", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = DeepForest)
                            Text("Pendapatan bersih hari ini", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = LogisticsOrange)
                    }
                    Text(
                        todayEarningsIdr.toRupiahCompact(),
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black,
                        color = DeepForest
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        InfoPill(icon = Icons.Default.Bolt, text = "${offers.size} tawaran")
                        InfoPill(icon = Icons.Default.CheckCircle, text = "$deliveredCount selesai")
                    }
                }
            }
        } else {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(8.dp)
            ) {
                Row(
                    modifier = Modifier.padding(14.dp).fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Surface(color = PrimaryLight, shape = RoundedCornerShape(8.dp)) {
                        Icon(
                            if (courierRole == "regular") Icons.Default.LocalShipping else Icons.Default.Bolt,
                            contentDescription = null,
                            tint = Primary,
                            modifier = Modifier.padding(10.dp).size(22.dp)
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(roleLabel, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(roleHint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text("$pendingCount tugas", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = Primary)
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            StatCard(title = "Total", value = "$totalOrders", modifier = Modifier.weight(1f))
            StatCard(title = "Aktif", value = "${orders.count { it.status == "assigned" || it.status == "picked_up" || it.status == "in_transit" }}", modifier = Modifier.weight(1f))
            StatCard(title = if (courierRole == "on_demand") "Pendapatan" else completedLabel, value = if (courierRole == "on_demand") todayEarningsIdr.toRupiahCompact() else "$deliveredCount", modifier = Modifier.weight(1f))
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(8.dp)
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(taskTitle, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    AssistChip(
                        onClick = onViewOrders,
                        label = { Text("$pendingCount $pendingLabel") },
                        leadingIcon = { Icon(Icons.Default.Schedule, contentDescription = null, modifier = Modifier.size(16.dp)) }
                    )
                }

                if (activeOrder != null) {
                    RouteSummary(order = activeOrder)
                    Button(
                        onClick = { onOpenDelivery(activeOrder) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Primary)
                    ) {
                        Icon(Icons.Default.Navigation, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Buka Pengantaran")
                    }
                    Button(
                        onClick = { onCapturePod(activeOrder) },
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Secondary)
                    ) {
                        Icon(Icons.Default.CameraAlt, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Ambil Bukti Terima")
                    }
                } else {
                    EmptyActiveOrder(
                        title = emptyTitle,
                        subtitle = emptyHint,
                        onViewOrders = onViewOrders
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = onScanPackage,
                modifier = Modifier.weight(1f).height(52.dp),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Secondary)
            ) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Scan Kode Paket")
            }
            OutlinedButton(
                onClick = onViewOrders,
                modifier = Modifier.weight(1f).height(52.dp),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(Icons.Default.LocalShipping, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Daftar Order")
            }
        }
    }
}

@Composable
private fun OnDemandHomeHubEnterprise(
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
                            Text(activeOrder.cleanPayoutIdr().toRupiahCompact(), style = MaterialTheme.typography.titleLarge, color = LogisticsOrange, fontWeight = FontWeight.Black)
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

@Composable
private fun OnDemandHomeHub(
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

@Composable
private fun ServiceCoverageToggleRow(
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

private fun CourierServiceProduct.supportsVehicleGroup(vehicleGroup: String): Boolean {
    if (vehicleGroup.isBlank()) return false
    if (vehicleTypes.isEmpty()) return true
    return vehicleTypes.any { normalizedVehicleGroup(it) == vehicleGroup }
}

private fun CourierServiceCapability.toServiceProduct(vehicleGroup: String): CourierServiceProduct {
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

private fun resolveMaxActiveOnDemandJobs(
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

private fun normalizedVehicleGroup(raw: String?): String {
    val value = raw?.trim()?.lowercase().orEmpty()
    return when {
        value.isBlank() -> ""
        value in setOf("car", "mobil", "van", "box", "pickup", "truck") -> "car"
        else -> "motor"
    }
}

private fun String.toVehicleLabel(): String = when (this) {
    "car" -> "mobil"
    "" -> "belum tersinkron"
    else -> "motor"
}

private fun decodeRuntimeRoutePolyline(encoded: String?): List<LatLng> {
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
private fun HotspotRow(hotspot: CourierHotspot) {
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
private fun OnDemandOfferQueueDialog(
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
private fun OnDemandOfferQueueItem(
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
                InfoPill(icon = Icons.Default.Payments, text = order.cleanPayoutIdr().toRupiahCompact())
            }

            OfferRouteRow(
                icon = Icons.Default.Storefront,
                label = "Pickup",
                value = order.pickupAddress.ifBlank { "Alamat pickup sedang disinkronkan" }
            )
            OfferRouteRow(
                icon = Icons.Default.Place,
                label = "Tujuan",
                value = order.dropAddress.ifBlank { "Alamat tujuan dibuka setelah diterima" }
            )

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
                            pickupPoint?.let { add(RuntimeMapMarker("pickup-${order.orderId}", it, "Pickup", order.pickupAddress)) }
                            dropPoint?.let { add(RuntimeMapMarker("dropoff-${order.orderId}", it, "Tujuan", order.dropAddress)) }
                        },
                        routePoints = buildList {
                            pickupPoint?.let { add(it) }
                            dropPoint?.let { add(it) }
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
private fun OnDemandOfferDialog(
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
                    Text(order.cleanPayoutIdr().toRupiahCompact(), color = Primary, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
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
                            label = "Titik Jemput",
                            value = order.pickupAddress.ifBlank { "Alamat jemput sedang disinkronkan" }
                        )
                        OfferRouteRowDark(
                            icon = Icons.Default.Place,
                            tint = Color(0xFFFF3B30),
                            label = "Tujuan",
                            value = order.dropAddress.ifBlank { "Alamat tujuan dibuka setelah diterima" }
                        )
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
                                pickupPoint?.let { add(RuntimeMapMarker("pickup", it, "Titik Jemput", order.pickupAddress)) }
                                dropPoint?.let { add(RuntimeMapMarker("dropoff", it, "Tujuan", order.dropAddress)) }
                            },
                            routePoints = buildList {
                                pickupPoint?.let { add(it) }
                                dropPoint?.let { add(it) }
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
private fun SwipeToAcceptTrack(
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
private fun OfferRouteRowDark(
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
private fun OfferRouteRow(
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
private const val DAILY_EARNINGS_TARGET_IDR = 150_000

@Composable
private fun DailyEarningsTargetBar(todayEarningsIdr: Int) {
    val progress = (todayEarningsIdr.toFloat() / DAILY_EARNINGS_TARGET_IDR).coerceIn(0f, 1f)
    val pct = (progress * 100).toInt()
    val remaining = (DAILY_EARNINGS_TARGET_IDR - todayEarningsIdr).coerceAtLeast(0)
    val isTargetReached = progress >= 1f

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                text = if (isTargetReached) "🎯 Target tercapai!" else "Target harian",
                style = MaterialTheme.typography.labelSmall,
                color = if (isTargetReached) Success else MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = if (isTargetReached) "Rp ${todayEarningsIdr.toRupiahCompact()}"
                else "Rp ${remaining.toRupiahCompact()} lagi",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = if (isTargetReached) Success else LogisticsOrange
            )
        }
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
            color = if (isTargetReached) Success else LogisticsOrange,
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
        )
    }
}

@Composable
private fun StatCard(title: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp, horizontal = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = Primary
            )
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun RouteSummary(order: Order) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = order.orderId.ifBlank { "Order aktif" },
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = Primary
        )
        RouteLine(
            icon = Icons.Default.Storefront,
            label = "Pickup",
            value = order.pickupAddress.ifBlank { "Alamat pickup sedang disinkronkan" }
        )
        RouteLine(
            icon = Icons.Default.LocationOn,
            label = "Tujuan",
            value = order.dropAddress.ifBlank { "Alamat tujuan sedang disinkronkan" }
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            InfoPill(icon = Icons.Default.Route, text = order.distance.ifBlank { "Jarak dihitung" })
            InfoPill(icon = Icons.Default.Payments, text = order.cleanPayoutIdr().toRupiahCompact())
        }
    }
}

@Composable
private fun RouteLine(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String
) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.size(20.dp))
        Column {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 2)
        }
    }
}

@Composable
private fun InfoPill(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Surface(
        color = PrimaryLight,
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.size(16.dp))
            Text(text, style = MaterialTheme.typography.labelMedium, color = Primary, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun EmptyActiveOrder(
    title: String,
    subtitle: String,
    onViewOrders: () -> Unit
) {
    Surface(color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f), shape = RoundedCornerShape(8.dp)) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.Inventory2, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            TextButton(onClick = onViewOrders) {
                Text("Lihat Order")
            }
        }
    }
}

@Composable
private fun OrdersContent(
    orders: List<Order>,
    courierRole: String,
    isSyncing: Boolean,
    isOnline: Boolean,
    lastRemoteSyncAt: Long?,
    onOrderClick: (Order) -> Unit,
    onSync: () -> Unit,
    onRefresh: () -> Unit
) {
    if (orders.isEmpty() && isSyncing) {
        CourierListSkeleton(title = "Menyiapkan daftar order")
    } else if (orders.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.LocalShipping,
                    contentDescription = null,
                    modifier = Modifier.size(64.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Belum ada order",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = orderSyncHint(isOnline, lastRemoteSyncAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedButton(onClick = onRefresh) {
                    Icon(Icons.Default.Refresh, contentDescription = null)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Refresh")
                }
            }
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            DataFreshnessBanner(
                isOnline = isOnline,
                lastRemoteSyncAt = lastRemoteSyncAt,
                isSyncing = isSyncing,
                onRefresh = onRefresh
            )
            OrderScreen(
                orders = orders,
                courierRole = courierRole,
                onOrderClick = onOrderClick,
                onSync = onSync,
                isSyncing = isSyncing
            )
        }
    }
}

@Composable
private fun CourierInlineErrorState(
    message: String,
    onRetry: () -> Unit,
    onDismiss: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.error.copy(alpha = 0.10f),
        shape = RoundedCornerShape(10.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.28f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = Icons.Default.SyncProblem,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(20.dp)
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Data belum tersinkron", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                Text(
                    message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            TextButton(onClick = onRetry, contentPadding = PaddingValues(horizontal = 8.dp)) {
                Text("Coba Lagi")
            }
            IconButton(onClick = onDismiss, modifier = Modifier.size(40.dp)) {
                Icon(Icons.Default.Close, contentDescription = "Tutup pesan")
            }
        }
    }
}

@Composable
private fun CourierListSkeleton(title: String) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        DataFreshnessSkeleton(title)
        repeat(4) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(8.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.10f))
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            CourierSkeletonBlock(width = 150.dp, height = 16.dp)
                            CourierSkeletonBlock(width = 98.dp, height = 12.dp)
                        }
                        CourierSkeletonBlock(width = 72.dp, height = 28.dp)
                    }
                    CourierSkeletonBlock(width = 260.dp, height = 14.dp)
                    CourierSkeletonBlock(width = 220.dp, height = 14.dp)
                }
            }
        }
    }
}

@Composable
private fun DataFreshnessSkeleton(title: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Info.copy(alpha = 0.10f),
        shape = RoundedCornerShape(10.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Info, strokeWidth = 2.dp)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                CourierSkeletonBlock(width = 210.dp, height = 12.dp)
            }
        }
    }
}

@Composable
private fun CourierSkeletonBlock(width: androidx.compose.ui.unit.Dp, height: androidx.compose.ui.unit.Dp) {
    Box(
        modifier = Modifier
            .width(width)
            .height(height)
            .background(
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.14f),
                shape = RoundedCornerShape(6.dp)
            )
    )
}

@Composable
private fun DataFreshnessBanner(
    isOnline: Boolean,
    lastRemoteSyncAt: Long?,
    isSyncing: Boolean,
    onRefresh: () -> Unit
) {
    val stale = isCourierDataStale(lastRemoteSyncAt)
    val shouldShow = !isOnline || stale || lastRemoteSyncAt == null
    if (!shouldShow) return

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (!isOnline) Warning.copy(alpha = 0.12f) else Info.copy(alpha = 0.12f),
        shape = RoundedCornerShape(10.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = if (!isOnline || stale) Icons.Default.SyncProblem else Icons.Default.Sync,
                contentDescription = null,
                tint = if (!isOnline) Warning else Info
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (!isOnline) "Data lokal/offline" else "Menunggu data live terbaru",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = orderSyncHint(isOnline, lastRemoteSyncAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            TextButton(
                onClick = onRefresh,
                enabled = !isSyncing
            ) {
                Text(if (isSyncing) "Sync..." else "Coba Lagi")
            }
        }
    }
}

private fun isCourierDataStale(lastRemoteSyncAt: Long?): Boolean {
    if (lastRemoteSyncAt == null) return true
    return System.currentTimeMillis() - lastRemoteSyncAt > 2 * 60 * 1000
}

@Composable
private fun WalletContent(
    courierName: String,
    todayEarningsIdr: Int,
    totalEarningsIdr: Int,
    localSecurityManager: LocalDeviceSecurityManager,
    earningsLedger: CourierEarningsLedger?,
    payoutSummary: CourierPayoutSummaryData?,
    payoutRequests: List<CourierPayoutRequestItem>,
    isPayoutSubmitting: Boolean,
    onRefreshPayout: () -> Unit,
    onRequestPayout: suspend (Int, String) -> Result<CourierPayoutRequestItem>
) {
    var showPayoutDialog by remember { mutableStateOf(false) }
    var showPayoutSecurityChallenge by remember { mutableStateOf(false) }
    var selectedPayoutRequest by remember { mutableStateOf<CourierPayoutRequestItem?>(null) }

    if (showPayoutDialog && payoutSummary != null) {
        PayoutRequestDialog(
            payoutSummary = payoutSummary,
            isSubmitting = isPayoutSubmitting,
            onDismiss = { showPayoutDialog = false },
            onSubmit = onRequestPayout,
            onSubmitted = { request ->
                showPayoutDialog = false
                selectedPayoutRequest = request
                onRefreshPayout()
            }
        )
    }

    if (showPayoutSecurityChallenge) {
        LocalSecurityChallengeDialog(
            securityManager = localSecurityManager,
            title = "Verifikasi pencairan saldo",
            message = "Gunakan PIN atau biometrik lokal sebelum membuka pengajuan pencairan.",
            onCancel = { showPayoutSecurityChallenge = false },
            onVerified = {
                showPayoutSecurityChallenge = false
                showPayoutDialog = true
            }
        )
    }

    selectedPayoutRequest?.let { request ->
        PayoutRequestDetailDialog(
            request = request,
            onDismiss = { selectedPayoutRequest = null }
        )
    }

    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "Dompet Kurir",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(containerColor = DeepForest)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Surface(color = Color.White.copy(alpha = 0.14f), shape = RoundedCornerShape(8.dp)) {
                        Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.padding(12.dp).size(28.dp))
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(courierName, color = Color.White, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleLarge)
                        Text("Saldo dan pencairan on-demand", color = Color.White.copy(alpha = 0.72f), style = MaterialTheme.typography.bodyMedium)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    MiniProfileStat("Hari ini", todayEarningsIdr.toRupiahCompact(), Modifier.weight(1f))
                    MiniProfileStat("Total", totalEarningsIdr.toRupiahCompact(), Modifier.weight(1f))
                }
            }
        }

        PayoutBalanceCard(
            payoutSummary = payoutSummary,
            payoutRequests = payoutRequests,
            isSubmitting = isPayoutSubmitting,
            onRefresh = onRefreshPayout,
            onRequestClick = {
                if (localSecurityManager.settings.value.active) {
                    showPayoutSecurityChallenge = true
                } else {
                    showPayoutDialog = true
                }
            },
            onRequestDetail = { selectedPayoutRequest = it }
        )

        if (earningsLedger == null) {
            CourierWalletSkeleton()
        } else {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(8.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Surface(color = Success.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                            Icon(Icons.AutoMirrored.Filled.ReceiptLong, contentDescription = null, tint = Success, modifier = Modifier.padding(10.dp).size(22.dp))
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Ledger pendapatan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(
                                "Saldo kurir dan riwayat settlement dari sistem",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        MiniProfileStat("Tersedia", earningsLedger.summary.availableBalanceIdr.toRupiahCompact(), Modifier.weight(1f))
                        MiniProfileStat("Pending", earningsLedger.summary.pendingBalanceIdr.toRupiahCompact(), Modifier.weight(1f))
                        MiniProfileStat("Total", earningsLedger.summary.totalBalanceIdr.toRupiahCompact(), Modifier.weight(1f))
                    }

                    PayoutAccountPanel(earningsLedger)

                    if (earningsLedger.transactions.isNotEmpty()) {
                        HorizontalDivider()
                        earningsLedger.transactions.take(6).forEach { transaction ->
                            EarningsLedgerRow(transaction)
                        }
                    } else {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            color = PrimaryLight.copy(alpha = 0.55f),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                "Belum ada transaksi pendapatan.",
                                modifier = Modifier.padding(12.dp),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CourierWalletSkeleton() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.10f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                CircularProgressIndicator(modifier = Modifier.size(22.dp), color = Primary, strokeWidth = 3.dp)
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Menyiapkan ledger pendapatan", fontWeight = FontWeight.Bold)
                    CourierSkeletonBlock(width = 240.dp, height = 12.dp)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                CourierSkeletonBlock(width = 96.dp, height = 52.dp)
                CourierSkeletonBlock(width = 96.dp, height = 52.dp)
                CourierSkeletonBlock(width = 96.dp, height = 52.dp)
            }
            repeat(3) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        CourierSkeletonBlock(width = 150.dp, height = 14.dp)
                        CourierSkeletonBlock(width = 92.dp, height = 11.dp)
                    }
                    CourierSkeletonBlock(width = 82.dp, height = 16.dp)
                }
            }
        }
    }
}

@Composable
private fun ProfileContent(
    courierProfile: com.tembus.courier.data.model.CourierProfile?,
    courierName: String,
    courierRole: String,
    localSecurityManager: LocalDeviceSecurityManager,
    pendingSyncCount: Int,
    todayEarningsIdr: Int,
    totalEarningsIdr: Int,
    performanceSummary: CourierPerformanceSummary?,
    capabilityProfile: CourierCapabilityProfile?,
    authToken: String?,
    onCompleteTraining: () -> Unit,
    onLogout: () -> Unit,
    onSyncNow: () -> Unit,
    onOptimizeBattery: () -> Unit,
    onClearCache: () -> Unit,
    onUpdateCapacity: (Double?, Int?) -> Unit,
    onRequestServiceUpgrade: () -> Unit
) {
    var showDiagnostics by remember { mutableStateOf(false) }
    var showResetLocalDataDialog by remember { mutableStateOf(false) }
    var showCapacityDialog by remember { mutableStateOf(false) }
    var capacityWeight by remember { mutableStateOf(courierProfile?.maxWeightCapacityKg?.toString() ?: "") }
    var capacityPackages by remember { mutableStateOf(courierProfile?.maxPackagesCapacity?.toString() ?: "") }

    if (showCapacityDialog) {
        AlertDialog(
            onDismissRequest = { showCapacityDialog = false },
            title = { Text("Atur Kapasitas Bawaan") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Kapasitas ini digunakan untuk Bulk Order (multi-stop).", style = MaterialTheme.typography.bodyMedium)
                    androidx.compose.material3.OutlinedTextField(
                        value = capacityWeight,
                        onValueChange = { capacityWeight = it },
                        label = { Text("Maks. Berat (kg)") },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number)
                    )
                    androidx.compose.material3.OutlinedTextField(
                        value = capacityPackages,
                        onValueChange = { capacityPackages = it },
                        label = { Text("Maks. Jumlah Paket") },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number)
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showCapacityDialog = false
                        onUpdateCapacity(capacityWeight.toDoubleOrNull(), capacityPackages.toIntOrNull())
                    }
                ) { Text("Simpan") }
            },
            dismissButton = {
                TextButton(onClick = { showCapacityDialog = false }) { Text("Batal") }
            }
        )
    }

    if (showResetLocalDataDialog) {
        AlertDialog(
            onDismissRequest = { showResetLocalDataDialog = false },
            title = { Text("Reset Data Lokal") },
            text = {
                Text(
                    if (pendingSyncCount > 0) {
                        "Masih ada $pendingSyncCount data yang belum terkirim. Selesaikan sinkronisasi dulu sebelum reset data lokal."
                    } else {
                        "Tindakan ini membersihkan berkas sementara aplikasi. Order dan sesi akun tetap tersimpan."
                    }
                )
            },
            confirmButton = {
                TextButton(
                    enabled = pendingSyncCount == 0,
                    onClick = {
                        showResetLocalDataDialog = false
                        onClearCache()
                    }
                ) {
                    Text("Reset", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showResetLocalDataDialog = false }) {
                    Text("Batal")
                }
            },
            shape = RoundedCornerShape(8.dp)
        )
    }

    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "Profil Kurir",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(containerColor = Primary)
        ) {
            Row(
                modifier = Modifier.padding(16.dp).fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color.White.copy(alpha = 0.18f)
                ) {
                    if (!courierProfile?.profilePhotoUrl.isNullOrBlank() && authToken != null) {
                        AsyncImage(
                            model = coil.request.ImageRequest.Builder(LocalContext.current)
                                .data("${com.tembus.courier.BuildConfig.BASE_URL.dropLastWhile { it == '/' }}${courierProfile?.profilePhotoUrl}")
                                .addHeader("Authorization", "Bearer $authToken")
                                .crossfade(true)
                                .build(),
                            contentDescription = "Foto Profil",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.size(52.dp).clip(RoundedCornerShape(8.dp))
                        )
                    } else {
                        Icon(
                            Icons.Default.Person,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.padding(12.dp).size(28.dp)
                        )
                    }
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(courierName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Color.White)
                    Text(courierRoleLabel(courierRole), style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.78f))
                }
                Surface(
                    color = Color.White.copy(alpha = 0.14f),
                    shape = RoundedCornerShape(8.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.34f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            Icons.Default.VerifiedUser,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            "Aktif",
                            style = MaterialTheme.typography.labelLarge,
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        LocalSecuritySettingsPanel(
            securityManager = localSecurityManager,
            onNotice = {}
        )

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(8.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("Kesiapan Operasional", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                ProfileMetricRow(
                    icon = Icons.Default.AccountBalanceWallet,
                    title = "Pendapatan hari ini",
                    value = todayEarningsIdr.toRupiahCompact(),
                    color = Secondary
                )
                ProfileMetricRow(
                    icon = Icons.Default.Payments,
                    title = "Total pendapatan",
                    value = totalEarningsIdr.toRupiahCompact(),
                    color = Success
                )
                ProfileMetricRow(
                    icon = Icons.Default.CloudDone,
                    title = "Sinkronisasi",
                    value = if (pendingSyncCount > 0) "$pendingSyncCount tertunda" else "Tersinkron",
                    color = if (pendingSyncCount > 0) Warning else Success
                )
                ProfileMetricRow(
                    icon = Icons.Default.GpsFixed,
                    title = "Lokasi & tracking",
                    value = "Siap",
                    color = Primary
                )
                ProfileMetricRow(
                    icon = Icons.Default.BatteryChargingFull,
                    title = "Latar belakang",
                    value = "Aktif",
                    color = Success
                )
            }
        }

        capabilityProfile?.let { capability ->
            val enabledCapabilities = capability.serviceCapabilities.filter { item ->
                item.status.equals("enabled", ignoreCase = true)
            }
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(8.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("Kendaraan & Layanan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        TextButton(onClick = { showCapacityDialog = true }) {
                            Text("Atur Kapasitas", color = LogisticsOrange)
                        }
                    }
                    capability.vehicle?.let { vehicle ->
                        Surface(color = PrimaryLight.copy(alpha = 0.72f), shape = RoundedCornerShape(8.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Icon(Icons.Default.TwoWheeler, contentDescription = null, tint = Primary, modifier = Modifier.size(28.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        listOfNotNull(vehicle.brand, vehicle.model).joinToString(" ").ifBlank { courierRoleLabel(courierRole) },
                                        fontWeight = FontWeight.Black,
                                        color = Primary
                                    )
                                    Text(
                                        "${vehicle.plateNumber} • ${vehicle.engineCc ?: 0} cc • ${vehicle.productionYear ?: "-"}",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                CapabilityStatusPill(vehicle.verificationStatus)
                            }
                        }
                    }

                    enabledCapabilities.take(5).forEach { item ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Surface(
                                color = if (item.status == "enabled") Success.copy(alpha = 0.12f) else Warning.copy(alpha = 0.12f),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Icon(
                                    if (item.status == "enabled") Icons.Default.CheckCircle else Icons.Default.PendingActions,
                                    contentDescription = null,
                                    tint = if (item.status == "enabled") Success else Warning,
                                    modifier = Modifier.padding(8.dp).size(18.dp)
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.serviceName, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    "${item.serviceCategory.replace("_", " ")} • maks ${item.maxWeightKg ?: 0.0} kg",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            CapabilityStatusPill(item.status)
                        }
                    }
                    if (enabledCapabilities.isEmpty()) {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            color = Warning.copy(alpha = 0.12f),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                "Belum ada layanan aktif untuk kendaraan ini.",
                                modifier = Modifier.padding(12.dp),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    HorizontalDivider()
                    Text("Onboarding", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    capability.onboardingSteps.forEach { step ->
                        ProfileMetricRow(
                            icon = if (step.status == "complete") Icons.Default.CheckCircle else Icons.Default.PendingActions,
                            title = step.title,
                            value = step.status.replace("_", " "),
                            color = if (step.status == "complete") Success else Warning
                        )
                    }
                    if (capability.trainingCompletions.isEmpty()) {
                        Button(
                            onClick = onCompleteTraining,
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Primary)
                        ) {
                            Icon(Icons.Default.School, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Selesaikan Training Operasional")
                        }
                    }
                }
            }
        }

        performanceSummary?.let { summary ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(8.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Surface(color = Secondary.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                            Icon(Icons.Default.WorkspacePremium, contentDescription = null, tint = Secondary, modifier = Modifier.padding(10.dp).size(22.dp))
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Performa Kurir", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(
                                "Tier ${summary.tier.tierName} • ${summary.tier.benefitSummary}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        MiniProfileStat("Hari ini", summary.todayEarningsIdr.toRupiahCompact(), Modifier.weight(1f))
                        MiniProfileStat("Minggu ini", summary.weekEarningsIdr.toRupiahCompact(), Modifier.weight(1f))
                        MiniProfileStat("Rating", "%.1f".format(summary.avgRating), Modifier.weight(1f))
                    }
                    ProfileMetricRow(
                        icon = Icons.Default.TaskAlt,
                        title = "Completion rate",
                        value = "${summary.completionRatePct}%",
                        color = Success
                    )
                    ProfileMetricRow(
                        icon = Icons.Default.Bolt,
                        title = "Acceptance rate",
                        value = "${summary.acceptanceRatePct}%",
                        color = Primary
                    )
                    if (summary.incentives.isNotEmpty()) {
                        HorizontalDivider()
                        Text("Insentif aktif", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        summary.incentives.take(2).forEach { incentive ->
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(incentive.title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        "${incentive.progressPercent}%",
                                        style = MaterialTheme.typography.labelLarge,
                                        color = Secondary,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                LinearProgressIndicator(
                                    progress = { incentive.progressPercent.coerceIn(0, 100) / 100f },
                                    modifier = Modifier.fillMaxWidth().height(8.dp),
                                    color = Secondary,
                                    trackColor = PrimaryLight
                                )
                                Text(
                                    "${incentive.progressDeliveries}/${incentive.targetDeliveries} selesai • Bonus ${incentive.rewardIdr.toRupiahCompact()}",
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
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(8.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Surface(color = PrimaryLight, shape = RoundedCornerShape(8.dp)) {
                        Icon(
                            Icons.Default.HealthAndSafety,
                            contentDescription = null,
                            tint = Primary,
                            modifier = Modifier.padding(10.dp).size(22.dp)
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Kesehatan Aplikasi", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(
                            if (pendingSyncCount > 0) "Perlu sinkronisasi data tertunda" else "Aplikasi siap untuk operasional",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    TextButton(onClick = { showDiagnostics = !showDiagnostics }) {
                        Text(if (showDiagnostics) "Tutup" else "Diagnostik")
                    }
                }

                Button(
                    onClick = onOptimizeBattery,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Secondary)
                ) {
                    Icon(Icons.Default.BatteryChargingFull, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Optimalkan Latar Belakang")
                }

                AnimatedVisibility(visible = showDiagnostics) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        HorizontalDivider()
                        ProfileMetricRow(
                            icon = if (pendingSyncCount > 0) Icons.Default.SyncProblem else Icons.Default.CheckCircle,
                            title = "Status data lokal",
                            value = if (pendingSyncCount > 0) "$pendingSyncCount belum terkirim" else "Aman",
                            color = if (pendingSyncCount > 0) Warning else Success
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            MaintenanceButton(
                                icon = Icons.Default.Sync,
                                label = "Sinkronkan",
                                onClick = onSyncNow,
                                modifier = Modifier.weight(1f)
                            )
                            MaintenanceButton(
                                icon = Icons.Default.DeleteSweep,
                                label = "Reset Lokal",
                                onClick = { showResetLocalDataDialog = true },
                                modifier = Modifier.weight(1f),
                                enabled = pendingSyncCount == 0
                            )
                        }
                    }
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(8.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("Layanan & Kemampuan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(
                    "Tingkatkan pendapatan dengan menambahkan layanan baru seperti Tambal Ban atau Towing.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Button(
                    onClick = onRequestServiceUpgrade,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.Build, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Daftar Layanan Tambahan")
                }
            }
        }

        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
        ) {
            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Keluar Aplikasi")
        }
    }
}

@Composable
private fun PayoutBalanceCard(
    payoutSummary: CourierPayoutSummaryData?,
    payoutRequests: List<CourierPayoutRequestItem>,
    isSubmitting: Boolean,
    onRefresh: () -> Unit,
    onRequestClick: () -> Unit,
    onRequestDetail: (CourierPayoutRequestItem) -> Unit
) {
    val summary = payoutSummary?.summary
    val account = payoutSummary?.payoutAccount
    val eligibility = payoutSummary?.eligibility
    val policy = payoutSummary?.policy
    val actionState = resolvePayoutActionState(payoutSummary, isSubmitting)
    val canRequest = actionState.enabled

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(color = Success.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                    Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = Success, modifier = Modifier.padding(10.dp).size(22.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Pencairan saldo", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("Settlement pendapatan ke rekening terverifikasi", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = onRefresh) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh pencairan", tint = Primary)
                }
            }

            if (payoutSummary == null) {
                Surface(modifier = Modifier.fillMaxWidth(), color = PrimaryLight.copy(alpha = 0.55f), shape = RoundedCornerShape(8.dp)) {
                    Text(
                        "Memuat saldo pencairan dari sistem...",
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                return@Column
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                MiniProfileStat("Tersedia", summary?.availableBalanceIdr?.toRupiahCompact() ?: "Rp0", Modifier.weight(1f))
                MiniProfileStat("Pending", summary?.pendingBalanceIdr?.toRupiahCompact() ?: "Rp0", Modifier.weight(1f))
                MiniProfileStat("Total", summary?.totalBalanceIdr?.toRupiahCompact() ?: "Rp0", Modifier.weight(1f))
            }

            PayoutAccountStatusPanel(account)

            eligibility?.reasons?.takeIf { it.isNotEmpty() }?.let { reasons ->
                Surface(modifier = Modifier.fillMaxWidth(), color = Warning.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Pencairan sedang ditinjau", fontWeight = FontWeight.Bold, color = DeepForest)
                        reasons.take(2).forEach { reason ->
                            Text(reason, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            Button(
                onClick = onRequestClick,
                enabled = canRequest,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Secondary)
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                } else {
                    Icon(Icons.Default.Payments, contentDescription = null, modifier = Modifier.size(18.dp))
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text("Ajukan Pencairan")
            }

            Text(
                "Minimum ${policy?.minAmountIdr?.toRupiahCompact() ?: "Rp25rb"} • Limit harian ${policy?.dailyLimitIdr?.toRupiahCompact() ?: "-"}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            HorizontalDivider()
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Riwayat pencairan", modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text("${payoutRequests.size} pengajuan", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            if (payoutRequests.isEmpty()) {
                Surface(modifier = Modifier.fillMaxWidth(), color = PrimaryLight.copy(alpha = 0.55f), shape = RoundedCornerShape(8.dp)) {
                    Text(
                        "Belum ada pengajuan pencairan.",
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                payoutRequests.take(5).forEach { request ->
                    PayoutRequestRow(request = request, onClick = { onRequestDetail(request) })
                }
            }
        }
    }
}

@Composable
private fun PayoutAccountStatusPanel(account: com.tembus.courier.data.model.CourierPayoutAccount?) {
    val status = account?.status ?: "incomplete"
    val isVerified = status == "verified"
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (isVerified) PrimaryLight.copy(alpha = 0.58f) else Warning.copy(alpha = 0.12f),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(color = Color.White.copy(alpha = 0.72f), shape = RoundedCornerShape(8.dp)) {
                Icon(Icons.Default.AccountBalance, contentDescription = null, tint = if (isVerified) Primary else Warning, modifier = Modifier.padding(8.dp).size(18.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text("Rekening pencairan", fontWeight = FontWeight.Bold, color = DeepForest)
                Text(
                    if (account != null) {
                        "${account.bankCode ?: "-"} • ${maskAccountNumber(account.accountNumber.orEmpty())} • ${account.accountName ?: "-"}"
                    } else {
                        "Rekening sedang ditinjau operasional."
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            CapabilityStatusPill(status)
        }
    }
}

@Composable
private fun PayoutRequestRow(request: CourierPayoutRequestItem, onClick: () -> Unit) {
    val color = payoutStatusColor(request.status)
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        color = Color.Transparent,
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                Icon(payoutStatusIcon(request.status), contentDescription = null, tint = color, modifier = Modifier.padding(8.dp).size(18.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(request.requestNumber, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(request.statusLabel ?: payoutStatusLabel(request.status), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    payoutStatusMessage(request),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(request.netAmountIdr.toRupiahCompact(), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = DeepForest)
                Text(shortDateLabel(request.requestedAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun PayoutRequestDialog(
    payoutSummary: CourierPayoutSummaryData,
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onSubmit: suspend (Int, String) -> Result<CourierPayoutRequestItem>,
    onSubmitted: (CourierPayoutRequestItem) -> Unit
) {
    val scope = rememberCoroutineScope()
    var step by rememberSaveable { mutableStateOf("amount") }
    var amountText by rememberSaveable { mutableStateOf("") }
    var pin by rememberSaveable { mutableStateOf("") }
    var errorText by remember { mutableStateOf<String?>(null) }
    val maxAmount = payoutSummary.eligibility.maxRequestableIdr
    val amount = amountText.filter { it.isDigit() }.toIntOrNull() ?: 0
    val amountValid = amount >= payoutSummary.policy.minAmountIdr && amount <= maxAmount
    val account = payoutSummary.payoutAccount

    Dialog(onDismissRequest = onDismiss) {
        Card(shape = RoundedCornerShape(8.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Surface(color = Secondary.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                        Icon(Icons.Default.Payments, contentDescription = null, tint = Secondary, modifier = Modifier.padding(10.dp).size(22.dp))
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Ajukan Pencairan", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text("Dana dikirim ke rekening terverifikasi", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                when (step) {
                    "amount" -> {
                        Text("Nominal pencairan", fontWeight = FontWeight.Bold)
                        OutlinedTextField(
                            value = amountText,
                            onValueChange = { amountText = it.filter { char -> char.isDigit() }.take(9) },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Nominal") },
                            prefix = { Text("Rp") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            shape = RoundedCornerShape(8.dp)
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            quickPayoutAmounts(payoutSummary).forEach { quick ->
                                AssistChip(
                                    onClick = { amountText = quick.toString() },
                                    label = { Text(quick.toRupiahCompact()) },
                                    enabled = quick <= maxAmount
                                )
                            }
                        }
                        Text("Saldo tersedia ${payoutSummary.summary.availableBalanceIdr.toRupiahCompact()} • Maks ${maxAmount.toRupiahCompact()}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }

                    "review" -> {
                        Text("Review pencairan", fontWeight = FontWeight.Bold)
                        PayoutReviewRow("Nominal", amount.toRupiahCompact())
                        PayoutReviewRow("Rekening", "${account?.bankCode ?: "-"} • ${maskAccountNumber(account?.accountNumber.orEmpty())}")
                        PayoutReviewRow("Atas nama", account?.accountName ?: "-")
                        Surface(modifier = Modifier.fillMaxWidth(), color = PrimaryLight.copy(alpha = 0.55f), shape = RoundedCornerShape(8.dp)) {
                            Text(
                                "Pastikan nominal dan rekening sudah benar. Setelah dikirim, pengajuan masuk tinjauan treasury.",
                                modifier = Modifier.padding(12.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    "pin" -> {
                        Text("Verifikasi PIN", fontWeight = FontWeight.Bold)
                        OutlinedTextField(
                            value = pin,
                            onValueChange = { pin = it.filter { char -> char.isDigit() }.take(6) },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("PIN transaksi") },
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                            shape = RoundedCornerShape(8.dp)
                        )
                        Text("PIN diperlukan sebagai step-up keamanan pencairan.", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                errorText?.let {
                    Surface(modifier = Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.error.copy(alpha = 0.1f), shape = RoundedCornerShape(8.dp)) {
                        Text(it, modifier = Modifier.padding(10.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium)
                    }
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = {
                            errorText = null
                            if (step == "amount") onDismiss() else step = if (step == "pin") "review" else "amount"
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(if (step == "amount") "Batal" else "Kembali")
                    }
                    Button(
                        onClick = {
                            errorText = null
                            when (step) {
                                "amount" -> {
                                    if (amountValid) step = "review" else errorText = "Nominal harus sesuai minimum dan saldo tersedia."
                                }
                                "review" -> step = "pin"
                                else -> {
                                    if (pin.length < 4) {
                                        errorText = "PIN transaksi belum lengkap."
                                    } else {
                                        scope.launch {
                                            val result = onSubmit(amount, pin)
                                            result.onSuccess(onSubmitted)
                                            result.onFailure { errorText = it.message ?: "Pengajuan pencairan gagal." }
                                        }
                                    }
                                }
                            }
                        },
                        enabled = !isSubmitting,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Secondary)
                    ) {
                        if (isSubmitting) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                        else Text(if (step == "pin") "Kirim" else "Lanjut")
                    }
                }
            }
        }
    }
}

@Composable
private fun PayoutReviewRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = DeepForest, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun PayoutRequestDetailDialog(request: CourierPayoutRequestItem, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Card(shape = RoundedCornerShape(8.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Surface(color = payoutStatusColor(request.status).copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                        Icon(payoutStatusIcon(request.status), contentDescription = null, tint = payoutStatusColor(request.status), modifier = Modifier.padding(10.dp).size(22.dp))
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Detail Pencairan", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text(request.requestNumber, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                PayoutReviewRow("Status", request.statusLabel ?: payoutStatusLabel(request.status))
                PayoutReviewRow("Nominal", request.amountIdr.toRupiahCompact())
                PayoutReviewRow("Diterima", request.netAmountIdr.toRupiahCompact())
                PayoutReviewRow("Rekening", "${request.destinationSnapshot["bank_code"] ?: "-"} • **** ${request.destinationSnapshot["account_last4"] ?: request.destinationSnapshot["account_number_last4"] ?: "-"}")
                PayoutReviewRow("Tanggal", shortDateLabel(request.requestedAt))
                Surface(modifier = Modifier.fillMaxWidth(), color = payoutStatusColor(request.status).copy(alpha = 0.1f), shape = RoundedCornerShape(8.dp)) {
                    Text(
                        payoutStatusMessage(request),
                        modifier = Modifier.padding(10.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.labelMedium
                    )
                }
                request.failureReason?.takeIf { it.isNotBlank() }?.let { reason ->
                    Surface(modifier = Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.error.copy(alpha = 0.1f), shape = RoundedCornerShape(8.dp)) {
                        Text(reason, modifier = Modifier.padding(10.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium)
                    }
                }
                Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp)) {
                    Text("Tutup")
                }
            }
        }
    }
}

@Composable
private fun CapabilityStatusPill(status: String) {
    val normalized = when (status) {
        "verified" -> "terverifikasi"
        "enabled" -> "aktif"
        "approved" -> "approved"
        "complete" -> "lengkap"
        "incomplete" -> "belum lengkap"
        else -> status.replace("_", " ")
    }
    val color = when (status) {
        "enabled", "approved", "complete", "verified" -> Success
        "disabled", "rejected", "suspended" -> MaterialTheme.colorScheme.error
        else -> Warning
    }
    Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
        Text(
            normalized,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )
    }
}

@Composable
private fun PayoutAccountPanel(ledger: CourierEarningsLedger) {
    val account = ledger.summary.payoutAccount
    val bankCode = account?.bankCode?.takeIf { it.isNotBlank() }
    val accountNumber = account?.accountNumber?.takeIf { it.isNotBlank() }
    val accountName = account?.accountName?.takeIf { it.isNotBlank() }
    val isReady = bankCode != null && accountNumber != null && accountName != null
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (isReady) PrimaryLight.copy(alpha = 0.58f) else Warning.copy(alpha = 0.12f),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(
                color = if (isReady) Color.White.copy(alpha = 0.72f) else Color.White.copy(alpha = 0.58f),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(
                    Icons.Default.AccountBalance,
                    contentDescription = null,
                    tint = if (isReady) Primary else Warning,
                    modifier = Modifier.padding(8.dp).size(18.dp)
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text("Rekening pencairan", fontWeight = FontWeight.Bold, color = DeepForest)
                Text(
                    if (isReady) {
                        "$bankCode • ${maskAccountNumber(accountNumber.orEmpty())} • $accountName"
                    } else {
                        "Rekening belum lengkap. Lengkapi lewat proses verifikasi operasional."
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            CapabilityStatusPill(if (isReady) "verified" else "incomplete")
        }
    }
}

@Composable
private fun EarningsLedgerRow(transaction: CourierEarningsTransaction) {
    val isCredit = transaction.direction == "credit"
    val color = if (isCredit) Success else MaterialTheme.colorScheme.error
    val orderLabel = transaction.orderNumber ?: transaction.source.replace("_", " ").uppercase()
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
            Icon(
                if (isCredit) Icons.AutoMirrored.Filled.CallReceived else Icons.AutoMirrored.Filled.CallMade,
                contentDescription = null,
                tint = color,
                modifier = Modifier.padding(8.dp).size(18.dp)
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(orderLabel, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                transaction.description ?: transaction.settlementStatus.replace("_", " "),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                transaction.amountIdr.toRupiahCompact(),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                color = color
            )
            Text(
                transaction.settlementStatus.replace("_", " "),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1
            )
        }
    }
}

private fun maskAccountNumber(value: String): String {
    val digits = value.filter { it.isDigit() }
    if (digits.length <= 4) return value
    return "**** ${digits.takeLast(4)}"
}

private fun payoutStatusLabel(status: String): String = when (status) {
    "requested", "risk_screening" -> "Dalam pemeriksaan otomatis"
    "risk_hold", "manual_review", "under_review" -> "Butuh review"
    "approved_auto", "approved", "processing" -> "Diproses"
    "paid" -> "Berhasil"
    "rejected", "blocked" -> "Ditolak"
    "failed" -> "Gagal"
    "cancelled" -> "Dibatalkan"
    else -> status.replace("_", " ")
}

private fun payoutStatusMessage(request: CourierPayoutRequestItem): String {
    request.statusMessage?.takeIf { it.isNotBlank() }?.let { return it }
    return when (request.status) {
        "requested", "risk_screening" -> "Pengajuan sedang dicek otomatis. Kamu bisa memantau statusnya di sini."
        "approved_auto", "approved", "processing" -> "Pengajuan sedang diproses ke rekening pencairan."
        "risk_hold", "manual_review", "under_review" -> "Sedang diverifikasi oleh tim operasional."
        "paid" -> "Pencairan berhasil diproses."
        "rejected", "blocked" -> "Pengajuan belum dapat diproses. Cek detail atau hubungi operasional jika perlu."
        "failed" -> "Pencairan belum berhasil. Saldo tetap tercatat dan akan ditinjau."
        "cancelled" -> "Pengajuan dibatalkan."
        else -> "Pengajuan pencairan saldo berhasil dibuat."
    }
}

@Composable
private fun payoutStatusColor(status: String): Color = when (status) {
    "paid" -> Success
    "failed", "rejected", "blocked", "cancelled" -> MaterialTheme.colorScheme.error
    "approved_auto", "approved", "processing" -> Primary
    else -> Warning
}

private fun payoutStatusIcon(status: String): androidx.compose.ui.graphics.vector.ImageVector = when (status) {
    "paid" -> Icons.Default.CheckCircle
    "failed", "rejected", "blocked", "cancelled" -> Icons.Default.Cancel
    "approved_auto", "approved", "processing" -> Icons.Default.Sync
    else -> Icons.Default.Schedule
}

private fun shortDateLabel(value: String?): String {
    if (value.isNullOrBlank()) return "-"
    return value.take(16).replace("T", " ")
}

private fun quickPayoutAmounts(summary: CourierPayoutSummaryData): List<Int> {
    val minAmount = summary.policy.minAmountIdr
    val maxAmount = summary.eligibility.maxRequestableIdr
    return listOf(minAmount, maxAmount)
        .filter { it > 0 }
        .distinct()
        .filter { it <= maxAmount }
        .take(4)
}

@Composable
private fun MiniProfileStat(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = PrimaryLight.copy(alpha = 0.66f),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = Primary, maxLines = 1)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}

@Composable
private fun ProfileMetricRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    value: String,
    color: Color
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.padding(8.dp).size(20.dp))
        }
        Text(title, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = color)
    }
}

@Composable
private fun MaintenanceButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(48.dp),
        shape = RoundedCornerShape(8.dp),
        contentPadding = PaddingValues(horizontal = 8.dp)
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelMedium)
    }
}

private fun inferCourierRole(orders: List<Order>): String {
    val roles = orders.map { it.normalizedWorkflowRole() }.toSet()
    return when {
        roles.isEmpty() -> "on_demand"
        roles.all { it == "on_demand" } -> "on_demand"
        else -> "regular"
    }
}

private fun List<Order>.filterByCourierRole(courierRole: String): List<Order> {
    return when (normalizeCourierMode(courierRole)) {
        "regular" -> filter { it.normalizedWorkflowRole() == "regular" }
        else -> filter { it.normalizedWorkflowRole() == "on_demand" }
    }
}

private fun normalizeCourierMode(courierRole: String): String = when (courierRole.lowercase()) {
    "regular", "pickup_only", "pickup", "delivery_only", "delivery" -> "regular"
    else -> "on_demand"
}

private fun courierRoleLabel(courierRole: String): String = when (normalizeCourierMode(courierRole)) {
    "regular" -> "Regular"
    else -> "On Demand"
}

private fun courierRoleHint(courierRole: String): String = when (normalizeCourierMode(courierRole)) {
    "regular" -> "Siap menjalankan order regular P2P"
    else -> "Siap menerima tawaran on-demand"
}

private fun courierPendingLabel(courierRole: String): String = when (normalizeCourierMode(courierRole)) {
    "regular" -> "regular"
    else -> "menunggu"
}

private fun courierCompletedLabel(courierRole: String): String = when (normalizeCourierMode(courierRole)) {
    "regular" -> "Order regular selesai"
    else -> "Selesai"
}

private fun courierCurrentTaskTitle(courierRole: String): String = when (normalizeCourierMode(courierRole)) {
    "regular" -> "Order Regular Saat Ini"
    else -> "Tugas Saat Ini"
}

private fun courierEmptyTaskTitle(courierRole: String): String = when (normalizeCourierMode(courierRole)) {
    "regular" -> "Belum ada order regular aktif"
    else -> "Belum ada tugas aktif"
}

private fun Order.communicationCallTargetType(): String {
    return if (communicationShouldCallRecipient()) {
        "recipient"
    } else {
        "customer"
    }
}

private fun Order.communicationIsDeliveryGroup(): Boolean {
    return status.trim().lowercase() in setOf(
        "picked_up",
        "in_transit",
        "delivering",
        "delivered",
        "completed"
    )
}

private fun Order.communicationShouldCallRecipient(): Boolean {
    return status.trim().lowercase() in setOf(
        "picked_up",
        "in_transit",
        "delivering"
    )
}

private fun Order.communicationCallTargetLabel(): String {
    return when (communicationCallTargetType()) {
        "recipient" -> "Penerima"
        else -> customerName.takeIf { it.isNotBlank() } ?: "Pelanggan"
    }
}

private fun Order.communicationChatTitle(): String {
    return if (communicationIsDeliveryGroup()) {
        "Percakapan Pengantaran"
    } else {
        "Hubungi Pelanggan"
    }
}

private fun Order.communicationChatSubtitle(): String {
    return if (communicationIsDeliveryGroup()) {
        "Koordinasi customer, kurir, dan penerima tetap di satu percakapan order."
    } else {
        "Kirim pesan jika Anda butuh arahan pickup atau konfirmasi paket."
    }
}

private fun Order.communicationChatPlaceholder(): String {
    return if (communicationIsDeliveryGroup()) {
        "Tulis pesan di grup pengantaran..."
    } else {
        "Tulis pesan untuk pelanggan..."
    }
}

private fun orderSyncHint(isOnline: Boolean, lastRemoteSyncAt: Long?): String {
    if (!isOnline) return "Aktifkan On Duty untuk menerima order otomatis."
    if (lastRemoteSyncAt == null) return "Menunggu sinkronisasi order otomatis."

    val elapsedSeconds = ((System.currentTimeMillis() - lastRemoteSyncAt) / 1000).coerceAtLeast(0)
    return when {
        elapsedSeconds < 10 -> "Sinkron otomatis baru saja berjalan."
        elapsedSeconds < 60 -> "Sinkron terakhir ${elapsedSeconds} detik lalu."
        else -> "Sinkron terakhir ${elapsedSeconds / 60} menit lalu."
    }
}

private fun openCourierMapNavigation(context: Context, address: String, point: LatLng? = null) {
    val validPoint = point?.takeIf { it.isValidNavigationPoint() }
    if (validPoint == null && address.isBlank()) return

    val preferredIntent = if (validPoint != null) {
        Intent(
            Intent.ACTION_VIEW,
            Uri.parse("geo:${validPoint.latitude},${validPoint.longitude}?q=${validPoint.latitude},${validPoint.longitude}")
        )
    } else {
        Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=${Uri.encode(address)}"))
    }

    val launchIntent = if (preferredIntent.resolveActivity(context.packageManager) != null) {
        preferredIntent
    } else if (validPoint != null) {
        Intent(
            Intent.ACTION_VIEW,
            Uri.parse("geo:${validPoint.latitude},${validPoint.longitude}?q=${validPoint.latitude},${validPoint.longitude}")
        )
    } else {
        Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=${Uri.encode(address)}"))
    }

    if (launchIntent.resolveActivity(context.packageManager) != null) {
        context.startActivity(launchIntent)
    }
}

private fun DutyLocation.toLatLng(): LatLng = LatLng(latitude, longitude)

private fun latLngOrNull(latitude: Double?, longitude: Double?): LatLng? {
    if (latitude == null || longitude == null) return null
    return LatLng(latitude, longitude).takeIf { it.isValidNavigationPoint() }
}

private fun LatLng.isValidNavigationPoint(): Boolean {
    return !latitude.isNaN() &&
        !longitude.isNaN() &&
        !latitude.isInfinite() &&
        !longitude.isInfinite() &&
        latitude in -90.0..90.0 &&
        longitude in -180.0..180.0 &&
        !(latitude == 0.0 && longitude == 0.0)
}

private const val ON_DEMAND_FOREGROUND_SYNC_INTERVAL_MS = 5_000L
private const val ON_DEMAND_FOREGROUND_SYNC_MIN_INTERVAL_MS = 4_000L
private const val FOREGROUND_SYNC_MAX_BACKOFF_MS = 120_000L
private const val PUSH_SYNC_MIN_INTERVAL_MS = 2_000L
private const val ON_DEMAND_OFFER_TTL_SECONDS = 15
private val ACTIVE_ON_DEMAND_STATUSES = setOf("assigned", "accepted", "picked_up", "in_transit")

private data class DutyLocation(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float?
)

private fun hasForegroundLocationPermission(context: Context): Boolean {
    return ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
}

private fun hasBackgroundLocationPermission(context: Context): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_BACKGROUND_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
}

private suspend fun getLastKnownDutyLocation(context: Context): DutyLocation? {
    if (!hasForegroundLocationPermission(context)) return null

    return try {
        val client = LocationServices.getFusedLocationProviderClient(context)
        val location = client.lastLocation.await()
            ?: withTimeoutOrNull(8_000) {
                client.getCurrentLocation(
                    Priority.PRIORITY_HIGH_ACCURACY,
                    CancellationTokenSource().token
                ).await()
            }
        location?.let {
            DutyLocation(
                latitude = it.latitude,
                longitude = it.longitude,
                accuracy = it.takeIf { point -> point.hasAccuracy() }?.accuracy
            )
        }
    } catch (_: SecurityException) {
        null
    } catch (_: Exception) {
        null
    }
}
