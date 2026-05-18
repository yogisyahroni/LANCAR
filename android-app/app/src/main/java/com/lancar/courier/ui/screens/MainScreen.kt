package com.lancar.courier.ui.screens

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import com.google.android.gms.location.Priority
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import com.lancar.courier.data.model.CourierServiceProduct
import com.lancar.courier.data.model.CourierHotspot
import com.lancar.courier.data.model.CourierCapabilityProfile
import com.lancar.courier.data.model.CourierServiceCapability
import com.lancar.courier.data.model.CourierEarningsLedger
import com.lancar.courier.data.model.CourierEarningsTransaction
import com.lancar.courier.data.model.CourierPerformanceSummary
import com.lancar.courier.data.model.CourierPayoutRequestItem
import com.lancar.courier.data.model.CourierPayoutSummaryData
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.model.cleanPayoutIdr
import com.lancar.courier.data.model.displayServiceName
import com.lancar.courier.data.model.etaMinutesValue
import com.lancar.courier.data.model.normalizedWorkflowRole
import com.lancar.courier.data.model.toRupiahCompact
import com.lancar.courier.data.session.AuthSessionManager
import com.lancar.courier.service.LocationTrackerService
import com.lancar.courier.ui.screens.order.OrderDetailScreen
import com.lancar.courier.ui.screens.order.OrderScreen
import com.lancar.courier.ui.screens.order.OrderViewModel
import com.lancar.courier.ui.screens.pod.ProofOfDeliveryScreen
import com.lancar.courier.ui.screens.profile.resolvePayoutActionState
import com.lancar.courier.ui.screens.scan.ScanScreen
import com.lancar.courier.ui.screens.chat.ChatScreen
import com.lancar.courier.ui.theme.Primary
import com.lancar.courier.ui.theme.PrimaryLight
import com.lancar.courier.ui.theme.Secondary
import com.lancar.courier.ui.theme.SecondaryLight
import com.lancar.courier.ui.theme.Success
import com.lancar.courier.ui.theme.Warning
import com.lancar.courier.util.OrderSyncSignalBus
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.min

private val LogisticsOrange = Color(0xFFFF6D00)
private val SageBase = Color(0xFFF2F5F0)
private val DeepForest = Color(0xFF0A2F20)

/**
 * Main Screen — Courier Dashboard
 *
 * Uses real data from OrderViewModel backed by Room DB + backend sync.
 * No more demo/hardcoded data.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    navController: NavHostController? = null,
    initialOrderId: String? = null,
    initialChatOrderId: String? = null,
    authSessionManager: AuthSessionManager,
    onConsumedDeepLink: () -> Unit = {},
    onLogout: () -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    // Real ViewModel backed by Hilt/Room DB
    val orderViewModel: OrderViewModel = hiltViewModel()

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
    val courierProfile by orderViewModel.courierProfile.collectAsState()
    val isSyncing by orderViewModel.isSyncing.collectAsState()
    val error by orderViewModel.error.collectAsState()
    val lastRemoteSyncAt by orderViewModel.lastRemoteSyncAt.collectAsState()

    val courierName by authSessionManager.courierName.collectAsState(initial = null)
    val isOnline by authSessionManager.isOnline.collectAsState(initial = false)
    val lifecycleOwner = LocalLifecycleOwner.current
    val courierRole = courierProfile?.applicationChannel ?: inferCourierRole(allOrders)
    val displayCourierName = courierName?.takeIf { it.isNotBlank() } ?: "Profil belum tersinkron"
    val courierVehicleType = capabilityProfile?.vehicle?.vehicleType
        ?: capabilityProfile?.vehicles?.firstOrNull { it.verificationStatus.equals("approved", ignoreCase = true) }?.vehicleType
        ?: capabilityProfile?.vehicles?.firstOrNull()?.vehicleType
        ?: "motor"
    val roleOrders = allOrders.filterByCourierRole(courierRole)
    val rolePendingOrders = pendingOrders.filterByCourierRole(courierRole)
    val roleDeliveredToday = deliveredToday.filterByCourierRole(courierRole)
    val roleEarningsToday = roleDeliveredToday.sumOf { it.cleanPayoutIdr() }.takeIf { it > 0 }
        ?: courierProfile?.todayEarningsIdr
        ?: 0

    var selectedTab by remember { mutableStateOf(0) }
    var showPodScreen by remember { mutableStateOf(false) }
    var showOrderDetail by remember { mutableStateOf(false) }
    var showScanScreen by remember { mutableStateOf(false) }
    var showChatScreen by remember { mutableStateOf(false) }
    var selectedOrder by remember { mutableStateOf<Order?>(null) }
    var activeScanType by remember { mutableStateOf("pickup") }
    var activeProofMode by remember { mutableStateOf("delivery") }
    var pickupScanVerifiedOrderIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var pickupPhotoVerifiedOrderIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var showLogoutDialog by remember { mutableStateOf(false) }

    suspend fun sendSafetyEvent(order: Order?, eventType: String, severity: String, message: String) {
        val location = getLastKnownDutyLocation(context)
        val result = orderViewModel.createSafetyEvent(
            orderId = order?.orderId,
            eventType = eventType,
            severity = severity,
            latitude = location?.latitude,
            longitude = location?.longitude,
            accuracy = location?.accuracy,
            message = message
        )
        snackbarHostState.showSnackbar(
            result.getOrElse { it.message ?: "Laporan belum terkirim. Coba lagi." }
        )
    }

    if (courierRole == "on_demand") onDemandOffers.firstOrNull()?.let { offer ->
        OnDemandOfferDialog(
            order = offer,
            onAccept = {
                orderViewModel.acceptOffer(offer) { accepted ->
                    selectedOrder = accepted
                    showOrderDetail = true
                }
            },
            onReject = { orderViewModel.rejectOffer(offer) },
            onExpired = { orderViewModel.rejectOffer(offer, "ttl_expired") }
        )
    }

    // Navigate to order detail if app was opened from notification
    LaunchedEffect(initialOrderId) {
        if (initialOrderId != null) {
            val order = orderViewModel.getOrderById(initialOrderId)
            if (order != null) {
                selectedOrder = order
                showChatScreen = false // Reset Chat focus
                showOrderDetail = true
                onConsumedDeepLink()
            }
        }
    }

    // Navigate to Chat Screen directly if app was opened from a Chat notification
    LaunchedEffect(initialChatOrderId) {
        if (initialChatOrderId != null) {
            val order = orderViewModel.getOrderById(initialChatOrderId)
            if (order != null) {
                selectedOrder = order
                showOrderDetail = false // Take directly to chat viewport
                showChatScreen = true
                onConsumedDeepLink()
            }
        }
    }

    // Show error as Snackbar
    LaunchedEffect(error) {
        error?.let { msg ->
            snackbarHostState.showSnackbar(
                message = msg,
                duration = SnackbarDuration.Short
            )
            orderViewModel.clearError()
        }
    }

    LaunchedEffect(isOnline, courierRole, lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            if (!isOnline) return@repeatOnLifecycle

            val baseIntervalMs = if (courierRole == "on_demand") {
                ON_DEMAND_FOREGROUND_SYNC_INTERVAL_MS
            } else {
                FOREGROUND_SYNC_INTERVAL_MS
            }
            val minIntervalMs = if (courierRole == "on_demand") {
                ON_DEMAND_FOREGROUND_SYNC_MIN_INTERVAL_MS
            } else {
                FOREGROUND_SYNC_MIN_INTERVAL_MS
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
                showPodScreen = false
                if (activeProofMode == "pickup") {
                    pickupPhotoVerifiedOrderIds = pickupPhotoVerifiedOrderIds + order.orderId
                    val hasPickupScan = pickupScanVerifiedOrderIds.contains(order.orderId) ||
                        order.pickupScanVerified ||
                        order.scanType == "pickup" ||
                        order.scanType == "pickup_scan"
                    if (hasPickupScan) {
                        selectedOrder = order.copy(status = "in_transit", pickupPhotoVerified = true)
                        orderViewModel.fetchOrdersFromBackend()
                        snackbarHostState.currentSnackbarData?.dismiss()
                        scope.launch { snackbarHostState.showSnackbar("Pickup lengkap. Mulai pengantaran.") }
                    } else {
                        selectedOrder = order.copy(pickupPhotoVerified = true)
                        snackbarHostState.currentSnackbarData?.dismiss()
                        scope.launch { snackbarHostState.showSnackbar("Foto barang tersimpan. Scan barcode/kode paket masih wajib.") }
                    }
                    showOrderDetail = true
                } else {
                    orderViewModel.fetchOrdersFromBackend()
                    selectedOrder = null
                }
            },
            onBack = {
                showPodScreen = false
                selectedOrder = null
            }
        )
        return
    }

    // ── Order Detail Screen ────────────────────────────────────
    selectedOrder?.takeIf { showOrderDetail }?.let { order ->
        LaunchedEffect(order.orderId) {
            if (order.normalizedWorkflowRole() == "on_demand") {
                orderViewModel.loadRoutePreview(order.orderId)
            }
        }
        OrderDetailScreen(
            order = order,
            routePreview = routePreviews[order.orderId],
            pickupScanVerified = pickupScanVerifiedOrderIds.contains(order.orderId) ||
                order.pickupScanVerified ||
                order.scanType == "pickup" ||
                order.scanType == "pickup_scan",
            pickupPhotoVerified = pickupPhotoVerifiedOrderIds.contains(order.orderId) || order.pickupPhotoVerified,
            onBack = {
                showOrderDetail = false
                selectedOrder = null
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
                activeScanType = "pickup"
                showOrderDetail = false
                showScanScreen = true
            },
            onCapturePickupProof = {
                activeProofMode = "pickup"
                showOrderDetail = false
                showPodScreen = true
            },
            onCapturePod = {
                activeProofMode = "delivery"
                showOrderDetail = false
                showPodScreen = true
            },
            onChatClick = {
                showOrderDetail = false
                showChatScreen = true
            },
            onSosClick = {
                scope.launch {
                    sendSafetyEvent(order, "sos", "critical", "Kurir membutuhkan bantuan segera di pekerjaan on-demand.")
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
                        showOrderDetail = false
                        selectedOrder = null
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
            onBackClick = {
                showChatScreen = false
                showOrderDetail = true // Back to context-sensitive screen
            }
        )
        return
    }

    // ── Scan Screen ────────────────────────────────────────────
    if (showScanScreen) {
        ScanScreen(
            initialOrderId = selectedOrder?.orderId,
            scanType = activeScanType,
            title = if (activeScanType == "pickup") "Verifikasi Barang" else "Verifikasi Dropoff",
            onScanSuccess = { orderId ->
                showScanScreen = false
                scope.launch {
                    // Load real order from DB (may have been added by notification)
                    val order = orderViewModel.getOrderById(orderId)
                    if (order != null) {
                        if (activeScanType == "pickup") {
                            pickupScanVerifiedOrderIds = pickupScanVerifiedOrderIds + orderId
                            val hasPickupPhoto = pickupPhotoVerifiedOrderIds.contains(orderId) || order.pickupPhotoVerified
                            if (hasPickupPhoto) {
                                selectedOrder = order.copy(status = "in_transit", pickupScanVerified = true)
                                orderViewModel.fetchOrdersFromBackend()
                                snackbarHostState.showSnackbar("Pickup lengkap. Mulai pengantaran.")
                            } else {
                                selectedOrder = order.copy(pickupScanVerified = true)
                                snackbarHostState.showSnackbar("Scan berhasil. Lanjutkan foto barang untuk mulai pengantaran.")
                            }
                        } else {
                            selectedOrder = order
                        }
                        showOrderDetail = true
                    } else {
                        snackbarHostState.showSnackbar("Order $orderId tidak ditemukan")
                    }
                }
            },
            onBack = {
                showScanScreen = false
                if (selectedOrder != null) showOrderDetail = true
            }
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

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("LANCAR Courier", fontWeight = FontWeight.Bold)
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
                            contentDescription = "Refresh"
                        )
                    }
                    IconButton(onClick = { /* notifications */ }) {
                        Icon(
                            imageVector = Icons.Default.Notifications,
                            contentDescription = "Notifications"
                        )
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
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
                            Icon(Icons.Default.LocalShipping, contentDescription = "Orders")
                        }
                    },
                    label = { Text("Order") },
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Person, contentDescription = "Profile") },
                    label = { Text("Profil") },
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 }
                )
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(paddingValues)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
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
                    hotspots = onDemandHotspots,
                    isOnline = isOnline,
                    onOnlineToggle = { online ->
                        scope.launch {
                            // Business Rule Guard: Prevent going Off-Duty if there are active jobs
                            if (!online) {
                                val hasActiveJobs = allOrders.any { it.status != "delivered" && it.status != "failed" }
                                if (hasActiveJobs) {
                                    snackbarHostState.showSnackbar("Peringatan: Selesaikan semua tugas pengiriman sebelum NONAKTIF!")
                                    return@launch
                                }
                            }

                            // Security Guard: Prevent going On-Duty if the device is rooted (Anti-GPS Spoofing)
                            if (online) {
                                val isRooted = com.lancar.courier.util.SecurityUtils.isDeviceRooted(context)
                                if (isRooted) {
                                    snackbarHostState.showSnackbar("⚠️ AKSES DITOLAK: Perangkat terdeteksi ROOTED. Dilarang bekerja demi integritas GPS!")
                                    return@launch
                                }
                            }

                            try {
                                if (online) {
                                    val location = getLastKnownDutyLocation(context)
                                    if (location == null) {
                                        snackbarHostState.showSnackbar("Lokasi perangkat belum tersedia. Aktifkan GPS dan coba lagi untuk mulai On Duty.")
                                        return@launch
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
                                        return@launch
                                    }

                                    authSessionManager.setOnlineStatus(true)
                                    val intent = LocationTrackerService.startIntent(context)
                                    androidx.core.content.ContextCompat.startForegroundService(context, intent)
                                    snackbarHostState.showSnackbar("Status Berhasil Diubah Ke: ON DUTY. GPS Aktif.")
                                } else {
                                    val dutyResult = orderViewModel.updateDutyStatus(online = false)
                                    dutyResult.onFailure { e ->
                                        snackbarHostState.showSnackbar(e.message ?: "Gagal memperbarui status Off Duty.")
                                        return@launch
                                    }

                                    authSessionManager.setOnlineStatus(false)
                                    context.stopService(LocationTrackerService.stopIntent(context))
                                    snackbarHostState.showSnackbar("Status Berhasil Diubah Ke: OFF DUTY. GPS Berhenti.")
                                }
                            } catch (e: Exception) {
                                snackbarHostState.showSnackbar("Gagal merubah status tracking.")
                            }
                        }
                    },
                    onCapturePod = { order ->
                        selectedOrder = order
                        showPodScreen = true
                    },
                    onOpenDelivery = { order ->
                        selectedOrder = order
                        showOrderDetail = true
                    },
                    onViewOrders = { selectedTab = 1 },
                    onScanPackage = { showScanScreen = true }
                )
                1 -> OrdersContent(
                    orders = roleOrders,
                    courierRole = courierRole,
                    isSyncing = isSyncing,
                    isOnline = isOnline,
                    lastRemoteSyncAt = lastRemoteSyncAt,
                    onOrderClick = { order ->
                        selectedOrder = order
                        showOrderDetail = true
                    },
                    onSync = { orderViewModel.syncPendingOrders() },
                    onRefresh = { orderViewModel.fetchOrdersFromBackend() }
                )
                2 -> ProfileContent(
                    courierName = displayCourierName,
                    courierRole = courierRole,
                    pendingSyncCount = rolePendingOrders.size,
                    todayEarningsIdr = roleEarningsToday,
                    totalEarningsIdr = courierProfile?.totalEarningsIdr ?: allOrders.sumOf { it.cleanPayoutIdr() },
                    performanceSummary = performanceSummary,
                    capabilityProfile = capabilityProfile,
                    earningsLedger = earningsLedger,
                    payoutSummary = payoutSummary,
                    payoutRequests = payoutRequests,
                    isPayoutSubmitting = isPayoutSubmitting,
                    onCompleteTraining = {
                        scope.launch {
                            val result = orderViewModel.completeTraining()
                            snackbarHostState.showSnackbar(result.getOrElse { it.message ?: "Training belum tersimpan." })
                        }
                    },
                    onRefreshPayout = { orderViewModel.fetchPayoutState() },
                    onRequestPayout = { amountIdr, pin ->
                        orderViewModel.submitPayoutRequest(amountIdr, pin)
                    },
                    onLogout = { showLogoutDialog = true },
                    onSyncNow = { orderViewModel.syncPendingOrders() },
                    onOptimizeBattery = {
                        (context as? com.lancar.courier.ui.MainActivity)?.checkAndRequestBatteryWhitelist()
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
                    }
                )
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
    hotspots: List<CourierHotspot>,
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
            hotspots = hotspots,
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
            border = if (courierRole == "on_demand") BorderStroke(2.dp, Color.Black) else null
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
                            tint = if (courierRole == "on_demand" && isOnline) Color.Black else if (isOnline) Secondary else Color.White.copy(alpha = 0.78f)
                        )
                        Column {
                            Text(
                                text = if (isOnline) "On Duty" else "Off Duty",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = if (courierRole == "on_demand" && isOnline) Color.Black else Color.White
                            )
                            Text(
                                text = if (courierRole == "on_demand" && isOnline) "Siap menerima tawaran 15 detik" else if (isOnline) "Lokasi dan sinkronisasi aktif" else "Tracking lokasi berhenti",
                                style = MaterialTheme.typography.labelMedium,
                                color = if (courierRole == "on_demand" && isOnline) Color.Black.copy(alpha = 0.72f) else Color.White.copy(alpha = 0.78f)
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
                border = BorderStroke(2.dp, Color.Black)
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
                            Text("Payout bersih dari pricing admin", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                            if (courierRole == "pickup_only") Icons.Default.Storefront else Icons.Default.Navigation,
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
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Secondary)
                    ) {
                        Icon(Icons.Default.CameraAlt, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Upload Bukti Pengiriman")
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
                Text("Scan")
            }
            OutlinedButton(
                onClick = onViewOrders,
                modifier = Modifier.weight(1f).height(52.dp),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(Icons.Default.LocalShipping, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Order")
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
    hotspots: List<CourierHotspot>,
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
                            text = if (isOnline) "Offer masuk otomatis sesuai zona dan ranking." else "Aktifkan saat sudah siap menerima pekerjaan.",
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
            }
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
                        GoogleMap(
                            modifier = Modifier.fillMaxWidth().height(180.dp),
                            cameraPositionState = cameraPositionState,
                            uiSettings = MapUiSettings(
                                zoomControlsEnabled = false,
                                myLocationButtonEnabled = false,
                                mapToolbarEnabled = false,
                                scrollGesturesEnabled = false,
                                zoomGesturesEnabled = false,
                                tiltGesturesEnabled = false,
                                rotationGesturesEnabled = false
                            )
                        ) {
                            Marker(state = MarkerState(position = pickupPoint), title = activeOrder.pickupAddress)
                            dropPoint?.let {
                                Marker(state = MarkerState(position = it), title = "Tujuan")
                                Polyline(points = listOf(pickupPoint, it), color = LogisticsOrange, width = 8f)
                            }
                        }
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
                            colors = ButtonDefaults.buttonColors(containerColor = LogisticsOrange, contentColor = Color.Black)
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
                                if (isOnline) "Menunggu offer berikutnya" else "Aktifkan duty untuk mulai",
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
                        "Belum ada hotspot aktif. Tetap online untuk menerima offer terdekat.",
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
                        Text("Coverage layanan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = DeepForest)
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
                            "Belum ada layanan yang cocok dengan kendaraan ${vehicleGroup.toVehicleLabel()}. Hubungi admin untuk review capability.",
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
                border = BorderStroke(2.dp, Color.Black)
            ) {
                GoogleMap(
                    modifier = Modifier.fillMaxSize(),
                    cameraPositionState = cameraPositionState,
                    uiSettings = MapUiSettings(
                        zoomControlsEnabled = false,
                        myLocationButtonEnabled = false,
                        mapToolbarEnabled = false
                    )
                ) {
                    Marker(state = MarkerState(position = pickup), title = activeOrder?.pickupAddress ?: "Zona pickup aktif")
                    if (dropoff != null) {
                        Marker(state = MarkerState(position = dropoff), title = "Tujuan")
                        Polyline(points = listOf(pickup, dropoff), color = LogisticsOrange, width = 10f)
                    }
                    hotspots.take(6).forEach { hotspot ->
                        val lat = hotspot.latitude
                        val lng = hotspot.longitude
                        if (lat != null && lng != null) {
                            Marker(
                                state = MarkerState(position = LatLng(lat, lng)),
                                title = hotspot.name,
                                snippet = "${hotspot.pendingOrders} pickup menunggu"
                            )
                        }
                    }
                }
            }

            Surface(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(12.dp),
                color = Color.White.copy(alpha = 0.92f),
                shape = RoundedCornerShape(topStart = 8.dp, topEnd = 20.dp, bottomStart = 20.dp, bottomEnd = 8.dp),
                border = BorderStroke(1.dp, Color.Black)
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
                border = BorderStroke(2.dp, Color.Black)
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
                        border = BorderStroke(1.dp, Color.Black)
                    ) {
                        Icon(
                            if (isOnline) Icons.Default.RadioButtonChecked else Icons.Default.RadioButtonUnchecked,
                            contentDescription = null,
                            tint = if (isOnline) LogisticsOrange else Color.Gray,
                            modifier = Modifier.padding(14.dp)
                        )
                    }
                    Column {
                        Text(if (isOnline) "On Duty" else "Off Duty", fontWeight = FontWeight.Black, color = if (isOnline) Color.Black else DeepForest)
                        Text("Aktifkan untuk bekerja", style = MaterialTheme.typography.labelMedium, color = if (isOnline) Color.Black.copy(alpha = 0.66f) else Color.Gray)
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
            border = BorderStroke(2.dp, Color.Black)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Halo, $courierName", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black, color = DeepForest)
                        Text(
                            text = "Payout bersih dari pricing admin",
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
            border = BorderStroke(1.dp, Color.Black.copy(alpha = 0.14f))
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
                        "Belum ada hotspot aktif. Tetap online untuk menerima offer terdekat.",
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
            border = BorderStroke(1.dp, Color.Black.copy(alpha = 0.14f))
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Layanan aktif", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = DeepForest)
                if (services.isEmpty()) {
                    Text(
                        "Layanan aktif belum tersinkron dari admin.",
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
                        colors = ButtonDefaults.buttonColors(containerColor = LogisticsOrange, contentColor = Color.Black),
                        border = BorderStroke(1.dp, Color.Black)
                    ) {
                        Icon(Icons.Default.Navigation, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Lanjutkan pekerjaan", fontWeight = FontWeight.Black)
                    }
                } else {
                    EmptyActiveOrder(
                        title = if (isOnline) "Menunggu pekerjaan on-demand" else "Belum aktif bekerja",
                        subtitle = if (isOnline) "Offer akan muncul otomatis sesuai zona dan ranking." else "Aktifkan duty saat sudah siap menerima pekerjaan.",
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
        vehicleTypes = listOf(vehicleGroup)
    )
}

private fun normalizedVehicleGroup(raw: String?): String {
    val value = raw?.trim()?.lowercase().orEmpty()
    return when {
        value in setOf("car", "mobil", "van", "box", "pickup", "truck") -> "car"
        else -> "motor"
    }
}

private fun String.toVehicleLabel(): String = when (this) {
    "car" -> "mobil"
    else -> "motor"
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
private fun OnDemandOfferDialog(
    order: Order,
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
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(pickupPoint ?: dropPoint ?: LatLng(0.0, 0.0), 12.5f)
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

    LaunchedEffect(pickupPoint, dropPoint) {
        val pickup = pickupPoint ?: return@LaunchedEffect
        val center = dropPoint?.let { LatLng((pickup.latitude + it.latitude) / 2, (pickup.longitude + it.longitude) / 2) } ?: pickup
        cameraPositionState.position = CameraPosition.fromLatLngZoom(center, if (dropPoint != null) 12f else 12.5f)
    }

    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(Color(0xFF08281B), Color(0xFF0E4A30), Color(0xFFF2F5F0))
                    )
                )
                .padding(18.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            color = LogisticsOrange,
                            shape = RoundedCornerShape(topStart = 8.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 8.dp),
                            border = BorderStroke(2.dp, Color.Black)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.Bolt, contentDescription = null, tint = Color.Black, modifier = Modifier.size(18.dp))
                                Text(order.displayServiceName().uppercase(), color = Color.Black, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                        TextButton(onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onReject()
                        }) {
                            Icon(Icons.Default.Close, contentDescription = null, tint = Color.White)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Tolak", color = Color.White, fontWeight = FontWeight.Bold)
                        }
                    }

                    Surface(
                        modifier = Modifier.fillMaxWidth().height(162.dp),
                        color = Color.Black.copy(alpha = 0.25f),
                        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 28.dp, bottomStart = 28.dp, bottomEnd = 16.dp),
                        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.28f))
                    ) {
                        Box(modifier = Modifier.fillMaxSize()) {
                            if (pickupPoint != null) {
                                GoogleMap(
                                    modifier = Modifier.fillMaxSize(),
                                    cameraPositionState = cameraPositionState,
                                    uiSettings = MapUiSettings(
                                        zoomControlsEnabled = false,
                                        myLocationButtonEnabled = false,
                                        mapToolbarEnabled = false,
                                        scrollGesturesEnabled = false,
                                        zoomGesturesEnabled = false,
                                        tiltGesturesEnabled = false,
                                        rotationGesturesEnabled = false
                                    )
                                ) {
                                    Marker(state = MarkerState(position = pickupPoint), title = "Pickup")
                                    dropPoint?.let {
                                        Marker(state = MarkerState(position = it), title = "Area tujuan")
                                        Polyline(points = listOf(pickupPoint, it), color = LogisticsOrange, width = 8f)
                                    }
                                }
                            } else {
                                Column(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(18.dp),
                                    verticalArrangement = Arrangement.Center,
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Icon(Icons.Default.LocationOff, contentDescription = null, tint = Color.White, modifier = Modifier.size(34.dp))
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(
                                        "Koordinat pickup belum tersedia dari order.",
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                            Surface(
                                modifier = Modifier.align(Alignment.BottomStart).padding(12.dp),
                                color = Color.Black.copy(alpha = 0.72f),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Column(modifier = Modifier.padding(10.dp)) {
                                    Text("Pickup", color = Color.White.copy(alpha = 0.72f), style = MaterialTheme.typography.labelMedium)
                                    Text(
                                        order.pickupAddress.ifBlank { "Alamat pickup belum tersedia" },
                                        color = Color.White,
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Black,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(
                                progress = { progress },
                                modifier = Modifier.size(96.dp),
                                color = if (remainingSeconds <= 5) MaterialTheme.colorScheme.error else LogisticsOrange,
                                trackColor = Color.White.copy(alpha = 0.24f),
                                strokeWidth = 8.dp
                            )
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("$remainingSeconds", color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black)
                                Text("detik", color = Color.White.copy(alpha = 0.74f), style = MaterialTheme.typography.labelSmall)
                            }
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("Payout bersih", color = Color.White.copy(alpha = 0.74f), style = MaterialTheme.typography.labelLarge)
                            Text(
                                order.cleanPayoutIdr().toRupiahCompact(),
                                color = LogisticsOrange,
                                style = MaterialTheme.typography.headlineLarge,
                                fontWeight = FontWeight.Black
                            )
                            Text(order.distance.ifBlank { "Jarak belum tersedia" }, color = Color.White, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            Text("ETA ${order.etaMinutesValue()} menit", color = Color.White.copy(alpha = 0.78f), style = MaterialTheme.typography.labelLarge)
                        }
                    }

                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = Color.White.copy(alpha = 0.86f),
                        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 28.dp, bottomStart = 28.dp, bottomEnd = 16.dp),
                        border = BorderStroke(2.dp, Color.Black)
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            OfferRouteRow(Icons.Default.Storefront, "Pickup", order.pickupAddress)
                            HorizontalDivider(color = Color.Black.copy(alpha = 0.12f))
                            OfferRouteRow(Icons.Default.Lock, "Tujuan setelah diterima", "Alamat lengkap dibuka setelah kamu menerima pekerjaan.")
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            InfoPill(icon = Icons.Default.Person, text = order.customerName.ifBlank { "Nama pelanggan belum tersedia" })
                                InfoPill(icon = Icons.Default.Payments, text = order.cleanPayoutIdr().toRupiahCompact())
                            }
                        }
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(
                        onClick = {
                            if (remainingSeconds > 0) {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                onAccept()
                            }
                        },
                        enabled = remainingSeconds > 0,
                        modifier = Modifier.fillMaxWidth().height(64.dp),
                        shape = RoundedCornerShape(topStart = 10.dp, topEnd = 22.dp, bottomStart = 22.dp, bottomEnd = 10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = LogisticsOrange, contentColor = Color.Black),
                        border = BorderStroke(2.dp, Color.Black)
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null)
                        Spacer(modifier = Modifier.width(10.dp))
                        Text("Terima Pekerjaan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                    }
                    OutlinedButton(
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onReject()
                        },
                        modifier = Modifier.fillMaxWidth().height(54.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.6f))
                    ) {
                        Text("Lewati pekerjaan ini", fontWeight = FontWeight.Bold)
                    }
                }
            }
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
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value.ifBlank { "-" }, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
        }
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
            value = order.pickupAddress.ifBlank { "Alamat pickup belum tersedia" }
        )
        RouteLine(
            icon = Icons.Default.LocationOn,
            label = "Dropoff",
            value = order.dropAddress.ifBlank { "Alamat tujuan belum tersedia" }
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            InfoPill(icon = Icons.Default.Route, text = order.distance.ifBlank { "Jarak belum tersedia" })
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
    if (orders.isEmpty() && !isSyncing) {
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
        OrderScreen(
            orders = orders,
            courierRole = courierRole,
            onOrderClick = onOrderClick,
            onSync = onSync
        )
    }
}

@Composable
private fun ProfileContent(
    courierName: String,
    courierRole: String,
    pendingSyncCount: Int,
    todayEarningsIdr: Int,
    totalEarningsIdr: Int,
    performanceSummary: CourierPerformanceSummary?,
    capabilityProfile: CourierCapabilityProfile?,
    earningsLedger: CourierEarningsLedger?,
    payoutSummary: CourierPayoutSummaryData?,
    payoutRequests: List<CourierPayoutRequestItem>,
    isPayoutSubmitting: Boolean,
    onCompleteTraining: () -> Unit,
    onRefreshPayout: () -> Unit,
    onRequestPayout: suspend (Int, String) -> Result<CourierPayoutRequestItem>,
    onLogout: () -> Unit,
    onSyncNow: () -> Unit,
    onOptimizeBattery: () -> Unit,
    onClearCache: () -> Unit
) {
    var showDiagnostics by remember { mutableStateOf(false) }
    var showResetLocalDataDialog by remember { mutableStateOf(false) }
    var showPayoutDialog by remember { mutableStateOf(false) }
    var selectedPayoutRequest by remember { mutableStateOf<CourierPayoutRequestItem?>(null) }

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
                    Icon(
                        Icons.Default.Person,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.padding(12.dp).size(28.dp)
                    )
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
                    Text("Kendaraan & Layanan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
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

        PayoutBalanceCard(
            payoutSummary = payoutSummary,
            payoutRequests = payoutRequests,
            isSubmitting = isPayoutSubmitting,
            onRefresh = onRefreshPayout,
            onRequestClick = { showPayoutDialog = true },
            onRequestDetail = { selectedPayoutRequest = it }
        )

        earningsLedger?.let { ledger ->
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
                            Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = Success, modifier = Modifier.padding(10.dp).size(22.dp))
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Pencairan saldo", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(
                                "Saldo kurir dan riwayat settlement dari sistem",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        MiniProfileStat("Tersedia", ledger.summary.availableBalanceIdr.toRupiahCompact(), Modifier.weight(1f))
                        MiniProfileStat("Pending", ledger.summary.pendingBalanceIdr.toRupiahCompact(), Modifier.weight(1f))
                        MiniProfileStat("Total", ledger.summary.totalBalanceIdr.toRupiahCompact(), Modifier.weight(1f))
                    }

                    PayoutAccountPanel(ledger)

                    if (ledger.transactions.isNotEmpty()) {
                        HorizontalDivider()
                        ledger.transactions.take(4).forEach { transaction ->
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

        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
        ) {
            Icon(Icons.Default.Logout, contentDescription = null)
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
                        Text("Pencairan belum tersedia", fontWeight = FontWeight.Bold, color = DeepForest)
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
                Text("${payoutRequests.size} request", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
private fun PayoutAccountStatusPanel(account: com.lancar.courier.data.model.CourierPayoutAccount?) {
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
                        "Rekening belum tersedia. Tunggu review admin."
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
                                "Pastikan nominal dan rekening sudah benar. Setelah dikirim, request akan masuk review treasury.",
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
                        "Rekening belum lengkap. Lengkapi lewat review admin."
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
                if (isCredit) Icons.Default.CallReceived else Icons.Default.CallMade,
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
    return listOf(minAmount, 50000, 100000, maxAmount)
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
        roles.size == 1 && roles.contains("pickup") -> "pickup_only"
        roles.size == 1 && roles.contains("delivery") -> "delivery_only"
        else -> "on_demand"
    }
}

private fun List<Order>.filterByCourierRole(courierRole: String): List<Order> {
    return when (courierRole) {
        "pickup_only", "pickup" -> filter { it.normalizedWorkflowRole() == "pickup" }
        "delivery_only", "delivery" -> filter { it.normalizedWorkflowRole() == "delivery" }
        else -> filter { it.normalizedWorkflowRole() == "on_demand" }
    }
}

private fun courierRoleLabel(courierRole: String): String = when (courierRole) {
    "pickup_only", "pickup" -> "Pickup Only"
    "delivery_only", "delivery" -> "Delivery Only"
    else -> "On Demand"
}

private fun courierRoleHint(courierRole: String): String = when (courierRole) {
    "pickup_only", "pickup" -> "Siap menjalankan tugas pickup"
    "delivery_only", "delivery" -> "Siap menjalankan tugas delivery"
    else -> "Siap menerima tawaran on-demand"
}

private fun courierPendingLabel(courierRole: String): String = when (courierRole) {
    "pickup_only", "pickup" -> "pickup"
    "delivery_only", "delivery" -> "antar"
    else -> "menunggu"
}

private fun courierCompletedLabel(courierRole: String): String = when (courierRole) {
    "pickup_only", "pickup" -> "Pickup selesai"
    "delivery_only", "delivery" -> "POD selesai"
    else -> "Selesai"
}

private fun courierCurrentTaskTitle(courierRole: String): String = when (courierRole) {
    "pickup_only", "pickup" -> "Pickup Saat Ini"
    "delivery_only", "delivery" -> "Delivery Saat Ini"
    else -> "Tugas Saat Ini"
}

private fun courierEmptyTaskTitle(courierRole: String): String = when (courierRole) {
    "pickup_only", "pickup" -> "Belum ada pickup aktif"
    "delivery_only", "delivery" -> "Belum ada delivery aktif"
    else -> "Belum ada tugas aktif"
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

private const val FOREGROUND_SYNC_INTERVAL_MS = 30_000L
private const val FOREGROUND_SYNC_MIN_INTERVAL_MS = 20_000L
private const val ON_DEMAND_FOREGROUND_SYNC_INTERVAL_MS = 5_000L
private const val ON_DEMAND_FOREGROUND_SYNC_MIN_INTERVAL_MS = 4_000L
private const val FOREGROUND_SYNC_MAX_BACKOFF_MS = 120_000L
private const val PUSH_SYNC_MIN_INTERVAL_MS = 2_000L
private const val ON_DEMAND_OFFER_TTL_SECONDS = 15

private data class DutyLocation(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float?
)

private suspend fun getLastKnownDutyLocation(context: Context): DutyLocation? {
    val hasFineLocation = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED
    val hasCoarseLocation = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_COARSE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED

    if (!hasFineLocation && !hasCoarseLocation) return null

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
