package com.lancar.courier.ui.screens

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import com.google.android.gms.location.Priority
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.CancellationTokenSource
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.model.cleanPayoutIdr
import com.lancar.courier.data.model.normalizedWorkflowRole
import com.lancar.courier.data.model.toRupiahCompact
import com.lancar.courier.data.session.AuthSessionManager
import com.lancar.courier.service.LocationTrackerService
import com.lancar.courier.ui.screens.order.OrderDetailScreen
import com.lancar.courier.ui.screens.order.OrderScreen
import com.lancar.courier.ui.screens.order.OrderViewModel
import com.lancar.courier.ui.screens.pod.ProofOfDeliveryScreen
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
    val courierProfile by orderViewModel.courierProfile.collectAsState()
    val isSyncing by orderViewModel.isSyncing.collectAsState()
    val error by orderViewModel.error.collectAsState()
    val lastRemoteSyncAt by orderViewModel.lastRemoteSyncAt.collectAsState()

    val courierName by authSessionManager.courierName.collectAsState(initial = "Courier")
    val isOnline by authSessionManager.isOnline.collectAsState(initial = false)
    val lifecycleOwner = LocalLifecycleOwner.current
    val courierRole = courierProfile?.applicationChannel ?: inferCourierRole(allOrders)
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
    var showLogoutDialog by remember { mutableStateOf(false) }

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
            onImageConfirmed = { _ ->
                // PoD saved in ProofOfDeliveryViewModel — refresh orders
                orderViewModel.fetchOrdersFromBackend()
                showPodScreen = false
                selectedOrder = null
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
        OrderDetailScreen(
            order = order,
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
            onCapturePod = {
                showOrderDetail = false
                showPodScreen = true
            },
            onChatClick = {
                showOrderDetail = false
                showChatScreen = true
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
            onScanSuccess = { orderId ->
                showScanScreen = false
                scope.launch {
                    // Load real order from DB (may have been added by notification)
                    val order = orderViewModel.getOrderById(orderId)
                    if (order != null) {
                        selectedOrder = order
                        showOrderDetail = true
                    } else {
                        snackbarHostState.showSnackbar("Order $orderId tidak ditemukan")
                    }
                }
            },
            onBack = { showScanScreen = false }
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
                    courierName = courierName ?: "Courier",
                    courierRole = courierRole,
                    totalOrders = roleOrders.size,
                    pendingCount = rolePendingOrders.size,
                    deliveredCount = roleDeliveredToday.size,
                    todayEarningsIdr = roleEarningsToday,
                    orders = roleOrders,
                    offers = if (courierRole == "on_demand") onDemandOffers else emptyList(),
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
                    courierName = courierName ?: "Courier",
                    courierRole = courierRole,
                    pendingSyncCount = rolePendingOrders.size,
                    todayEarningsIdr = roleEarningsToday,
                    totalEarningsIdr = courierProfile?.totalEarningsIdr ?: allOrders.sumOf { it.cleanPayoutIdr() },
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

    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Primary),
            shape = RoundedCornerShape(8.dp)
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
                            checkedTrackColor = Secondary,
                            uncheckedThumbColor = Color.White,
                            uncheckedTrackColor = Color.White.copy(alpha = 0.36f)
                        )
                    )
                }

                Surface(
                    color = Color.White.copy(alpha = 0.14f),
                    shape = RoundedCornerShape(8.dp),
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
                            tint = if (isOnline) Secondary else Color.White.copy(alpha = 0.78f)
                        )
                        Column {
                            Text(
                                text = if (isOnline) "On Duty" else "Off Duty",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Text(
                                text = if (isOnline) "Lokasi dan sinkronisasi aktif" else "Tracking lokasi berhenti",
                                style = MaterialTheme.typography.labelMedium,
                                color = Color.White.copy(alpha = 0.78f)
                            )
                        }
                    }
                }
            }
        }

        if (courierRole == "on_demand") {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = SecondaryLight),
                shape = RoundedCornerShape(8.dp)
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Pendapatan Hari Ini", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text("Estimasi bersih yang diterima kurir", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = Secondary)
                    }
                    Text(
                        todayEarningsIdr.toRupiahCompact(),
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black,
                        color = Secondary
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
private fun OnDemandOfferDialog(
    order: Order,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onExpired: () -> Unit
) {
    var now by remember(order.dispatchId, order.orderId) { mutableStateOf(System.currentTimeMillis()) }
    var expiredSent by remember(order.dispatchId, order.orderId) { mutableStateOf(false) }
    val expiresAt = order.offerExpiresAt ?: remember(order.dispatchId, order.orderId) {
        System.currentTimeMillis() + (order.offerTtlSeconds ?: ON_DEMAND_OFFER_TTL_SECONDS) * 1000L
    }
    val totalTtlMs = ((order.offerTtlSeconds ?: ON_DEMAND_OFFER_TTL_SECONDS) * 1000L).coerceAtLeast(1L)
    val remainingMs = (expiresAt - now).coerceAtLeast(0L)
    val remainingSeconds = ((remainingMs + 999L) / 1000L).toInt()
    val progress = (remainingMs.toFloat() / totalTtlMs.toFloat()).coerceIn(0f, 1f)

    LaunchedEffect(order.dispatchId, order.orderId, expiresAt) {
        while (now < expiresAt) {
            delay(250L)
            now = System.currentTimeMillis()
        }
    }

    LaunchedEffect(remainingSeconds) {
        if (remainingSeconds <= 0 && !expiredSent) {
            expiredSent = true
            onExpired()
        }
    }

    AlertDialog(
        onDismissRequest = {},
        confirmButton = {
            Button(
                onClick = {
                    if (remainingSeconds > 0) onAccept()
                },
                enabled = remainingSeconds > 0,
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Secondary)
            ) {
                Icon(Icons.Default.CheckCircle, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Terima")
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onReject, shape = RoundedCornerShape(8.dp)) {
                Icon(Icons.Default.Close, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Tolak")
            }
        },
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Pekerjaan On Demand", fontWeight = FontWeight.Bold)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        "Waktu respons",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Surface(
                        color = if (remainingSeconds <= 5) MaterialTheme.colorScheme.errorContainer else PrimaryLight,
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            "$remainingSeconds detik",
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            color = if (remainingSeconds <= 5) MaterialTheme.colorScheme.onErrorContainer else Primary
                        )
                    }
                }
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth(),
                    color = if (remainingSeconds <= 5) MaterialTheme.colorScheme.error else Secondary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )
                Text(
                    order.cleanPayoutIdr().toRupiahCompact(),
                    style = MaterialTheme.typography.titleMedium,
                    color = Secondary,
                    fontWeight = FontWeight.Bold
                )
                if (order.customerPriceIdr > 0 && order.platformCommissionIdr > 0) {
                    Text(
                        "Payout bersih setelah komisi platform",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "Paket masuk dan perlu diputuskan sekarang. Jika diterima, navigasi akan diarahkan ke lokasi pickup.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OfferRouteRow(Icons.Default.Storefront, "Pickup", order.pickupAddress)
                OfferRouteRow(Icons.Default.LocationOn, "Dropoff", order.dropAddress)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AssistChip(onClick = {}, label = { Text(order.distance.ifBlank { "0 km" }) })
                    AssistChip(onClick = {}, label = { Text(order.customerName.ifBlank { "Customer" }) })
                }
            }
        },
        shape = RoundedCornerShape(8.dp)
    )
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
            InfoPill(icon = Icons.Default.Route, text = order.distance.ifBlank { "0 km" })
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
    onLogout: () -> Unit,
    onSyncNow: () -> Unit,
    onOptimizeBattery: () -> Unit,
    onClearCache: () -> Unit
) {
    var showDiagnostics by remember { mutableStateOf(false) }
    var showResetLocalDataDialog by remember { mutableStateOf(false) }

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
                ProfileMetricRow(
                    icon = Icons.Default.Security,
                    title = "Mode stabilitas",
                    value = "Enterprise",
                    color = Secondary
                )
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
