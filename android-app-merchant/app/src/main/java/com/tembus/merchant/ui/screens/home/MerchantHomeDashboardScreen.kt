package com.tembus.merchant.ui.screens.home

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.RadioButton
import coil.compose.AsyncImage
import com.tembus.merchant.data.model.MerchantOrder
import com.tembus.merchant.data.model.MerchantReview
import com.tembus.merchant.data.model.MenuItem
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.localization.MerchantTextCatalog
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.AccentPale
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.PrimarySoft
import com.tembus.merchant.ui.theme.TembusRadius
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.time.ZoneId
import java.util.Locale

private val HomeSurface = Color(0xFFFFFFFF)
private val HomeMutedSurface = Color(0xFFF7F8F6)

@androidx.compose.material3.ExperimentalMaterial3Api
@Composable
fun MerchantHomeDashboardScreen(
    onOpenOrders: () -> Unit,
    onOpenOrder: (String) -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenMenu: () -> Unit,
    onOpenSettlement: () -> Unit,
    onOpenReviews: () -> Unit,
    onOpenProfile: () -> Unit,
    viewModel: MerchantHomeViewModel = appViewModel { MerchantHomeViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    var pauseDialog by remember { mutableStateOf(false) }
    var busyDialog by remember { mutableStateOf(false) }

    PullToRefreshBox(
        isRefreshing = state.isLoading && state.merchant != null,
        onRefresh = viewModel::load,
        modifier = Modifier.fillMaxSize()
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(PrimaryPale).statusBarsPadding(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                HomeHeader(
                    merchant = state.merchant,
                    unreadNotificationCount = state.unreadNotificationCount,
                    isLoading = state.actionLoading,
                    onToggleOpen = viewModel::toggleOpen,
                    onOpenNotifications = onOpenNotifications,
                    onOpenProfile = onOpenProfile
                )
            }
            item {
                StoreControlCard(
                    merchant = state.merchant,
                    isLoading = state.actionLoading,
                    onToggleOpen = viewModel::toggleOpen,
                    onToggleAutoAccept = viewModel::toggleAutoAccept,
                    onPause = { pauseDialog = true },
                    onResume = viewModel::resume,
                    onBusy = { busyDialog = true },
                    onClearBusy = viewModel::resume
                )
            }
            state.errorMessage?.let { error ->
                item { InlineErrorCard(error, onRetry = viewModel::load) }
            }
            if (state.orders.isNotEmpty()) {
                val pendingCount = state.orders.count { it.status == "pending_merchant" }
                if (pendingCount > 0) {
                    item {
                        ConfirmationBanner(
                            count = pendingCount,
                            onOpenOrders = onOpenOrders
                        )
                    }
                }
            } else if (state.sectionErrors[HomeDataSection.ORDERS] != null) {
                item { DataUnavailableCard("Antrean pesanan", state.sectionErrors.getValue(HomeDataSection.ORDERS)) }
            }
            item {
                HomeSectionTitle("Ringkasan hari ini", null)
                SummaryGrid(state)
            }
            item {
                val activeOrders = state.orders.filter { it.status in homeActiveStatuses }
                HomeSectionTitle("Pesanan berlangsung", "${activeOrders.size} aktif", onOpenOrders)
                when {
                    state.sectionErrors[HomeDataSection.ORDERS] != null -> DataUnavailableCard("Pesanan berlangsung", state.sectionErrors.getValue(HomeDataSection.ORDERS))
                    activeOrders.isEmpty() -> EmptyPanel("Belum ada pesanan yang sedang berjalan.")
                    else -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        activeOrders.take(3).forEach { order ->
                            HomeOrderCard(order, state.menuItems, onOpenOrder, onOpenOrders)
                        }
                    }
                }
            }
            item {
                HomeSectionTitle("Peringatan ketersediaan menu", "Kelola menu", onOpenMenu)
                when {
                    state.sectionErrors[HomeDataSection.MENU] != null -> DataUnavailableCard("Ketersediaan menu", state.sectionErrors.getValue(HomeDataSection.MENU))
                    state.menuItems.isEmpty() -> EmptyPanel("Belum ada menu yang tersimpan.")
                    else -> StockWarningCard(state.menuItems, onOpenMenu)
                }
            }
            item {
                WalletCard(
                    availableIdr = state.settlement?.availableIdr,
                    bankName = state.merchant?.bankName,
                    onOpenSettlement = onOpenSettlement,
                    error = state.sectionErrors[HomeDataSection.SETTLEMENT]
                )
            }
            item {
                ReviewCard(
                    review = state.reviews.firstOrNull(),
                    rating = state.merchant?.avgRating ?: state.report?.performance?.avgRating,
                    ratingCount = state.merchant?.ratingCount ?: state.report?.performance?.ratingCount,
                    onOpenReviews = onOpenReviews,
                    error = state.sectionErrors[HomeDataSection.REVIEWS]
                )
            }
        }
    }

    if (pauseDialog) {
        DurationDialog(
            title = "Jeda pesanan",
            description = "Pesanan baru akan dijeda selama:",
            values = listOf(15, 30, 60, 180),
            confirmLabel = "Jeda sekarang",
            onDismiss = { if (!state.actionLoading) pauseDialog = false },
            onConfirm = { minutes -> pauseDialog = false; viewModel.pause(minutes) }
        )
    }
    if (busyDialog) {
        DurationDialog(
            title = "Mode sibuk",
            description = "Toko tetap menerima pesanan dengan tambahan waktu persiapan:",
            values = listOf(30, 60, 120, 180),
            confirmLabel = "Aktifkan mode sibuk",
            onDismiss = { if (!state.actionLoading) busyDialog = false },
            onConfirm = { minutes -> busyDialog = false; viewModel.busy(minutes, 15) }
        )
    }
}

private val homeActiveStatuses = setOf("pending_merchant", "preparing", "accepted", "searching", "picking_up", "picked_up", "delivering")

@Composable
private fun HomeHeader(
    merchant: Merchant?,
    unreadNotificationCount: Int,
    isLoading: Boolean,
    onToggleOpen: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenProfile: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(shape = CircleShape, color = Primary, modifier = Modifier.size(44.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    merchant?.namaToko?.trim()?.takeIf { it.isNotEmpty() }?.firstOrNull()?.uppercase() ?: "—",
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
            }
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(merchant?.namaToko?.takeIf { it.isNotBlank() } ?: "Nama toko belum tersedia", fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (merchant?.isApproved == true) {
                    Spacer(Modifier.width(4.dp))
                    Icon(Icons.Filled.Verified, contentDescription = "Terverifikasi", tint = Primary, modifier = Modifier.size(17.dp))
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(color = PrimarySoft, shape = RoundedCornerShape(50), modifier = Modifier.padding(top = 2.dp)) {
                    Text("MITRA JUARA", color = Primary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                }
                Spacer(Modifier.width(5.dp))
                Text(
                    merchant?.alamat?.substringAfterLast(',')?.trim()?.takeIf { it.isNotBlank() } ?: "Lokasi belum tersedia",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        Surface(
            color = if (merchant?.isOpen == true) PrimarySoft else HomeMutedSurface,
            shape = RoundedCornerShape(50),
            modifier = Modifier.clickable(enabled = merchant != null && !isLoading, onClick = onToggleOpen)
        ) {
            Text(
                if (merchant?.isOpen == true) "BUKA" else "TUTUP",
                color = if (merchant?.isOpen == true) Primary else MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp)
            )
        }
        Box {
            IconButton(onClick = onOpenNotifications) {
                Icon(Icons.Filled.NotificationsNone, contentDescription = MerchantTextCatalog.translate("Notifikasi"), tint = MaterialTheme.colorScheme.onSurface)
            }
            if (unreadNotificationCount > 0) {
                Surface(color = Accent, shape = CircleShape, modifier = Modifier.size(8.dp).align(Alignment.TopEnd).padding(top = 7.dp, end = 7.dp)) {}
            }
        }
        IconButton(onClick = onOpenProfile) {
            Icon(Icons.Filled.Person, contentDescription = "Akun", tint = MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun StoreControlCard(
    merchant: com.tembus.merchant.data.model.Merchant?,
    isLoading: Boolean,
    onToggleOpen: () -> Unit,
    onToggleAutoAccept: (Boolean) -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onBusy: () -> Unit,
    onClearBusy: () -> Unit
) {
    val isPaused = merchant?.pausedUntil?.let { runCatching { Instant.parse(it).isAfter(Instant.now()) }.getOrDefault(false) } == true
    val isBusy = merchant?.busyUntil?.let { runCatching { Instant.parse(it).isAfter(Instant.now()) }.getOrDefault(false) } == true
    Card(
        colors = CardDefaults.cardColors(containerColor = HomeSurface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(TembusRadius.Card)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f).padding(end = 12.dp)) {
                    Text(
                        if (merchant?.isOpen == true) "Toko sedang menerima pesanan" else "Toko tidak menerima pesanan",
                        fontWeight = FontWeight.Bold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        if (merchant?.isOpen == true) "Status tersinkron dari server" else "Aktifkan toko untuk menerima pesanan",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Switch(
                    checked = merchant?.isOpen == true,
                    onCheckedChange = { onToggleOpen() },
                    enabled = merchant != null && !isLoading,
                    colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = Primary)
                )
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = CircleShape, color = PrimarySoft, modifier = Modifier.size(42.dp)) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Storefront, contentDescription = null, tint = Primary, modifier = Modifier.size(23.dp))
                    }
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("${merchant?.namaToko?.takeIf { it.isNotBlank() } ?: "Toko"} Outlet", fontWeight = FontWeight.Bold)
                    Text(
                        if (!merchant?.jamBuka.isNullOrBlank() && !merchant?.jamTutup.isNullOrBlank()) "Jam buka: ${merchant?.jamBuka} – ${merchant?.jamTutup} WIB" else "Jam operasional belum tersedia",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Surface(color = if (merchant?.isOpen == true) PrimarySoft else HomeMutedSurface, shape = RoundedCornerShape(50)) {
                    Text(if (merchant?.isOpen == true) "BUKA" else "TUTUP", color = if (merchant?.isOpen == true) Primary else MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SettingTile(
                    title = "Terima Otomatis",
                    subtitle = "Langsung masuk",
                    checked = merchant?.autoAcceptOrders == true,
                    enabled = merchant != null && merchant.isOpen && !isLoading,
                    onCheckedChange = onToggleAutoAccept,
                    modifier = Modifier.weight(1f)
                )
                SettingTile(
                    title = "Mode sibuk",
                    subtitle = "Jeda pesanan",
                    checked = isBusy,
                    enabled = merchant != null && merchant.isOpen && !isLoading,
                    onCheckedChange = { enabled -> if (enabled) onBusy() else onClearBusy() },
                    modifier = Modifier.weight(1f)
                )
            }
            if (isPaused) {
                OutlinedButton(onClick = onResume, enabled = !isLoading, modifier = Modifier.fillMaxWidth()) { Text("Lanjutkan menerima pesanan") }
            } else {
                TextButton(onClick = onPause, enabled = merchant?.isOpen == true && !isBusy && !isLoading, modifier = Modifier.fillMaxWidth()) { Text("Jeda sementara", color = Accent) }
            }
        }
    }
}

@Composable
private fun SettingTile(
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier
) {
    Surface(color = HomeMutedSurface, shape = RoundedCornerShape(2.dp), modifier = modifier) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).padding(end = 4.dp)) {
                Text(title, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
            Box(Modifier.width(40.dp).height(32.dp), contentAlignment = Alignment.Center) {
                Switch(
                    checked = checked,
                    onCheckedChange = onCheckedChange,
                    enabled = enabled,
                    modifier = Modifier.scale(0.78f),
                    colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = Primary)
                )
            }
        }
    }
}

@Composable
private fun ConfirmationBanner(count: Int, onOpenOrders: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = AccentPale), shape = RoundedCornerShape(TembusRadius.Card)) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Accent, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("$count pesanan perlu dikonfirmasi", fontWeight = FontWeight.Bold, color = Accent)
                Text("Tinjau detail dan terima pesanan dari antrean dapur.", style = MaterialTheme.typography.bodySmall)
            }
            TextButton(onClick = onOpenOrders) { Text("Buka antrean", color = Accent) }
        }
    }
}

@Composable
private fun SummaryGrid(state: MerchantHomeUiState) {
    val report = state.report
    val rating = state.merchant?.avgRating?.takeIf { state.merchant.ratingCount > 0 }
        ?: report?.performance?.avgRating?.takeIf { report.performance.ratingCount > 0 }
    val ratingCount = state.merchant?.ratingCount ?: report?.performance?.ratingCount ?: 0
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // The current report contract exposes delivered GMV, not a net
            // payout for the selected day. Keep the label truthful until a
            // dedicated net-revenue field is added to the server contract.
            SummaryTile("Penjualan hari ini", report?.gmvIdr?.let(Format::rupiah) ?: "Belum tersedia", Modifier.weight(1f))
            SummaryTile("Pesanan selesai", report?.totalOrders?.let { "$it pesanan" } ?: "Belum tersedia", Modifier.weight(1f))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SummaryTile("Waktu masak rata-rata", report?.advanced?.avgAcceptedReadyMinutes?.let { "${String.format(Locale.US, "%.1f", it)} menit" } ?: "Belum tersedia", Modifier.weight(1f))
            SummaryTile("Rating toko", rating?.let { "${String.format(Locale.US, "%.1f", it)} ★" } ?: "Belum tersedia", Modifier.weight(1f), if (ratingCount > 0) "$ratingCount ulasan" else null)
        }
    }
}

@Composable
private fun SummaryTile(label: String, value: String, modifier: Modifier, footnote: String? = null) {
    Card(modifier = modifier, colors = CardDefaults.cardColors(containerColor = HomeSurface), shape = RoundedCornerShape(TembusRadius.Card)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            footnote?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
private fun HomeSectionTitle(title: String, action: String?, onClick: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        if (action != null && onClick != null) TextButton(onClick = onClick) { Text(action, color = Accent) }
    }
}

@Composable
private fun HomeOrderCard(order: MerchantOrder, menuItems: List<MenuItem>, onOpenOrder: (String) -> Unit, onOpenOrders: () -> Unit) {
    val first = order.items.firstOrNull()
    val menu = menuItems.firstOrNull { it.id == first?.menuItemId }
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onOpenOrder(order.id) },
        colors = CardDefaults.cardColors(containerColor = HomeSurface),
        shape = RoundedCornerShape(TembusRadius.Card),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("#${order.orderNumber}", fontWeight = FontWeight.Bold)
                    Text(order.customerName?.takeIf { it.isNotBlank() } ?: "Pelanggan belum tersedia", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                StatusBadge(order.status)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (!menu?.foto.isNullOrBlank()) {
                    AsyncImage(model = menu?.foto, contentDescription = first?.itemName, contentScale = ContentScale.Crop, modifier = Modifier.size(48.dp).clip(RoundedCornerShape(6.dp)))
                    Spacer(Modifier.width(10.dp))
                } else {
                    Surface(shape = RoundedCornerShape(6.dp), color = PrimarySoft, modifier = Modifier.size(48.dp)) {
                        Box(contentAlignment = Alignment.Center) { Icon(Icons.Filled.Restaurant, contentDescription = null, tint = Primary) }
                    }
                    Spacer(Modifier.width(10.dp))
                }
                Column(Modifier.weight(1f)) {
                    Text(first?.let { "${it.quantity}x ${it.itemName}" } ?: "Item order belum tersedia", fontWeight = FontWeight.SemiBold)
                    Text(Format.rupiah(order.totalPriceIdr), color = Primary, fontWeight = FontWeight.Bold)
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = { onOpenOrder(order.id) }) { Text("Lihat detail") }
                if (order.status == "pending_merchant") {
                    Button(onClick = onOpenOrders, colors = ButtonDefaults.buttonColors(containerColor = Accent)) { Text("Terima pesanan") }
                }
            }
        }
    }
}

@Composable
private fun StatusBadge(status: String) {
    val label = when (status) {
        "pending_merchant" -> "Baru"
        "preparing", "accepted" -> "Sedang dimasak"
        "searching", "picking_up", "picked_up", "delivering" -> "Kurir diproses"
        else -> status.ifBlank { "Status belum tersedia" }
    }
    Surface(color = PrimarySoft, shape = RoundedCornerShape(TembusRadius.Button)) {
        Text(label, color = Primary, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp))
    }
}

@Composable
private fun StockWarningCard(items: List<MenuItem>, onOpenMenu: () -> Unit) {
    val alerts = items.filter { !it.isAvailable || it.stockQuantity == 0 }.take(3)
    if (alerts.isEmpty()) {
        EmptyPanel("Tidak ada menu yang perlu diperbarui dari data stok terakhir.")
        return
    }
    Card(colors = CardDefaults.cardColors(containerColor = HomeSurface), shape = RoundedCornerShape(TembusRadius.Card)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            alerts.forEach { item ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    if (!item.foto.isNullOrBlank()) AsyncImage(model = item.foto, contentDescription = item.nama, contentScale = ContentScale.Crop, modifier = Modifier.size(40.dp).clip(RoundedCornerShape(6.dp)))
                    else Surface(shape = RoundedCornerShape(6.dp), color = HomeMutedSurface, modifier = Modifier.size(40.dp)) { Box(contentAlignment = Alignment.Center) { Icon(Icons.Filled.Inventory2, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) } }
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(item.nama.ifBlank { "Nama menu belum tersedia" }, fontWeight = FontWeight.SemiBold)
                        Text(
                            when {
                                !item.isAvailable -> "Menu tidak tersedia"
                                item.stockQuantity == 0 -> "Stok habis"
                                else -> "Ketersediaan tersimpan di server"
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    TextButton(onClick = onOpenMenu) { Text("Kelola") }
                }
            }
        }
    }
}

@Composable
private fun WalletCard(availableIdr: Long?, bankName: String?, onOpenSettlement: () -> Unit, error: String?) {
    Card(colors = CardDefaults.cardColors(containerColor = Primary), shape = RoundedCornerShape(TembusRadius.Card)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.AccountBalanceWallet, contentDescription = null, tint = Color.White)
                Spacer(Modifier.width(8.dp))
                Text("Saldo dapat ditarik", color = Color.White, modifier = Modifier.weight(1f))
                Text(bankName?.takeIf { it.isNotBlank() } ?: "Rekening belum tersedia", color = Color.White.copy(alpha = .8f), style = MaterialTheme.typography.labelSmall)
            }
            Text(availableIdr?.let(Format::rupiah) ?: "Belum tersedia", color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            error?.let { Text("Saldo belum dapat disinkronkan: $it", color = Color.White.copy(alpha = .9f), style = MaterialTheme.typography.bodySmall) }
            Button(onClick = onOpenSettlement, colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Primary)) { Text("Buka keuangan") }
        }
    }
}

@Composable
private fun ReviewCard(review: MerchantReview?, rating: Double?, ratingCount: Int?, onOpenReviews: () -> Unit, error: String?) {
    Card(colors = CardDefaults.cardColors(containerColor = HomeSurface), shape = RoundedCornerShape(TembusRadius.Card)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Ulasan terbaru pelanggan", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                TextButton(onClick = onOpenReviews) { Text("Lihat semua", color = Accent) }
            }
            if (error != null) {
                Text("Ulasan belum dapat disinkronkan: $error", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            } else if (review == null) {
                EmptyPanel("Belum ada ulasan tersimpan.")
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(shape = CircleShape, color = PrimarySoft, modifier = Modifier.size(34.dp)) { Box(contentAlignment = Alignment.Center) { Text(review.reviewerName.take(1).uppercase(), color = Primary, fontWeight = FontWeight.Bold) } }
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text(review.reviewerName, fontWeight = FontWeight.SemiBold)
                        Text("${review.stars} ★ · ${review.orderNumber}", color = Accent, style = MaterialTheme.typography.labelSmall)
                    }
                    Icon(Icons.Filled.Star, contentDescription = null, tint = Accent)
                }
                if (review.comment.isNotBlank()) Text(review.comment, style = MaterialTheme.typography.bodyMedium)
                if (review.reply == null) Text("Belum dibalas", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
            }
            if (review == null && rating != null && ratingCount != null && ratingCount > 0) {
                Text("Rating toko ${String.format(Locale.US, "%.1f", rating)} ★ dari $ratingCount ulasan", color = Primary, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun EmptyPanel(message: String) {
    Surface(color = HomeMutedSurface, shape = RoundedCornerShape(TembusRadius.Card), modifier = Modifier.fillMaxWidth()) {
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(14.dp))
    }
}

@Composable
private fun DataUnavailableCard(label: String, error: String) {
    EmptyPanel("$label belum tersedia. Coba muat ulang. ($error)")
}

@Composable
private fun InlineErrorCard(message: String, onRetry: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = AccentPale), shape = RoundedCornerShape(TembusRadius.Card)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(message, color = Accent, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            TextButton(onClick = onRetry) { Text("Coba lagi", color = Accent) }
        }
    }
}

@Composable
private fun DurationDialog(title: String, description: String, values: List<Int>, confirmLabel: String, onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    var selected by remember { mutableStateOf(values.first()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(description)
                values.forEach { value ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = selected == value, onClick = { selected = value })
                        Text("$value menit", modifier = Modifier.clickable { selected = value })
                    }
                }
            }
        },
        confirmButton = { Button(onClick = { onConfirm(selected) }) { Text(confirmLabel) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Batal") } }
    )
}
