package com.tembus.customer.ui.screens.history

import android.Manifest
import android.content.pm.PackageManager
import android.location.Geocoder

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.LocationServices
import com.tembus.customer.data.model.Order
import com.tembus.customer.data.model.OrderTrackingDetail
import com.tembus.customer.data.model.MapsProviderConfig
import com.tembus.customer.data.model.ReorderInfo
import com.tembus.customer.data.model.ReorderItem
import com.tembus.customer.ui.components.*
import com.tembus.customer.ui.components.maps.LatLng
import com.tembus.customer.ui.components.maps.MapProperties
import com.tembus.customer.ui.components.maps.MapUiSettings
import com.tembus.customer.ui.components.maps.RuntimeMapMarker
import com.tembus.customer.ui.components.maps.RuntimeMapRenderer
import com.tembus.customer.ui.designsystem.TembusBottomNavigation
import com.tembus.customer.ui.designsystem.TembusNavigationItem
import com.tembus.customer.ui.screens.main.FigmaHomeHeader
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.ui.draw.clip
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.TembusRadius
import com.tembus.customer.ui.theme.Background
import com.tembus.customer.ui.theme.CustomerCanvas
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryLight
import java.util.*
import com.tembus.customer.data.localization.LocaleFormatters
import com.tembus.customer.ui.screens.detail.OrderActionPolicy
import com.tembus.customer.BuildConfig
import coil.compose.AsyncImage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderHistoryScreen(
    viewModel: OrderHistoryViewModel = hiltViewModel(),
    onBackClick: () -> Unit,
    onOrderClick: (String) -> Unit,
    onReorderNavigate: () -> Unit,
    onTrackClick: (String) -> Unit = {},
    onChatClick: (String) -> Unit = {},
    onCallClick: (String, String?) -> Unit = { _, _ -> },
    onSearchClick: () -> Unit = {},
    onHomeClick: () -> Unit = {},
    onMessagesClick: () -> Unit = {},
    onNotificationsClick: () -> Unit = {},
    onProfileClick: () -> Unit = {},
) {
    val state by viewModel.uiState.collectAsState()
    val reorderState by viewModel.reorderState.collectAsState()
    val activeTracking by viewModel.activeTracking.collectAsState()
    val mapsProviderConfig by viewModel.mapsProviderConfig.collectAsState()
    val context = LocalContext.current
    var isRefreshing by remember { mutableStateOf(false) }
    var selectedFilter by remember { mutableStateOf("Semua") }
    var locationLabel by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val hasLocationPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasLocationPermission) return@LaunchedEffect
        runCatching {
            LocationServices.getFusedLocationProviderClient(context).lastLocation.addOnSuccessListener { location ->
                if (location == null) return@addOnSuccessListener
                runCatching {
                    @Suppress("DEPRECATION")
                    val address = Geocoder(context, java.util.Locale("id", "ID"))
                        .getFromLocation(location.latitude, location.longitude, 1)
                        ?.firstOrNull()
                    val parts = listOfNotNull(address?.subLocality, address?.locality, address?.adminArea)
                        .filter { it.isNotBlank() }
                    locationLabel = parts.takeIf { it.isNotEmpty() }?.take(2)?.joinToString(", ")
                }
            }
        }
    }

    LaunchedEffect(state) {
        if (isRefreshing && state !is HistoryUiState.Loading) isRefreshing = false
    }

    Scaffold(
        containerColor = CustomerCanvas,
        bottomBar = {
            TembusBottomNavigation(
                items = listOf(
                    TembusNavigationItem("Beranda", Icons.Default.LocalShipping, false, onHomeClick),
                    TembusNavigationItem("Aktivitas", Icons.Default.History, true, { }),
                    TembusNavigationItem("Pesan", Icons.Default.ChatBubbleOutline, false, onMessagesClick),
                    TembusNavigationItem("Notifikasi", Icons.Default.NotificationsActive, false, onNotificationsClick),
                    TembusNavigationItem("Akun", Icons.Default.Person, false, onProfileClick),
                ),
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = {
                isRefreshing = true
                viewModel.fetchHistory()
            },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .background(CustomerCanvas),
                contentPadding = PaddingValues(bottom = 20.dp),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                item {
                    FigmaHomeHeader(
                        customerName = "Pelanggan",
                        onSearchClick = onSearchClick,
                        locationLabel = locationLabel,
                        showSearchBar = false,
                        showWalletCard = false,
                    )
                }
                when (val res = state) {
                    is HistoryUiState.Loading -> item { LoadingListPlaceholder(itemCount = 3) }
                    is HistoryUiState.Error -> item {
                        FullScreenError(message = res.message, onRetry = { viewModel.fetchHistory() })
                    }
                    is HistoryUiState.Success -> {
                        val activeOrders = res.orders.filterNot(::isTerminalOrder)
                        val cancelledOrders = res.orders.filter(::isCancelledOrder)
                        val selesaiOrders = res.orders.filter(::isCompletedOrder)
                        val chipOptions = listOf("Semua", "Berlangsung", "Selesai", "Dibatalkan")
                        val historyOrders = when (selectedFilter) {
                            "Selesai" -> selesaiOrders
                            "Dibatalkan" -> cancelledOrders
                            "Berlangsung" -> emptyList()
                            else -> selesaiOrders + cancelledOrders
                        }

                        item {
                            ActivityTitleBlock(
                                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp),
                            )
                        }
                        item {
                            LazyRow(
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                contentPadding = PaddingValues(horizontal = 4.dp),
                            ) {
                                items(chipOptions.size) { index ->
                                    val label = chipOptions[index]
                                    val selected = selectedFilter == label
                                    val displayLabel = when {
                                        label == "Berlangsung" && activeOrders.isNotEmpty() -> "$label (${activeOrders.size})"
                                        else -> label
                                    }
                                    FilterChip(
                                        selected = selected,
                                        onClick = { selectedFilter = label },
                                        label = { Text(displayLabel, fontSize = 12.sp) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = Primary,
                                            selectedLabelColor = Color.White,
                                            containerColor = Color.White,
                                        ),
                                        border = FilterChipDefaults.filterChipBorder(
                                            borderColor = Color(0xFFDCE7DF),
                                            selectedBorderColor = Primary,
                                            enabled = true,
                                            selected = selected,
                                        ),
                                    )
                                }
                            }
                        }

                        if (activeOrders.isNotEmpty() && selectedFilter != "Selesai" && selectedFilter != "Dibatalkan") {
                            item {
                                ActivitySectionHeader(
                                    title = "PESANAN AKTIF",
                                    trailing = "Update realtime",
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                                )
                            }
                            item {
                                ActiveActivityCard(
                                    order = activeOrders.first(),
                                    detail = activeTracking,
                                    mapsProviderConfig = mapsProviderConfig,
                                    onTrackClick = { onTrackClick(activeOrders.first().orderId) },
                                    onChatClick = { onChatClick(activeOrders.first().orderId) },
                                    onCallClick = { onCallClick(activeOrders.first().orderId, activeOrders.first().courierName) },
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                )
                            }
                        }

                        item {
                            ActivitySectionHeader(
                                title = "RIWAYAT PESANAN",
                                trailing = "Filter Kategori",
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp),
                            )
                        }
                        if (historyOrders.isEmpty()) {
                            item {
                                ActivityEmptyState(
                                    message = if (selectedFilter == "Berlangsung") "Pesanan aktif tampil di bagian atas." else "Belum ada riwayat pada filter ini.",
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                )
                            }
                        } else {
                            items(historyOrders, key = { it.orderId.ifBlank { it.localId.toString() } }) { order ->
                                ActivityHistoryCard(
                                    order = order,
                                    onClick = { onOrderClick(order.orderId) },
                                    onReorder = if (order.isFoodOrder()) {
                                        { viewModel.checkReorder(order.orderId) }
                                    } else null,
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 5.dp),
                                )
                            }
                        }
                    }
                    else -> Unit
                }
            }
        }
    }

    // ── FB-084: dialog "Pesan Lagi" (reorder food) ──
    when (val reorder = reorderState) {
        is ReorderUiState.Loading -> {
            AlertDialog(
                onDismissRequest = { },
                title = { Text("Memeriksa menu…", fontWeight = FontWeight.Bold) },
                text = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(12.dp))
                        Text("Cek harga & ketersediaan item…", fontSize = 14.sp)
                    }
                },
                confirmButton = {}
            )
        }
        is ReorderUiState.Ready -> {
            ReorderConfirmDialog(
                info = reorder.info,
                onConfirm = {
                    viewModel.confirmReorder()
                    viewModel.dismissReorder()
                    onReorderNavigate()
                },
                onDismiss = { viewModel.dismissReorder() }
            )
        }
        is ReorderUiState.Error -> {
            AlertDialog(
                onDismissRequest = { viewModel.dismissReorder() },
                title = { Text("Gagal Pesan Lagi", fontWeight = FontWeight.Bold) },
                text = { Text(reorder.message, fontSize = 14.sp) },
                confirmButton = {
                    TextButton(onClick = { viewModel.dismissReorder() }) {
                        Text("OK", color = Primary)
                    }
                }
            )
        }
        else -> {}
    }
}

private fun isCancelledOrder(order: Order): Boolean {
    val status = order.status.trim().lowercase()
    return status in setOf("cancelled", "canceled", "failed", "rejected", "payment_failed") || status.contains("cancel")
}

private fun isCompletedOrder(order: Order): Boolean {
    return order.status.trim().lowercase() in setOf("delivered", "completed", "arrived")
}

private fun isTerminalOrder(order: Order): Boolean = isCancelledOrder(order) || isCompletedOrder(order)

@Composable
private fun ActivityTitleBlock(modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(
            "Aktivitas",
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold,
            color = OnSurface,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            "Lacak dan kelola pesananmu",
            fontSize = 12.sp,
            color = OnSurfaceVariant,
        )
    }
}

@Composable
private fun ActivitySectionHeader(
    title: String,
    trailing: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            title,
            fontSize = 13.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 0.3.sp,
            color = OnSurfaceVariant,
        )
        Text(
            trailing,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = if (trailing == "Update realtime") Color(0xFF0B7A53) else Color(0xFF0B7A53),
        )
    }
}

@Composable
private fun ActivityEmptyState(message: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = Color.White,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, Color(0xFFE1EAE3)),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(Icons.Default.History, contentDescription = null, tint = OnSurfaceVariant, modifier = Modifier.size(30.dp))
            Spacer(Modifier.height(8.dp))
            Text(message, fontSize = 12.sp, color = OnSurfaceVariant)
        }
    }
}

@Composable
private fun ActiveActivityCard(
    order: Order,
    detail: OrderTrackingDetail?,
    mapsProviderConfig: MapsProviderConfig,
    onTrackClick: () -> Unit,
    onChatClick: () -> Unit,
    onCallClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val location = detail?.tracking?.location
    val marker = location?.let {
        RuntimeMapMarker(
            id = "activity-courier-${order.orderId}",
            position = LatLng(it.latitude, it.longitude),
            title = order.courierName ?: "Kurir TEMBUS",
            snippet = "Posisi terakhir dari server",
        )
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFDCE7DF)),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(168.dp)
                .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
        ) {
            if (marker == null) {
                ActivityMapUnavailable(modifier = Modifier.fillMaxSize())
            } else {
                RuntimeMapRenderer(
                    providerConfig = mapsProviderConfig,
                    markers = listOf(marker),
                    routePoints = emptyList(),
                    followLocation = marker.position,
                    mapProperties = remember { MapProperties() },
                    mapUiSettings = remember {
                        MapUiSettings(
                            zoomControlsEnabled = false,
                            myLocationButtonEnabled = false,
                            mapToolbarEnabled = false,
                        )
                    },
                    fallbackTitle = "Peta sedang disiapkan",
                    fallbackMessage = "Posisi kurir akan tampil saat konfigurasi peta aktif.",
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Surface(
                modifier = Modifier.padding(10.dp),
                color = Color.White.copy(alpha = 0.94f),
                shape = RoundedCornerShape(999.dp),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = Primary, modifier = Modifier.size(13.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("PESANAN AKTIF", fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, color = Primary)
                }
            }
        }
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        activityServiceLabel(order),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = OnSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        "#${order.orderNumber.ifBlank { order.orderId.takeLast(6) }}",
                        fontSize = 11.sp,
                        color = OnSurfaceVariant,
                    )
                }
                Surface(
                    color = Color(0xFFE7F5ED),
                    shape = RoundedCornerShape(999.dp),
                ) {
                    Text(
                        OrderActionPolicy.statusLabel(order.status, order.serviceSubType),
                        color = Primary,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            val trackingOrder = detail?.order
            val courierName = trackingOrder?.courierName ?: order.courierName
            val courierVehicle = trackingOrder?.courierVehicle ?: order.courierVehicle
            val courierRating = trackingOrder?.courierRating
            val etaMinutes = trackingOrder?.etaMinutes ?: order.etaMinutes ?: detail?.tracking?.etaMinutes
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFEAF5EE)),
                    contentAlignment = Alignment.Center,
                ) {
                    val courierPhoto = trackingOrder?.courierPhotoUrl
                    if (!courierPhoto.isNullOrBlank()) {
                        AsyncImage(
                            model = activityMediaUrl(courierPhoto),
                            contentDescription = "Foto ${courierName ?: "kurir"}",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        Text(
                            courierInitials(courierName),
                            color = Primary,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 12.sp,
                        )
                    }
                }
                Spacer(Modifier.width(9.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        courierName ?: "Mencari kurir",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = OnSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        listOfNotNull(
                            courierRating?.let { "★ ${String.format(Locale.US, "%.1f", it)}" },
                            courierVehicle,
                        ).joinToString("  •  ").ifBlank { "Menunggu penugasan dari mitra" },
                        fontSize = 10.sp,
                        color = OnSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (etaMinutes != null && etaMinutes > 0) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text("ESTIMASI", fontSize = 8.sp, color = Color(0xFFE85D04), fontWeight = FontWeight.Bold)
                        Text("${etaMinutes} mnt", fontSize = 11.sp, color = Color(0xFFE85D04), fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            Text(order.pickupAddress.ifBlank { "Lokasi penjemputan belum tersedia" }, fontSize = 12.sp, color = OnSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("→ ${order.dropAddress.ifBlank { "Tujuan belum tersedia" }}", fontSize = 12.sp, color = OnSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Button(
                    onClick = onTrackClick,
                    modifier = Modifier.weight(1f).height(40.dp),
                    shape = RoundedCornerShape(999.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF6B00)),
                    contentPadding = PaddingValues(horizontal = 16.dp),
                ) {
                    Text("Lacak Pesanan", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                IconButton(onClick = onChatClick, modifier = Modifier.size(40.dp).background(Color(0xFFEAF5EE), CircleShape)) {
                    Icon(Icons.Default.ChatBubbleOutline, contentDescription = "Buka chat", tint = Primary, modifier = Modifier.size(19.dp))
                }
                IconButton(onClick = onCallClick, modifier = Modifier.size(40.dp).background(Color(0xFFEAF5EE), CircleShape)) {
                    Icon(Icons.Default.Phone, contentDescription = "Hubungi kurir", tint = Primary, modifier = Modifier.size(19.dp))
                }
            }
        }
    }
}

@Composable
private fun ActivityMapUnavailable(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.background(Color(0xFFEAF2F0)),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
            Icon(Icons.Default.LocationOn, contentDescription = null, tint = Primary, modifier = Modifier.size(30.dp))
            Spacer(Modifier.height(5.dp))
            Text("Lokasi kurir belum tersedia", color = OnSurface, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("Menunggu snapshot dari server", color = OnSurfaceVariant, fontSize = 10.sp)
        }
    }
}

@Composable
private fun ActivityHistoryCard(
    order: Order,
    onClick: () -> Unit,
    onReorder: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val isFood = order.isFoodOrder()
    val status = OrderActionPolicy.statusLabel(order.status, order.serviceSubType)
    val statusColor = if (isCancelledOrder(order)) Error else Primary
    val serviceIconSpec = getTembusServiceIconSpec(
        if (isFood) "food_delivery" else order.serviceSubType ?: order.serviceCategory,
    )
    Card(
        modifier = modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFF0F2EF)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                val foodImage = order.foodItems.firstOrNull { !it.photo.isNullOrBlank() }?.photo
                if (isFood && !foodImage.isNullOrBlank()) {
                    AsyncImage(
                        model = activityMediaUrl(foodImage),
                        contentDescription = "Foto ${order.merchantName ?: "pesanan makanan"}",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(52.dp).clip(CircleShape),
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(if (isFood) Color(0xFFFFF0E9) else Color(0xFFEAF5EE)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(serviceIconSpec.icon, contentDescription = serviceIconSpec.label, tint = if (isFood) Color(0xFFE85D04) else Primary, modifier = Modifier.size(24.dp))
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(activityServiceLabel(order), fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = OnSurface, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Spacer(Modifier.width(6.dp))
                        Surface(color = Color(0xFFE8F3EA), shape = RoundedCornerShape(999.dp)) {
                            Text("#${order.orderNumber.ifBlank { order.orderId.takeLast(6) }}", fontSize = 10.sp, color = Primary, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 7.dp, vertical = 4.dp))
                        }
                    }
                    Spacer(Modifier.height(3.dp))
                    Text(LocaleFormatters.dateTime(order.createdAt, Locale.getDefault().toLanguageTag()), fontSize = 12.sp, color = OnSurfaceVariant)
                }
                Spacer(Modifier.width(6.dp))
                Surface(color = statusColor.copy(alpha = 0.10f), shape = RoundedCornerShape(999.dp)) {
                    Row(modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = statusColor, modifier = Modifier.size(13.dp))
                        Spacer(Modifier.width(3.dp))
                        Text(status, fontSize = 10.sp, color = statusColor, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
                Surface(color = CustomerCanvas, shape = RoundedCornerShape(20.dp)) {
                Row(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(serviceIconSpec.icon, contentDescription = null, tint = OnSurfaceVariant, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        if (isFood && !order.merchantName.isNullOrBlank()) {
                            Text(order.merchantName!!, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = OnSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(foodSummary(order), fontSize = 12.sp, color = OnSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        } else {
                            Text(order.pickupAddress.ifBlank { "Lokasi penjemputan belum tersedia" }, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = OnSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${order.dropAddress.ifBlank { "Tujuan belum tersedia" }}", fontSize = 12.sp, color = OnSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
            Spacer(Modifier.height(13.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Total Biaya", fontSize = 11.sp, color = OnSurfaceVariant, fontWeight = FontWeight.SemiBold)
                    Text(formatFee(order.fee), fontSize = 16.sp, color = OnSurface, fontWeight = FontWeight.ExtraBold)
                }
                if (isFood) {
                    OutlinedButton(onClick = onClick, shape = RoundedCornerShape(999.dp), contentPadding = PaddingValues(horizontal = 14.dp), modifier = Modifier.height(38.dp)) {
                        Text("Beri Penilaian", color = Primary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = { onReorder?.invoke() }, enabled = onReorder != null, shape = RoundedCornerShape(999.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF6B00)), contentPadding = PaddingValues(horizontal = 14.dp), modifier = Modifier.height(38.dp)) {
                        Text("Pesan Lagi", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

private fun activityServiceLabel(order: Order): String {
    return when {
        order.isFoodOrder() -> "TEMBUS Food"
        order.serviceSubType?.contains("towing", ignoreCase = true) == true || order.serviceCategory?.contains("towing", ignoreCase = true) == true -> "Towing"
        order.serviceSubType?.contains("tambal", ignoreCase = true) == true || order.serviceCategory?.contains("tambal", ignoreCase = true) == true ||
            order.serviceSubType?.contains("tire", ignoreCase = true) == true || order.serviceSubType?.contains("repair", ignoreCase = true) == true -> "Tambal Ban"
        order.serviceCategory?.contains("aggregator", ignoreCase = true) == true -> "Aggregator"
        else -> "Kirim Paket"
    }
}

private fun foodSummary(order: Order): String {
    if (order.foodItems.isEmpty()) return "Detail menu tersimpan di pesanan"
    return buildString {
        order.foodItems.take(2).forEachIndexed { index, item ->
            if (index > 0) append(", ")
            append("${item.quantity}× ${item.name}")
        }
        if (order.foodItems.size > 2) append(" +${order.foodItems.size - 2} lainnya")
    }
}

private fun courierInitials(name: String?): String {
    val parts = name.orEmpty().trim().split("\\s+".toRegex()).filter { it.isNotBlank() }
    return when {
        parts.size >= 2 -> "${parts[0].first()}${parts[1].first()}".uppercase(Locale.getDefault())
        parts.size == 1 -> parts.first().take(2).uppercase(Locale.getDefault())
        else -> "K"
    }
}

private fun activityMediaUrl(path: String): String {
    if (path.startsWith("http://") || path.startsWith("https://")) return path
    val gatewayBase = BuildConfig.BASE_URL.substringBefore("/api/v1").trimEnd('/')
    return "$gatewayBase/${path.trimStart('/')}"
}

private fun Order.isFoodOrder(): Boolean =
    serviceSubType.equals("food_delivery", ignoreCase = true) ||
        serviceCategory.equals("food_delivery", ignoreCase = true) ||
        serviceCategory.equals("food", ignoreCase = true)

@Composable
fun OrderCardItem(
    order: Order,
    onClick: () -> Unit,
    isFood: Boolean = false,
    onReorder: (() -> Unit)? = null
) {
    val serviceIconSpec = getTembusServiceIconSpec(
        when {
            isFood -> "food_delivery"
            !order.serviceSubType.isNullOrBlank() -> order.serviceSubType
            else -> order.serviceCategory
        }
    )
    val normalizedStatus = order.status.trim().lowercase()
    val statusColor = when(normalizedStatus) {
        "delivered" -> Color(0xFF22C55E)
        "failed", "cancelled", "canceled", "rejected", "payment_failed" -> Error
        else -> Primary
    }
    val statusLabel = OrderActionPolicy.statusLabel(order.status, order.serviceSubType)
    
    val dateString = LocaleFormatters.dateTime(order.createdAt, Locale.getDefault().toLanguageTag())

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(1.dp),
        border = BorderStroke(1.dp, Outline),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("No. Resi ${order.orderNumber}", fontSize = 12.sp, color = OnSurfaceVariant)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        serviceIconSpec.icon,
                        contentDescription = serviceIconSpec.label,
                        tint = if (isFood) Primary else OnSurfaceVariant,
                        modifier = Modifier.size(16.dp).padding(end = 2.dp),
                    )
                    Card(
                        colors = CardDefaults.cardColors(containerColor = if (isFood) PrimaryLight.copy(alpha = 0.25f) else Color(0xFFE8EAF6)),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.padding(end = 6.dp)
                    ) {
                        Text(
                            text = serviceIconSpec.label.uppercase(Locale.getDefault()),
                            color = if (isFood) Primary else Color(0xFF3949AB),
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                        )
                    }
                    Card(
                        colors = CardDefaults.cardColors(containerColor = statusColor.copy(alpha = 0.1f)),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = statusLabel,
                            color = statusColor,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            if (isFood && order.merchantName != null) {
                Text(order.merchantName!!, fontWeight = FontWeight.Bold, maxLines = 1, fontSize = 15.sp, color = OnSurface)
                if (order.foodItems.isNotEmpty()) {
                    val foodSummary = buildString {
                        order.foodItems.take(2).forEachIndexed { index, item ->
                            if (index > 0) append(", ")
                            append("${item.quantity}× ${item.name}")
                        }
                        if (order.foodItems.size > 2) append(" +${order.foodItems.size - 2} lainnya")
                    }
                    Text(
                        foodSummary,
                        color = OnSurfaceVariant,
                        fontSize = 12.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Spacer(Modifier.height(2.dp))
            }
            Text(
                text = order.pickupAddress,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                fontSize = 15.sp,
                color = OnSurface
            )
            Spacer(Modifier.height(2.dp))
            Text("Tujuan: " + order.dropAddress, color = OnSurfaceVariant, fontSize = 14.sp, maxLines = 1)
            
            Divider(Modifier.padding(vertical = 12.dp), thickness = 0.5.dp, color = Outline)
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(dateString, fontSize = 12.sp, color = OnSurfaceVariant)
                Text(formatFee(order.fee), fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = Primary)
            }

            // FB-084: tombol "Pesan Lagi" khusus order food
            if (isFood && onReorder != null) {
                Spacer(Modifier.height(10.dp))
                Button(
                    onClick = onReorder,
                    modifier = Modifier.fillMaxWidth().height(42.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Restaurant, contentDescription = "", modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Pesan Lagi", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

/** FB-084: konfirmasi reorder — tampilkan item lama vs harga sekarang. */
@Composable
private fun ReorderConfirmDialog(
    info: ReorderInfo,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text("Pesan Lagi?", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Text(
                    info.merchantName,
                    fontSize = 13.sp,
                    color = OnSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
            ) {
                if (!info.merchantOpen) {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Error.copy(alpha = 0.1f)),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)
                    ) {
                        Text(
                            "Merchant sedang tutup. Cek jam buka sebelum checkout.",
                            fontSize = 12.sp,
                            color = Error,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(10.dp)
                        )
                    }
                }
                info.items.forEach { item ->
                    ReorderItemRow(item)
                }
                if (info.hasChanges) {
                    Spacer(Modifier.height(6.dp))
                    Divider(Modifier.fillMaxWidth(), thickness = 0.5.dp, color = Outline)
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Total saat itu", fontSize = 13.sp, color = OnSurfaceVariant)
                        Text(
                            formatRupiah(info.totalOld),
                            fontSize = 13.sp,
                            color = OnSurfaceVariant,
                            textDecoration = TextDecoration.LineThrough
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Total sekarang", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text(formatRupiah(info.totalNew), fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = Primary)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                enabled = info.merchantOpen,
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Pesan Lagi", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Batal", color = OnSurfaceVariant)
            }
        }
    )
}

@Composable
private fun ReorderItemRow(item: ReorderItem) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "${item.quantity}× ${item.itemName}",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (item.available) OnSurface else OnSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            if (!item.available) {
                Text("Tidak tersedia", fontSize = 12.sp, color = Error, fontWeight = FontWeight.SemiBold)
            } else if (item.priceChanged) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        formatRupiah(item.oldPrice),
                        fontSize = 12.sp,
                        color = OnSurfaceVariant,
                        textDecoration = TextDecoration.LineThrough
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        formatRupiah(item.newPrice),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Primary
                    )
                }
            } else {
                Text(formatRupiah(item.newPrice), fontSize = 12.sp, color = OnSurfaceVariant)
            }
        }
    }
}

private fun formatRupiah(value: Long): String =
    LocaleFormatters.currency(value, "IDR", Locale.getDefault().toLanguageTag())

private fun formatFee(value: String): String = value.toLongOrNull()?.let(::formatRupiah) ?: value

@Composable
fun EmptyHistoryState(modifier: Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(Icons.Default.History, contentDescription = "", modifier = Modifier.size(64.dp), tint = PrimaryLight)
        Spacer(Modifier.height(16.dp))
        Text("Belum Ada Riwayat", fontWeight = FontWeight.Bold, color = OnSurface)
        Text("Semua order Anda akan muncul di sini", fontSize = 14.sp, color = OnSurfaceVariant)
    }
}
