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
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.repository.OrderRepository
import com.lancar.courier.data.session.AuthSessionManager
import com.lancar.courier.ui.screens.order.OrderDetailScreen
import com.lancar.courier.ui.screens.order.OrderScreen
import com.lancar.courier.ui.screens.order.OrderViewModel
import com.lancar.courier.ui.screens.order.OrderViewModelFactory
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

    // Real ViewModel backed by Room DB
    val orderViewModel: OrderViewModel = viewModel(
        factory = OrderViewModelFactory(OrderRepository(context))
    )

    val allOrders by orderViewModel.allOrders.collectAsState()
    val pendingOrders by orderViewModel.pendingOrders.collectAsState()
    val deliveredToday by orderViewModel.deliveredTodayOrders.collectAsState()
    val isSyncing by orderViewModel.isSyncing.collectAsState()
    val error by orderViewModel.error.collectAsState()

    val authSessionManager = remember { AuthSessionManager(context) }
    val courierName by authSessionManager.courierName.collectAsState(initial = "Courier")

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
                    onCapturePod = { order ->
                        selectedOrder = order
                        showPodScreen = true
                    },
                    onViewOrders = { selectedTab = 1 },
                    onScanPackage = { showScanScreen = true },
                    orders = allOrders
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
                    onLogout = { showLogoutDialog = true }
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
    onCapturePod: (Order) -> Unit,
    onViewOrders: () -> Unit,
    onScanPackage: () -> Unit
) {
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
    onLogout: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(
            text = "Profil Kurir",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )

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

                HorizontalDivider()

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

        Spacer(modifier = Modifier.weight(1f))

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
