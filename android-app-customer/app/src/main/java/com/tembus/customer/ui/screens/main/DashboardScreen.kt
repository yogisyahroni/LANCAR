package com.tembus.customer.ui.screens.main

import android.Manifest
import android.os.Build
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material.icons.filled.TwoWheeler
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.tembus.customer.R
import com.tembus.customer.data.model.DeliveryServiceProduct
import com.tembus.customer.data.model.Order
import com.tembus.customer.ui.components.ServiceGridMenu
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.AccentLight
import com.tembus.customer.ui.theme.Background
import com.tembus.customer.ui.theme.CustomerHeroEnd
import com.tembus.customer.ui.theme.CustomerHeroStart
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryDark
import com.tembus.customer.ui.theme.PrimaryLight
import com.tembus.customer.ui.theme.Secondary
import com.tembus.customer.ui.theme.SecondaryLight

private val Ink @Composable get() = MaterialTheme.colorScheme.onSurface
private val Muted @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
private val LcGreen @Composable get() = MaterialTheme.colorScheme.primary
private val LcGreenDark @Composable get() = MaterialTheme.colorScheme.onPrimaryContainer
private val SoftGreen @Composable get() = MaterialTheme.colorScheme.primaryContainer
private val SoftBlue @Composable get() = MaterialTheme.colorScheme.secondaryContainer
private val SoftOrange @Composable get() = MaterialTheme.colorScheme.tertiaryContainer
private val SurfaceLine @Composable get() = MaterialTheme.colorScheme.outline

@OptIn(ExperimentalPermissionsApi::class, ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel = hiltViewModel(),
    onNotificationsClick: () -> Unit = {},
    onBookingClick: (String?) -> Unit = {},
    onTrackingClick: (String) -> Unit = {},
    onChatClick: (String) -> Unit = {},
    onHistoryClick: () -> Unit = {},
    onBusinessClick: () -> Unit = {},
    onProfileClick: () -> Unit = {}
) {
    val customerName by viewModel.customerName.collectAsState()
    // FB-126: list SEMUA order aktif (bisa >1: food + parcel).
    val activeOrders by viewModel.activeOrders.collectAsState()
    val incomingPackages by viewModel.incomingPackages.collectAsState()
    val services by viewModel.services.collectAsState()
    val dataError by viewModel.dataError.collectAsState()
    val notificationUnreadCount by viewModel.notificationUnreadCount.collectAsState()
    val notificationUnreadByCategory by viewModel.notificationUnreadByCategory.collectAsState()
    // A4: global banner (pengumuman in-app platform-wide dari super_admin).
    val banners by viewModel.banners.collectAsState()
    val hasUnreadMessages = (notificationUnreadByCategory["message"] ?: 0) > 0
    val notificationPermissionState = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        rememberPermissionState(Manifest.permission.POST_NOTIFICATIONS)
    } else {
        null
    }
    var showNotificationPermissionPrompt by rememberSaveable { mutableStateOf(true) }
    val shouldShowNotificationPermissionPrompt = notificationPermissionState != null &&
        !notificationPermissionState.status.isGranted &&
        showNotificationPermissionPrompt

    var isRefreshing by remember { mutableStateOf(false) }

    if (isRefreshing) {
        LaunchedEffect(Unit) {
            viewModel.refreshData()
            isRefreshing = false
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 8.dp) {
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Home, contentDescription = "Beranda") },
                    label = { Text("Beranda") },
                    selected = true,
                    onClick = {},
                    colors = tembusNavigationColors()
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.History, contentDescription = "Riwayat") },
                    label = { Text("Riwayat") },
                    selected = false,
                    onClick = onHistoryClick,
                    colors = tembusNavigationColors()
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Store, contentDescription = "Bisnis") },
                    label = { Text("Bisnis") },
                    selected = false,
                    onClick = onBusinessClick,
                    colors = tembusNavigationColors()
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Person, contentDescription = "Profil") },
                    label = { Text("Profil") },
                    selected = false,
                    onClick = onProfileClick,
                    colors = tembusNavigationColors()
                )
            }
        }
    ) { paddingValues ->
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = { isRefreshing = true },
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 30.dp),
                verticalArrangement = Arrangement.spacedBy(28.dp)
            ) {
            item {
                HomeHero(
                    customerName = customerName.orEmpty().ifBlank { "Pelanggan" },
                    notificationUnreadCount = notificationUnreadCount,
                    onNotificationsClick = onNotificationsClick,
                    onCreateOrderClick = { onBookingClick(null) },
                    onPickupClick = { onBookingClick("pickup") },
                    onDestinationClick = { onBookingClick("dropoff") }
                )
            }
            // A4: global banner (pengumuman in-app platform-wide dari super_admin).
            if (banners.isNotEmpty()) {
                item {
                    GlobalBannerCard(banners = banners)
                }
            }
            if (shouldShowNotificationPermissionPrompt) {
                item {
                    NotificationPermissionPromptCard(
                        onEnable = { notificationPermissionState?.launchPermissionRequest() },
                        onDismiss = { showNotificationPermissionPrompt = false }
                    )
                }
            }
            // FB-126: tampilkan SEMUA order aktif — kartu per order.
            // (Backend tidak memblokir order food kedua, jadi banner
            // tunggal tidak cukup kalau customer punya >1 order jalan.)
            activeOrders.forEach { order ->
                item(key = "active-${order.orderId}") {
                    ActiveOrderCard(
                        title = if (order.serviceSubType == "food_delivery") "Pesanan makanan aktif" else "Pengiriman aktif",
                        subtitle = order.dropAddress.ifBlank { order.pickupAddress.ifBlank { order.orderId } },
                        status = order.status,
                        hasUnreadMessage = hasUnreadMessages,
                        onClick = { onTrackingClick(order.orderId) },
                        onChatClick = { onChatClick(order.orderId) }
                    )
                }
            }
            if (incomingPackages.isNotEmpty()) {
                item {
                    IncomingPackagesSection(
                        packages = incomingPackages,
                        hasUnreadMessage = hasUnreadMessages,
                        onTrackingClick = onTrackingClick,
                        onChatClick = onChatClick
                    )
                }
            }
            dataError?.let { message ->
                item {
                    DashboardDataErrorCard(
                        message = message,
                        onRetry = viewModel::refreshData
                    )
                }
            }
            item {
                LocationRequestCard(onBookingClick = { onBookingClick("dropoff") })
            }
            item {
                ServiceOverview(services = services, onBookingClick = onBookingClick, onHistoryClick = onHistoryClick, onFavoritesClick = { onBookingClick("food_favorites") })
            }
            item {
                TrustCard()
            }
        }

        }
    }
}

@Composable
private fun tembusNavigationColors() = NavigationBarItemDefaults.colors(
    selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
    selectedTextColor = MaterialTheme.colorScheme.primary,
    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
)

@Composable
private fun UnreadDot(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(9.dp)
            .clip(CircleShape)
            .background(Accent)
    )
}

@Composable
private fun TembusBrandMark(modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(id = R.drawable.tembus_home_logo),
        contentDescription = "TEMBUS",
        contentScale = ContentScale.Fit,
        modifier = modifier,
    )
}

@Composable
private fun TrustMiniPill(
    icon: ImageVector,
    label: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.88f),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text(label, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun DashboardDataErrorCard(
    message: String,
    onRetry: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = AccentLight),
        border = BorderStroke(1.dp, Accent.copy(alpha = 0.24f))
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Shield, contentDescription = null, tint = Accent)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Data sedang disinkronkan", color = Ink, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp, fontSize = 15.sp)
                Text(message, color = PrimaryDark, fontSize = 12.sp, lineHeight = 17.sp)
            }
            TextButton(onClick = onRetry) {
                Text("Coba Lagi", fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
private fun NotificationPermissionPromptCard(
    onEnable: () -> Unit,
    onDismiss: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, SurfaceLine),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier.padding(17.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(SoftGreen),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.NotificationsActive, contentDescription = null, tint = LcGreen)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("Aktifkan notifikasi order", color = Ink, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp, fontSize = 16.sp)
                Text(
                    "Chat kurir, status pengiriman, bantuan, dan promo yang kamu izinkan akan muncul tepat waktu.",
                    color = Muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp
                )
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = onDismiss) {
                        Text("Nanti", color = Muted, fontWeight = FontWeight.ExtraBold)
                    }
                    Button(
                        onClick = onEnable,
                        colors = ButtonDefaults.buttonColors(containerColor = LcGreen, contentColor = Color.White),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Text("Aktifkan", fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeHero(
    customerName: String,
    notificationUnreadCount: Int,
    onNotificationsClick: () -> Unit,
    onCreateOrderClick: () -> Unit,
    onPickupClick: () -> Unit,
    onDestinationClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(280.dp)
                .background(
                    Brush.verticalGradient(
                        listOf(PrimaryDark, CustomerHeroStart, CustomerHeroEnd)
                    )
                )
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(top = 18.dp, bottom = 18.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TembusBrandMark(modifier = Modifier.size(width = 150.dp, height = 54.dp))
                Spacer(Modifier.weight(1f))
                Box(contentAlignment = Alignment.TopEnd) {
                    IconButton(
                        onClick = onNotificationsClick,
                        modifier = Modifier
                            .size(46.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.14f))
                            .border(BorderStroke(1.dp, Color.White.copy(alpha = 0.18f)), CircleShape)
                    ) {
                        Icon(Icons.Default.NotificationsActive, contentDescription = "Notifikasi", tint = Color.White)
                    }
                    if (notificationUnreadCount > 0) {
                        Box(
                            modifier = Modifier
                                .size(20.dp)
                                .clip(CircleShape)
                                .background(Accent),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                notificationUnreadCount.coerceAtMost(99).toString(),
                                color = Color.White,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Black
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            Text(
                "Kirim Aman,\nSampai Tujuan.",
                color = Color.White,
                fontSize = 28.sp,
                lineHeight = 34.sp,
                letterSpacing = (-1).sp,
                fontWeight = FontWeight.Black
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "Atur pickup, tujuan, dan pantau pengiriman dalam satu aplikasi.",
                color = Color.White.copy(alpha = 0.86f),
                fontSize = 14.sp,
                lineHeight = 20.sp,
                modifier = Modifier.padding(end = 12.dp)
            )
            Spacer(Modifier.height(12.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, SurfaceLine),
                elevation = CardDefaults.cardElevation(defaultElevation = 12.dp)
            ) {
                Column(Modifier.padding(22.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                "Halo, $customerName",
                                fontSize = 20.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Ink,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text("Mulai pengiriman baru atau lanjut pantau order aktif.", color = Muted, fontSize = 13.sp, lineHeight = 18.sp)
                        }
                        Box(
                            modifier = Modifier
                                .size(58.dp)
                                .clip(RoundedCornerShape(21.dp))
                                .background(MaterialTheme.colorScheme.secondaryContainer),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.LocalShipping, contentDescription = null, tint = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.size(33.dp))
                        }
                    }

                    Spacer(Modifier.height(18.dp))
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(18.dp))
                            .background(MaterialTheme.colorScheme.background)
                            .padding(14.dp)
                    ) {
                        RouteLine(
                            icon = Icons.Default.Place,
                            color = LcGreen,
                            label = "Ambil paket di",
                            value = "Cari lokasi pickup",
                            onClick = onPickupClick
                        )
                        Row(Modifier.padding(start = 19.dp)) {
                            Box(
                                Modifier
                                    .height(18.dp)
                                    .width(1.dp)
                                    .background(SurfaceLine)
                            )
                            Spacer(Modifier.weight(1f))
                            Box(
                                modifier = Modifier
                                    .size(42.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surface)
                                    .border(BorderStroke(1.dp, SurfaceLine), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(Icons.Default.SwapVert, contentDescription = null, tint = Muted, modifier = Modifier.size(20.dp))
                            }
                        }
                        RouteLine(
                            icon = Icons.Default.Navigation,
                            color = MaterialTheme.colorScheme.secondary,
                            label = "Tujuan pengiriman",
                            value = "Tambah alamat tujuan",
                            onClick = onDestinationClick
                        )
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            Button(
                onClick = onCreateOrderClick,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color.White),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp)
            ) {
                Text("Kirim Sekarang", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                Spacer(Modifier.width(10.dp))
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null)
            }

            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                TrustMiniPill(Icons.Default.LocalShipping, "Cepat", Modifier.weight(1f))
                TrustMiniPill(Icons.Default.Shield, "Aman", Modifier.weight(1f))
                TrustMiniPill(Icons.Default.VerifiedUser, "Terpercaya", Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun RouteLine(
    icon: ImageVector,
    color: Color,
    label: String,
    value: String,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .clickable { onClick() }
            .padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(color.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = color)
        }
        Spacer(Modifier.width(13.dp))
        Column(Modifier.weight(1f)) {
            Text(label, color = Muted, fontSize = 12.sp)
            Text(
                value,
                color = Ink,
                fontSize = 17.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
    }
}

@Composable
private fun ActiveOrderCard(
    title: String,
    subtitle: String,
    status: String,
    hasUnreadMessage: Boolean,
    onClick: () -> Unit,
    onChatClick: () -> Unit
) {
    val statusLower = status.lowercase()
    val isCancelled = statusLower in setOf("cancelled", "canceled", "failed", "rejected", "payment_failed") || statusLower.contains("cancel")
    val isDelivered = statusLower in setOf("delivered", "completed", "arrived")
    val canOpenChat = !isCancelled && !isDelivered && statusLower in setOf(
        "assigned",
        "accepted",
        "picking_up",
        "picked_up",
        "in_transit",
        "delivering"
    )

    val displayTitle = when {
        isCancelled -> if (statusLower == "failed" || statusLower == "payment_failed") "⚠️ Pengiriman Gagal" else "⚠️ Pengiriman Dibatalkan"
        isDelivered -> "✅ Pengiriman Selesai"
        else -> title
    }
    
    val statusColor = when {
        isCancelled -> Error
        isDelivered -> Color(0xFF22C55E)
        else -> LcGreen
    }
    
    val iconVector = when {
        isCancelled -> Icons.Default.Warning
        isDelivered -> Icons.Default.CheckCircle
        else -> Icons.Default.Navigation
    }
    
    val ctaText = when {
        isCancelled -> "Detail ➔"
        isDelivered -> "Detail ➔"
        else -> "Lacak"
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(17.dp))
                    .background(statusColor.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(iconVector, contentDescription = null, tint = statusColor)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(displayTitle, color = Ink, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp, fontSize = 17.sp)
                Text(
                    subtitle,
                    color = Muted,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(status.replace("_", " ").uppercase(), color = statusColor, fontWeight = FontWeight.Bold, fontSize = 11.sp)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(ctaText, color = statusColor, fontWeight = FontWeight.ExtraBold)
                if (canOpenChat) {
                    Spacer(Modifier.height(8.dp))
                    Surface(
                        modifier = Modifier.clickable { onChatClick() },
                        color = Color.White,
                        shape = RoundedCornerShape(999.dp),
                        border = BorderStroke(1.dp, LcGreen.copy(alpha = 0.24f))
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.ChatBubbleOutline, contentDescription = null, tint = LcGreen, modifier = Modifier.size(15.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Chat", color = LcGreen, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                            if (hasUnreadMessage) {
                                Spacer(Modifier.width(5.dp))
                                UnreadDot()
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun IncomingPackagesSection(
    packages: List<Order>,
    hasUnreadMessage: Boolean,
    onTrackingClick: (String) -> Unit,
    onChatClick: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Paket Masuk", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp)
                Text("Pantau paket yang dikirim ke nomor akun ini.", color = Muted, fontSize = 13.sp)
            }
            if (hasUnreadMessage) {
                UnreadDot(modifier = Modifier.padding(end = 8.dp))
            }
            Surface(
                color = MaterialTheme.colorScheme.secondaryContainer,
                shape = RoundedCornerShape(999.dp),
                border = BorderStroke(1.dp, LcGreen.copy(alpha = 0.18f))
            ) {
                Text(
                    text = "${packages.size}",
                    color = LcGreen,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.dp)
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            packages.take(3).forEach { order ->
                IncomingPackageCard(
                    order = order,
                    hasUnreadMessage = hasUnreadMessage,
                    onTrackingClick = { onTrackingClick(order.orderId) },
                    onChatClick = { onChatClick(order.orderId) }
                )
            }
        }
    }
}

@Composable
private fun IncomingPackageCard(
    order: Order,
    hasUnreadMessage: Boolean,
    onTrackingClick: () -> Unit,
    onChatClick: () -> Unit
) {
    val normalizedStatus = order.status.lowercase()
    val isCancelled = normalizedStatus in setOf("cancelled", "canceled", "failed", "rejected", "payment_failed") || normalizedStatus.contains("cancel")
    val isDelivered = normalizedStatus in setOf("delivered", "completed", "arrived")
    val canOpenChat = !isCancelled && !isDelivered && normalizedStatus in setOf(
        "picked_up",
        "in_transit",
        "delivering",
        "delivered",
        "completed"
    )
    val statusColor = when {
        isCancelled -> Error
        isDelivered -> Color(0xFF22C55E)
        else -> LcGreen
    }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onTrackingClick() },
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, SurfaceLine),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(statusColor.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(if (isCancelled) Icons.Default.Warning else Icons.Default.LocalShipping, contentDescription = null, tint = statusColor)
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        text = order.dropAddress.ifBlank { "Tujuan pengiriman" },
                        color = Ink,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = (-0.5).sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = order.courierName?.takeIf { it.isNotBlank() } ?: "Menunggu proses pengiriman",
                        color = Muted,
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Text(
                    text = order.status.replace("_", " ").uppercase(),
                    color = statusColor,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            }
            Spacer(Modifier.height(13.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onTrackingClick() },
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Default.Navigation, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(17.dp))
                        Spacer(Modifier.width(7.dp))
                        Text("Pantau", color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
                    }
                }
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .clickable(enabled = canOpenChat) { onChatClick() },
                    color = if (canOpenChat) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.background,
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, if (canOpenChat) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f) else MaterialTheme.colorScheme.outline)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            Icons.Default.ChatBubbleOutline,
                            contentDescription = null,
                            tint = if (canOpenChat) LcGreen else Muted,
                            modifier = Modifier.size(17.dp)
                        )
                        Spacer(Modifier.width(7.dp))
                        Text(
                            if (canOpenChat) "Chat" else "Menunggu",
                            color = if (canOpenChat) LcGreen else Muted,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                        if (canOpenChat && hasUnreadMessage) {
                            Spacer(Modifier.width(5.dp))
                            UnreadDot()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LocationRequestCard(onBookingClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp)
            .clickable { onBookingClick() },
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 18.dp, vertical = 17.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Map, contentDescription = null, tint = LcGreen, modifier = Modifier.size(30.dp))
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("Minta lokasi penerima", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp)
                Text("Bagikan tautan agar titik tujuan lebih akurat.", color = Muted, fontSize = 13.sp, lineHeight = 18.sp)
            }
            Text("Mulai", color = LcGreen, fontWeight = FontWeight.ExtraBold)
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = LcGreen)
        }
    }
}

@Composable
private fun ServiceOverview(
    services: List<DeliveryServiceProduct>,
    onBookingClick: (String?) -> Unit,
    onHistoryClick: () -> Unit,
    onFavoritesClick: () -> Unit = {}
) {
    ServiceGridMenu(
        services = services,
        onServiceClick = { serviceCode -> onBookingClick(serviceCode) },
        onHistoryClick = onHistoryClick,
        onFavoritesClick = onFavoritesClick
    )
}

@Composable
private fun EmptyServiceCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(end = 18.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(Modifier.padding(18.dp)) {
            Text("Layanan sedang disiapkan", color = Ink, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp)
            Text("Muat ulang untuk mengambil pilihan pengiriman terbaru.", color = Muted, fontSize = 13.sp)
        }
    }
}

@Composable
private fun ServiceCard(service: DeliveryServiceProduct, onClick: () -> Unit) {
    val usesCar = service.vehicleTypes.any { it.equals("car", ignoreCase = true) || it.equals("mobil", ignoreCase = true) }
    Card(
        modifier = Modifier
            .width(232.dp)
            .height(166.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(26.dp),
        colors = CardDefaults.cardColors(containerColor = if (usesCar) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(17.dp))
                        .background(if (usesCar) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.secondaryContainer),
                    contentAlignment = Alignment.Center
                ) {
                    val icon = if (usesCar) Icons.Default.LocalShipping else Icons.Default.TwoWheeler
                    Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                }
                Spacer(Modifier.weight(1f))
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = LcGreen, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.height(14.dp))
            Text(service.name, color = Ink, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp, fontSize = 17.sp, maxLines = 1)
            Text(
                "ETA maks ${service.maxEtaMinutes.takeIf { it > 0 } ?: 120} menit",
                color = Muted,
                fontSize = 13.sp
            )
            Text(
                if (usesCar) "Mobil" else "Motor",
                color = LcGreen,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 12.sp
            )
        }
    }
}

@Composable
private fun TrustCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(Modifier.padding(18.dp)) {
            Text("Siap bantu kebutuhan harian", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp)
            Spacer(Modifier.height(12.dp))
            TrustRow(Icons.Default.LocalShipping, "Kurir on-demand", "Permintaan diteruskan ke kurir aktif terdekat.")
            TrustRow(Icons.Default.Map, "Tracking transparan", "Pantau posisi, timeline, chat, dan bukti pengiriman.")
            TrustRow(Icons.Default.VerifiedUser, "Bukti pickup & terima", "Foto dan status tersimpan untuk audit pengiriman.")
            TrustRow(Icons.Default.Shield, "Keamanan transaksi", "Order, pembayaran, dan log pengiriman tercatat.")
        }
    }
}

@Composable
private fun TrustRow(icon: ImageVector, title: String, body: String) {
    Row(Modifier.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(17.dp))
                .background(MaterialTheme.colorScheme.secondaryContainer),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = Ink, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp, fontSize = 15.sp)
            Text(body, color = Muted, fontSize = 13.sp, lineHeight = 18.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Muted, modifier = Modifier.size(18.dp))
    }
}

// A4: global banner (pengumuman in-app platform-wide dari super_admin).
// Tampil sebagai LazyRow kartu, prioritas tertinggi dulu (sudah diurutkan VM).
@Composable
private fun GlobalBannerCard(
    banners: List<com.tembus.customer.data.model.GlobalBanner>,
    onBannerClick: (String) -> Unit = {}
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(banners, key = { it.id }) { banner ->
            Card(
                modifier = Modifier
                    .width(300.dp)
                    .clickable(enabled = !banner.actionUrl.isNullOrBlank()) {
                        banner.actionUrl?.let { onBannerClick(it) }
                    },
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        banner.title,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        fontWeight = FontWeight.Black,
                        fontSize = 15.sp,
                        letterSpacing = (-0.4).sp
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        banner.message,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.85f),
                        fontSize = 13.sp,
                        lineHeight = 18.sp
                    )
                    if (!banner.actionLabel.isNullOrBlank()) {
                        Spacer(Modifier.height(10.dp))
                        Text(
                            banner.actionLabel,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp
                        )
                    }
                }
            }
        }
    }
}



