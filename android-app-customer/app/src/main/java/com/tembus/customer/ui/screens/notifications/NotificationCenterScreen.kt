package com.tembus.customer.ui.screens.notifications

import android.net.Uri
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.NotificationData
import com.tembus.customer.ui.theme.Background
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryDark
import com.tembus.customer.ui.theme.PrimaryLight
import com.tembus.customer.ui.theme.Secondary
import com.tembus.customer.ui.theme.SecondaryLight

private val PromoOrange = Color(0xFFF97316) // palet TEMBUS 2026

private data class NotificationCategoryTab(
    val key: String?,
    val label: String,
    val icon: ImageVector
)

private val notificationTabs = listOf(
    NotificationCategoryTab(null, "Semua", Icons.Default.NotificationsActive),
    NotificationCategoryTab("message", "Inbox", Icons.Default.Inbox),
    NotificationCategoryTab("promo", "Promo", Icons.Default.LocalOffer),
    NotificationCategoryTab("support", "Bantuan", Icons.Default.SupportAgent),
    NotificationCategoryTab("activity", "Aktivitas", Icons.Default.Campaign)
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationCenterScreen(
    viewModel: NotificationCenterViewModel = hiltViewModel(),
    onBackClick: () -> Unit,
    onOpenChat: (String) -> Unit,
    onOpenOrder: (String) -> Unit,
    onOpenPromo: (String?) -> Unit,
    onOpenSupport: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        containerColor = Background,
        topBar = {
            TopAppBar(
                title = {
                    Text("Notifikasi", fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp, color = OnSurface)
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali", tint = OnSurface)
                    }
                },
                actions = {
                    TextButton(onClick = viewModel::markAllRead) {
                        Icon(Icons.Default.DoneAll, contentDescription = null, tint = Primary, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Baca", color = Primary, fontWeight = FontWeight.ExtraBold)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            NotificationCategoryTabs(
                selectedCategory = state.selectedCategory,
                unreadByCategory = state.unreadCount.byCategory,
                onSelect = viewModel::selectCategory
            )

            when {
                state.error != null && state.notifications.isEmpty() -> {
                    NotificationErrorState(
                        message = state.error.orEmpty(),
                        onRetry = viewModel::refresh
                    )
                }

                state.isLoading && state.notifications.isEmpty() -> {
                    NotificationLoadingState()
                }

                state.notifications.isEmpty() -> {
                    NotificationEmptyState(
                        selectedCategory = state.selectedCategory,
                        onPromoClick = { onOpenPromo(null) },
                        onSupportClick = onOpenSupport
                    )
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 18.dp, top = 24.dp, end = 18.dp, bottom = 14.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(state.notifications, key = { it.id }) { notification ->
                            NotificationRow(
                                notification = notification,
                                onClick = {
                                    viewModel.markRead(notification)
                                    when {
                                        notification.category == "message" && !notification.order_id.isNullOrBlank() -> onOpenChat(notification.order_id)
                                        !notification.order_id.isNullOrBlank() -> onOpenOrder(notification.order_id)
                                        notification.category == "promo" -> onOpenPromo(notification.promoCodeFromDeepLink())
                                        notification.category == "support" -> onOpenSupport()
                                    }
                                },
                                onArchive = { viewModel.archive(notification) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationCategoryTabs(
    selectedCategory: String?,
    unreadByCategory: Map<String, Int>,
    onSelect: (String?) -> Unit
) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(vertical = 12.dp),
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(notificationTabs) { tab ->
            val selected = tab.key == selectedCategory
            val unread = if (tab.key == null) unreadByCategory.values.sum() else unreadByCategory[tab.key].orZero()
            Surface(
                onClick = { onSelect(tab.key) },
                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(100.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(tab.icon, contentDescription = null, tint = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(tab.label, color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                    if (unread > 0) {
                        Spacer(Modifier.width(6.dp))
                        Box(
                            modifier = Modifier
                                .height(18.dp)
                                .padding(horizontal = 5.dp)
                                .clip(RoundedCornerShape(9.dp))
                                .background(if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(unread.coerceAtMost(99).toString(), color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onPrimary, fontSize = 9.sp, fontWeight = FontWeight.Black)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(
    notification: NotificationData,
    onClick: () -> Unit,
    onArchive: () -> Unit
) {
    val accent = when (notification.category) {
        "message" -> Secondary
        "promo" -> PromoOrange
        "support" -> Primary
        else -> PrimaryDark
    }
    val icon = when (notification.category) {
        "message" -> Icons.Default.Inbox
        "promo" -> Icons.Default.LocalOffer
        "support" -> Icons.Default.SupportAgent
        else -> Icons.Default.NotificationsActive
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, if (notification.isRead) Outline else accent.copy(alpha = 0.34f)),
        elevation = CardDefaults.cardElevation(defaultElevation = if (notification.isRead) 1.dp else 3.dp)
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(accent.copy(alpha = 0.1f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(icon, contentDescription = null, tint = accent)
                }
                Spacer(Modifier.width(13.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            notification.title,
                            color = OnSurface,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.ExtraBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        if (!notification.isRead) {
                            Box(
                                modifier = Modifier
                                    .size(9.dp)
                                    .clip(CircleShape)
                                    .background(accent)
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        notification.body,
                        color = OnSurfaceVariant,
                        fontSize = 13.sp,
                        lineHeight = 18.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Spacer(Modifier.width(8.dp))
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
            }
            Spacer(Modifier.height(12.dp))
            HorizontalDivider(color = Outline)
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                NotificationPill(label = notification.category.displayCategory(), color = accent)
                Spacer(Modifier.width(8.dp))
                if (notification.category == "message") {
                    NotificationPill(label = "Chat", color = Secondary, icon = Icons.Default.ChatBubbleOutline)
                    Spacer(Modifier.width(8.dp))
                }
                Text(formatNotificationDate(notification.createdAt), color = OnSurfaceVariant, fontSize = 11.sp)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onArchive, modifier = Modifier.size(34.dp)) {
                    Icon(Icons.Default.DeleteOutline, contentDescription = "Arsipkan", tint = OnSurfaceVariant, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}

@Composable
private fun NotificationPill(label: String, color: Color, icon: ImageVector? = null) {
    Surface(
        color = color.copy(alpha = 0.1f),
        shape = RoundedCornerShape(999.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(13.dp))
                Spacer(Modifier.width(4.dp))
            }
            Text(label, color = color, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun NotificationLoadingState() {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(5) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(104.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
            )
        }
    }
}

@Composable
private fun NotificationEmptyState(
    selectedCategory: String?,
    onPromoClick: () -> Unit,
    onSupportClick: () -> Unit
) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                Icons.Default.NotificationsOff,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.size(80.dp)
            )
            Spacer(Modifier.height(32.dp))
            Text(
                text = "TIDAK ADA NOTIFIKASI",
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = (-0.5).sp
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = when (selectedCategory) {
                    "promo" -> "Belum ada promo yang tersedia saat ini.\nNyalakan preferensi marketing untuk update."
                    "support" -> "Kotak masuk bantuan masih kosong.\nRiwayat percakapanmu akan muncul di sini."
                    else -> "Belum ada pesan masuk atau update pesanan.\nSemuanya masih tenang."
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 15.sp,
                lineHeight = 24.sp,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
            if (selectedCategory == "promo" || selectedCategory == "support") {
                Spacer(Modifier.height(24.dp))
                Button(
                    onClick = if (selectedCategory == "support") onSupportClick else onPromoClick,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                    shape = RoundedCornerShape(100.dp),
                    modifier = Modifier.height(48.dp)
                ) {
                    Text(if (selectedCategory == "support") "Pusat Bantuan" else "Lihat Promo", fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.onPrimary)
                }
            }
        }
    }
}

@Composable
private fun NotificationErrorState(message: String, onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Notifikasi belum tersinkron", color = OnSurface, fontWeight = FontWeight.Black, fontSize = 20.sp)
            Spacer(Modifier.height(6.dp))
            Text(message, color = OnSurfaceVariant, fontSize = 13.sp)
            Spacer(Modifier.height(16.dp))
            Button(onClick = onRetry, colors = ButtonDefaults.buttonColors(containerColor = Primary)) {
                Text("Coba Lagi", fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

private fun Int?.orZero(): Int = this ?: 0

private fun String.displayCategory(): String = when (this) {
    "message" -> "Inbox"
    "promo" -> "Promo"
    "support" -> "Bantuan"
    "system" -> "Sistem"
    else -> "Aktivitas"
}

private fun formatNotificationDate(value: String): String {
    if (value.length < 10) return value
    val date = value.substring(0, 10)
    val time = value.substringAfter('T', "").take(5)
    return if (time.isBlank()) date else "$date $time"
}

private fun NotificationData.promoCodeFromDeepLink(): String? {
    val link = deepLink.orEmpty()
    return runCatching { Uri.parse(link).getQueryParameter("promo") }
        .getOrNull()
        ?.trim()
        ?.takeIf { it.isNotBlank() }
}
