package com.tembus.customer.ui.screens.main

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import com.tembus.customer.ui.localization.CustomerText as Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.R
import com.tembus.customer.data.model.GlobalBanner
import com.tembus.customer.ui.localization.CustomerTextCatalog
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryDark
import com.tembus.customer.ui.components.TembusServiceIcons
import com.tembus.customer.ui.theme.TembusRadius

internal fun compactUnreadCount(count: Int): String = if (count > 9) "9+" else count.toString()

@Composable
internal fun TembusBrandMark(modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(id = R.drawable.tembus_home_logo),
        contentDescription = "TEMBUS",
        contentScale = ContentScale.Fit,
        modifier = modifier,
    )
}

@Composable
internal fun DashboardSectionHeader(title: String, subtitle: String) {
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
internal fun TembusHomeTopBar(
    customerName: String,
    notificationUnreadCount: Int,
    onNotificationsClick: () -> Unit,
    onProfileClick: () -> Unit,
    onSearchClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            modifier = Modifier
                .weight(1f)
                .height(44.dp)
                .clickable(role = Role.Button, onClick = onSearchClick)
                .semantics {
                    contentDescription = "$customerName. Cari layanan atau pesanan"
                    role = Role.Button
                },
            shape = RoundedCornerShape(22.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            shadowElevation = 2.dp
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(horizontal = 16.dp)
            ) {
                Icon(Icons.Default.Search, contentDescription = CustomerTextCatalog.translate("Search"), tint = Primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Cari layanan, makanan...", color = Muted, fontSize = 14.sp)
            }
        }
        Spacer(Modifier.width(12.dp))
        Box(contentAlignment = Alignment.TopEnd) {
            IconButton(
                onClick = onNotificationsClick,
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surface)
                    .border(BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), CircleShape)
            ) {
                Icon(Icons.Default.NotificationsActive, contentDescription = CustomerTextCatalog.translate("Notifikasi"), tint = Primary, modifier = Modifier.size(22.dp))
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
                .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.18f))
        ) {
            Icon(Icons.Default.Person, contentDescription = CustomerTextCatalog.translate("Profil"), tint = MaterialTheme.colorScheme.onPrimary)
        }
    }
}

@Composable
internal fun WalletCard() {
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
                Icon(Icons.Default.AccountBalanceWallet, contentDescription = "", tint = LcGreen)
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
internal fun WalletAction(icon: ImageVector, label: String) {
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
internal fun TembusHomeServiceGrid(
    onPickupClick: () -> Unit,
    onFoodClick: () -> Unit,
    showFood: Boolean = true,
    onAggregatorClick: () -> Unit,
    onTambalBanClick: () -> Unit,
    onTowingClick: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp)
    ) {
        Text("Mau apa hari ini?", color = Ink, fontWeight = FontWeight.Black, fontSize = 18.sp)
        Text("Layanan utama TEMBUS, satu tap ke pesanan.", color = Muted, fontSize = 12.sp)
        Spacer(Modifier.height(12.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TembusHomeServiceTile(TembusServiceIcons.PaketInstan.label, TembusServiceIcons.PaketInstan.icon, TembusHomeServiceTone.Primary, onPickupClick, modifier = Modifier.weight(1f))
            if (showFood) {
                TembusHomeServiceTile(TembusServiceIcons.Food.label, TembusServiceIcons.Food.icon, TembusHomeServiceTone.Food, onFoodClick, modifier = Modifier.weight(1f))
            }
            TembusHomeServiceTile(TembusServiceIcons.EkspedisiAntarKota.label, TembusServiceIcons.EkspedisiAntarKota.icon, TembusHomeServiceTone.Secondary, onAggregatorClick, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(14.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TembusHomeServiceTile(TembusServiceIcons.TambalBan.label, TembusServiceIcons.TambalBan.icon, TembusHomeServiceTone.Emergency, onTambalBanClick, badge = "SOS", emergency = true, modifier = Modifier.weight(1f))
            TembusHomeServiceTile(TembusServiceIcons.Towing.label, TembusServiceIcons.Towing.icon, TembusHomeServiceTone.Towing, onTowingClick, badge = "SOS", emergency = true, modifier = Modifier.weight(1f))
            Spacer(modifier = Modifier.weight(1f))
        }
    }
}

internal enum class TembusHomeServiceTone { Primary, Food, Secondary, Emergency, Towing }

@Composable
internal fun TembusHomeServiceTile(
    label: String,
    icon: ImageVector,
    tone: TembusHomeServiceTone,
    onClick: () -> Unit,
    badge: String? = null,
    emergency: Boolean = false,
    modifier: Modifier = Modifier
) {
    val (bgColor, iconColor) = when (tone) {
        TembusHomeServiceTone.Primary -> MaterialTheme.colorScheme.primary to MaterialTheme.colorScheme.onPrimary
        TembusHomeServiceTone.Food -> MaterialTheme.colorScheme.tertiary to MaterialTheme.colorScheme.onTertiary
        TembusHomeServiceTone.Secondary -> MaterialTheme.colorScheme.secondaryContainer to MaterialTheme.colorScheme.onSecondaryContainer
        TembusHomeServiceTone.Emergency -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
        TembusHomeServiceTone.Towing -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
    }
    Column(
        modifier = modifier
            .semantics {
                contentDescription = if (emergency) "$label, layanan darurat" else label
                role = Role.Button
            }
            .clickable(role = Role.Button) { onClick() },
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
internal fun DashboardDataErrorCard(
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
            Icon(Icons.Default.Warning, contentDescription = "", tint = Accent)
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
internal fun NotificationPermissionPromptCard(
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
                Icon(Icons.Default.NotificationsActive, contentDescription = "", tint = LcGreen)
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
                    Button(
                        onClick = onEnable,
                        colors = ButtonDefaults.buttonColors(containerColor = LcGreen, contentColor = MaterialTheme.colorScheme.onPrimary),
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
internal fun GlobalBannerCard(banners: List<GlobalBanner>) {
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
                Icon(Icons.Default.NotificationsActive, contentDescription = "", tint = LcGreen)
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
