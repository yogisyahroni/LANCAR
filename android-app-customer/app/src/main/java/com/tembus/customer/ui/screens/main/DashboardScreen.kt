package com.tembus.customer.ui.screens.main

import android.Manifest
import android.app.Activity
import android.os.Build
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.tembus.customer.R
import com.tembus.customer.data.model.Order
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
import com.tembus.customer.ui.theme.Success
import com.tembus.customer.ui.theme.TembusRadius

private val Ink @Composable get() = MaterialTheme.colorScheme.onSurface
private val Muted @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
private val LcGreen @Composable get() = MaterialTheme.colorScheme.primary
private val LcGreenDark @Composable get() = MaterialTheme.colorScheme.onPrimaryContainer
private val SoftGreen @Composable get() = MaterialTheme.colorScheme.primaryContainer
private val SoftBlue @Composable get() = MaterialTheme.colorScheme.secondaryContainer
private val SoftOrange @Composable get() = MaterialTheme.colorScheme.tertiaryContainer
private val SurfaceLine @Composable get() = MaterialTheme.colorScheme.outline

@Composable
private fun HomeStatusBarIcons() {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }
}

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
    onProfileClick: () -> Unit = {},
    onFoodClick: () -> Unit = {},
    onIncomingClick: () -> Unit = {}
) {
    HomeStatusBarIcons()

    val customerName by viewModel.customerName.collectAsState()
    val incomingPackages by viewModel.incomingPackages.collectAsState()
    val dataError by viewModel.dataError.collectAsState()
    val notificationUnreadCount by viewModel.notificationUnreadCount.collectAsState()
    val notificationUnreadByCategory by viewModel.notificationUnreadByCategory.collectAsState()
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
                    icon = { Icon(Icons.Default.LocalShipping, contentDescription = "Beranda") },
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
            Box(modifier = Modifier.fillMaxSize()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .background(LcGreen)
                )
                
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 30.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp)
                ) {
                    item {
                        GojekTopBar(
                            customerName = customerName.orEmpty().ifBlank { "Pelanggan" },
                            notificationUnreadCount = notificationUnreadCount,
                            onNotificationsClick = onNotificationsClick,
                            onProfileClick = onProfileClick
                        )
                    }

                    item {
                        WalletCard()
                    }

                    item {
                        GojekServiceGrid(
                            onPickupClick = { onBookingClick("pickup") }, // Gabung ambil/kirim
                            onFoodClick = onFoodClick,
                            onTambalBanClick = { onBookingClick("tambal_ban") },
                            onTowingClick = { onBookingClick("towing") }
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

private fun compactUnreadCount(count: Int): String = if (count > 9) "9+" else count.toString()


private fun humanOrderStatus(statusLower: String): String = when (statusLower) {
    "pending", "created", "waiting", "waiting_for_driver", "searching_driver" -> "Menunggu kurir"
    "assigned", "accepted" -> "Kurir ditugaskan"
    "picking_up" -> "Kurir menuju pickup"
    "picked_up", "in_transit", "delivering" -> "Dalam perjalanan"
    "delivered", "completed", "arrived" -> "Selesai"
    "cancelled", "canceled" -> "Dibatalkan"
    "failed", "payment_failed", "rejected" -> "Gagal"
    else -> statusLower.replace("_", " ").replaceFirstChar { it.uppercase() }
}

@Composable
private fun DashboardSectionHeader(title: String, subtitle: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Ink, fontWeight = FontWeight.Black, fontSize = 18.sp)
            Text(subtitle, color = Muted, fontSize = 12.sp)
        }
    }
}

@Composable
private fun GojekTopBar(
    customerName: String,
    notificationUnreadCount: Int,
    onNotificationsClick: () -> Unit,
    onProfileClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            modifier = Modifier.weight(1f).height(42.dp),
            shape = RoundedCornerShape(21.dp),
            color = MaterialTheme.colorScheme.surface
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(horizontal = 16.dp)
            ) {
                Icon(Icons.Default.Search, contentDescription = "Search", tint = Muted, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Cari layanan, makanan...", color = Muted, fontSize = 14.sp)
            }
        }
        Spacer(Modifier.width(12.dp))
        Box(contentAlignment = Alignment.TopEnd) {
            IconButton(
                onClick = onNotificationsClick,
                modifier = Modifier
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.18f))
            ) {
                Icon(Icons.Default.NotificationsActive, contentDescription = "Notifikasi", tint = MaterialTheme.colorScheme.onPrimary)
            }
            if (notificationUnreadCount > 0) {
                Box(
                    modifier = Modifier.size(18.dp).clip(CircleShape).background(Accent),
                    contentAlignment = Alignment.Center
                ) {
                    Text(compactUnreadCount(notificationUnreadCount), color = MaterialTheme.colorScheme.onTertiary, fontSize = 10.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        Spacer(Modifier.width(8.dp))
        IconButton(
            onClick = onProfileClick,
            modifier = Modifier
                .size(42.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.18f))
        ) {
            Icon(Icons.Default.Person, contentDescription = "Profil", tint = MaterialTheme.colorScheme.onPrimary)
        }
    }
}

@Composable
private fun WalletCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(SoftGreen),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = LcGreen)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Saldo siap dipakai", fontWeight = FontWeight.SemiBold, fontSize = 12.sp, color = Muted)
                Text("Rp50.000", fontWeight = FontWeight.Black, fontSize = 18.sp, color = Ink)
                Text("183 coins reward", color = Muted, fontSize = 12.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                WalletAction(Icons.Default.ArrowUpward, "Bayar")
                WalletAction(Icons.Default.Add, "Top Up")
                WalletAction(Icons.Default.MoreHoriz, "Lainnya")
            }
        }
    }
}

@Composable
private fun WalletAction(icon: ImageVector, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier.size(32.dp).clip(RoundedCornerShape(TembusRadius.Button)).background(LcGreen),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = label, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.height(4.dp))
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Ink)
    }
}

@Composable
private fun GojekServiceGrid(
    onPickupClick: () -> Unit,
    onFoodClick: () -> Unit,
    onTambalBanClick: () -> Unit,
    onTowingClick: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp)
    ) {
        Text("Mau apa hari ini?", color = Ink, fontWeight = FontWeight.Black, fontSize = 18.sp)
        Text("Layanan utama TEMBUS, satu tap ke pesanan.", color = Muted, fontSize = 12.sp)
        Spacer(Modifier.height(12.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            GojekServiceTile("Kirim Paket", Icons.Default.LocalShipping, MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.onPrimary, onPickupClick, modifier = Modifier.weight(1f))
            GojekServiceTile("Food", Icons.Default.Restaurant, MaterialTheme.colorScheme.tertiary, MaterialTheme.colorScheme.onTertiary, onFoodClick, modifier = Modifier.weight(1f))
            GojekServiceTile("Tambal Ban", Icons.Default.Build, MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.onPrimaryContainer, onTambalBanClick, modifier = Modifier.weight(1f))
            GojekServiceTile("Towing", Icons.Default.DirectionsCar, MaterialTheme.colorScheme.secondaryContainer, MaterialTheme.colorScheme.onSecondaryContainer, onTowingClick, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun GojekServiceTile(
    label: String,
    icon: ImageVector,
    bgColor: Color,
    iconColor: Color,
    onClick: () -> Unit,
    badge: String? = null,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.clickable { onClick() },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(bgColor),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = label, tint = iconColor, modifier = Modifier.size(28.dp))
            }
            if (badge != null) {
                Box(
                    modifier = Modifier.align(Alignment.TopEnd).size(22.dp).clip(CircleShape).background(Error),
                    contentAlignment = Alignment.Center
                ) {
                    Text(badge, color = MaterialTheme.colorScheme.onError, fontSize = 11.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
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
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
        border = BorderStroke(1.dp, Accent.copy(alpha = 0.24f))
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Warning, contentDescription = null, tint = Accent)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Data sedang disinkronkan", color = Ink, fontWeight = FontWeight.Black, fontSize = 15.sp)
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
        shape = RoundedCornerShape(TembusRadius.Card),
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
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(SoftGreen),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.NotificationsActive, contentDescription = null, tint = LcGreen)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("Aktifkan update kurir", color = Ink, fontWeight = FontWeight.Black, fontSize = 16.sp)
                Text(
                    "Dapatkan alert saat kurir diterima, 5 menit dari lokasi, dan chat baru masuk.",
                    color = Muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp
                )
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = onDismiss) {
                        Text("Nanti", color = Muted, fontWeight = FontWeight.ExtraBold)
                    }
                    androidx.compose.material3.Button(
                        onClick = onEnable,
                        colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = LcGreen, contentColor = MaterialTheme.colorScheme.onPrimary),
                        shape = RoundedCornerShape(TembusRadius.Button)
                    ) {
                        Text("Aktifkan notifikasi", fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun GlobalBannerCard(banners: List<com.tembus.customer.data.model.GlobalBanner>) {
    val banner = banners.first()
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.2f))
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(LcGreen.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.NotificationsActive, contentDescription = null, tint = LcGreen)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(banner.title, color = Ink, fontWeight = FontWeight.Black, fontSize = 15.sp)
                if (banner.message.isNotBlank()) {
                    Text(banner.message, color = Muted, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
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
    val isPending = statusLower in setOf("pending", "created", "waiting", "waiting_for_driver", "searching_driver")
    val canOpenChat = !isCancelled && !isDelivered && !isPending && statusLower in setOf(
        "assigned", "accepted", "picking_up", "picked_up", "in_transit", "delivering"
    )

    val displayTitle = when {
        isCancelled -> if (statusLower == "failed" || statusLower == "payment_failed") "Pengiriman Gagal" else "Pengiriman Dibatalkan"
        isDelivered -> "Pengiriman Selesai"
        else -> title
    }

    val statusColor = when {
        isCancelled -> Error
        isDelivered -> Success
        isPending -> Accent
        else -> LcGreen
    }

    val iconVector = when {
        isCancelled -> Icons.Default.Warning
        isDelivered -> Icons.Default.CheckCircle
        isPending -> Icons.Default.LocalShipping
        else -> Icons.Default.Navigation
    }

    val ctaText = when {
        isCancelled -> "Detail"
        isDelivered -> "Detail"
        isPending -> "Detail"
        else -> "Lacak"
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(statusColor.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(iconVector, contentDescription = null, tint = statusColor)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(displayTitle, color = Ink, fontWeight = FontWeight.Black, fontSize = 17.sp)
                Text(
                    subtitle,
                    color = Muted,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(humanOrderStatus(statusLower), color = statusColor, fontWeight = FontWeight.Bold, fontSize = 11.sp)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(ctaText, color = statusColor, fontWeight = FontWeight.ExtraBold)
                if (canOpenChat) {
                    Spacer(Modifier.height(8.dp))
                    Surface(
                        modifier = Modifier.clickable { onChatClick() },
                        color = MaterialTheme.colorScheme.surface,
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
                Text("Paket Masuk", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black)
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
    val isPending = normalizedStatus in setOf("pending", "created", "waiting", "waiting_for_driver", "searching_driver")
    val canOpenChat = !isCancelled && !isDelivered && !isPending && normalizedStatus in setOf(
        "picked_up", "in_transit", "delivering", "delivered", "completed"
    )
    val statusColor = when {
        isCancelled -> Error
        isDelivered -> Success
        isPending -> Accent
        else -> LcGreen
    }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onTrackingClick() },
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, SurfaceLine),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(statusColor.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.LocalShipping, contentDescription = null, tint = statusColor)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    order.dropAddress.ifBlank { order.pickupAddress.ifBlank { order.orderId } },
                    color = Ink,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    order.status.replace("_", " ").uppercase(),
                    color = statusColor,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            if (canOpenChat) {
                Surface(
                    modifier = Modifier.clickable { onChatClick() },
                    color = LcGreen,
                    shape = RoundedCornerShape(999.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.ChatBubbleOutline, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Chat", color = MaterialTheme.colorScheme.onPrimary, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}
