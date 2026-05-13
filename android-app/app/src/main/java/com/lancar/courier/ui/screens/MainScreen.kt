package com.lancar.courier.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.session.AuthSessionManager
import com.lancar.courier.service.LocationTrackerService
import com.lancar.courier.ui.screens.order.OrderDetailScreen
import com.lancar.courier.ui.screens.order.OrderScreen
import com.lancar.courier.ui.screens.order.OrderViewModel
import com.lancar.courier.ui.screens.pod.ProofOfDeliveryScreen
import com.lancar.courier.ui.screens.scan.ScanScreen
import com.lancar.courier.ui.theme.Primary
import kotlinx.coroutines.launch

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
    val isSyncing by orderViewModel.isSyncing.collectAsState()
    val error by orderViewModel.error.collectAsState()

    val authSessionManager = remember { AuthSessionManager(context) }
    val courierName by authSessionManager.courierName.collectAsState(initial = "Courier")
    val isOnline by authSessionManager.isOnline.collectAsState(initial = false)

    var selectedTab by remember { mutableStateOf(0) }
    var showPodScreen by remember { mutableStateOf(false) }
    var showOrderDetail by remember { mutableStateOf(false) }
    var showScanScreen by remember { mutableStateOf(false) }
    var selectedOrder by remember { mutableStateOf<Order?>(null) }
    var showLogoutDialog by remember { mutableStateOf(false) }

    // Navigate to order detail if app was opened from notification
    LaunchedEffect(initialOrderId) {
        if (initialOrderId != null) {
            val order = orderViewModel.getOrderById(initialOrderId)
            if (order != null) {
                selectedOrder = order
                showOrderDetail = true
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

    // ── PoD Screen ─────────────────────────────────────────────
    if (showPodScreen && selectedOrder != null) {
        ProofOfDeliveryScreen(
            order = selectedOrder!!,
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
    if (showOrderDetail && selectedOrder != null) {
        OrderDetailScreen(
            order = selectedOrder!!,
            onBack = {
                showOrderDetail = false
                selectedOrder = null
            },
            onUpdateStatus = { newStatus ->
                // Optimistic local update + backend sync
                orderViewModel.updateOrderStatusAndSync(
                    orderId = selectedOrder!!.orderId,
                    status = newStatus
                )
                selectedOrder = selectedOrder?.copy(status = newStatus)
            },
            onCapturePod = {
                showOrderDetail = false
                showPodScreen = true
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
                    Text(
                        text = "LANCAR Courier",
                        fontWeight = FontWeight.Bold
                    )
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
                    label = { Text("Home") },
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
                    label = { Text("Orders") },
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Person, contentDescription = "Profile") },
                    label = { Text("Profile") },
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 }
                )
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            when (selectedTab) {
                0 -> HomeContent(
                    courierName = courierName ?: "Courier",
                    totalOrders = allOrders.size,
                    pendingCount = pendingOrders.size,
                    deliveredCount = deliveredToday.size,
                    orders = allOrders,
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

                            authSessionManager.setOnlineStatus(online)
                            try {
                                if (online) {
                                    val intent = LocationTrackerService.startIntent(context)
                                    androidx.core.content.ContextCompat.startForegroundService(context, intent)
                                    snackbarHostState.showSnackbar("Status Berhasil Diubah Ke: ON DUTY. GPS Aktif.")
                                } else {
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
                    onViewOrders = { selectedTab = 1 },
                    onScanPackage = { showScanScreen = true }
                )
                1 -> OrdersContent(
                    orders = allOrders,
                    isSyncing = isSyncing,
                    onOrderClick = { order ->
                        selectedOrder = order
                        showOrderDetail = true
                    },
                    onSync = { orderViewModel.syncPendingOrders() },
                    onRefresh = { orderViewModel.fetchOrdersFromBackend() }
                )
                2 -> ProfileContent(
                    courierName = courierName ?: "Courier",
                    pendingSyncCount = pendingOrders.size,
                    onLogout = { showLogoutDialog = true },
                    onSyncNow = { orderViewModel.syncPendingOrders() },
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
    totalOrders: Int,
    pendingCount: Int,
    deliveredCount: Int,
    orders: List<Order>,
    isOnline: Boolean,
    onOnlineToggle: (Boolean) -> Unit,
    onCapturePod: (Order) -> Unit,
    onViewOrders: () -> Unit,
    onScanPackage: () -> Unit
) {
    // Duty Status Card
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (isOnline) 
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
            else 
                MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.15f)
        ),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            if (isOnline) MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
            else MaterialTheme.colorScheme.error.copy(alpha = 0.5f)
        )
    ) {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                Icon(
                    imageVector = if (isOnline) Icons.Default.CircleNotifications else Icons.Default.NotificationsPaused,
                    contentDescription = null,
                    tint = if (isOnline) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(32.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = if (isOnline) "Status: AKTIF (On Duty)" else "Status: NONAKTIF (Off Duty)",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = if (isOnline) Color(0xFF1B5E20) else MaterialTheme.colorScheme.error
                    )
                    Text(
                        text = if (isOnline) "GPS & Sinkronisasi Latar Aktif." else "Aktifkan switch untuk kirim paket.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Switch(
                checked = isOnline,
                onCheckedChange = onOnlineToggle,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = Color(0xFF2E7D32)
                )
            )
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Halo, $courierName! 👋",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Semangat mengantar hari ini!",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                StatCard(title = "Total", value = "$totalOrders")
                StatCard(title = "Pending", value = "$pendingCount")
                StatCard(title = "Selesai", value = "$deliveredCount")
            }
        }
    }

    // Quick Actions
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Aksi Cepat",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(12.dp))
            Button(
                onClick = onScanPackage,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Scan Paket")
            }
            Spacer(modifier = Modifier.height(8.dp))
            // PoD: only if there's an order in_transit or picked_up
            val podOrder = orders.firstOrNull { it.status == "in_transit" || it.status == "picked_up" }
            Button(
                onClick = { podOrder?.let { onCapturePod(it) } },
                modifier = Modifier.fillMaxWidth(),
                enabled = podOrder != null
            ) {
                Icon(Icons.Default.CameraAlt, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text(if (podOrder != null) "Foto Bukti Pengiriman" else "Tidak Ada Order Aktif")
            }
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = onViewOrders,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.LocalShipping, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Lihat Semua Order")
            }
        }
    }
}

@Composable
private fun StatCard(title: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = Primary
        )
        Text(
            text = title,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun OrdersContent(
    orders: List<Order>,
    isSyncing: Boolean,
    onOrderClick: (Order) -> Unit,
    onSync: () -> Unit,
    onRefresh: () -> Unit
) {
    if (orders.isEmpty() && !isSyncing) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
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
                Spacer(modifier = Modifier.height(8.dp))
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
            onOrderClick = onOrderClick,
            onSync = onSync
        )
    }
}

@Composable
private fun ProfileContent(
    courierName: String,
    pendingSyncCount: Int,
    onLogout: () -> Unit,
    onSyncNow: () -> Unit,
    onClearCache: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(
            text = "Profil Kurir",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )

        // User Info Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Person,
                        contentDescription = null,
                        tint = Primary,
                        modifier = Modifier.size(32.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = courierName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = "Kurir Aktif",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Divider()

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Antrian Sinkronisasi", style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = "$pendingSyncCount item",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = if (pendingSyncCount > 0)
                            MaterialTheme.colorScheme.error
                        else
                            MaterialTheme.colorScheme.primary
                    )
                }
            }
        }

        // Diagnostics & Self-Healing Card
        Text(
            text = "Pemeliharaan Aplikasi",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp)
        )

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
            shape = RoundedCornerShape(16.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.1f))
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Build, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Self-Healing Diagnostik", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                }

                Text(
                    text = "Gunakan tombol di bawah untuk memperbaiki masalah sinkronisasi atau membersihkan penyimpanan cache gambar PoD.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = onSyncNow,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 8.dp)
                    ) {
                        Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Paksa Sync", style = MaterialTheme.typography.labelMedium)
                    }

                    OutlinedButton(
                        onClick = onClearCache,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 8.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
                    ) {
                        Icon(Icons.Default.DeleteSweep, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Hapus Cache", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = "App Stable Architecture v2.1.0",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
            )
            Text(
                text = "LANCAR LOGISTICS ENTERPRISE",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
            )
        }

        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = MaterialTheme.colorScheme.error
            )
        ) {
            Icon(Icons.Default.Logout, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Keluar Aplikasi")
        }
    }
}
