package com.tembus.merchant.ui.screens.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tembus.merchant.R
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.AccentPale
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimarySoft
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import java.time.Instant

private val ProfileBackground = Color(0xFFF2FCF3)

/**
 * Profile hub following the Figma frame `TEMBUS Merchant - Akun & Profil Toko`.
 * The Figma frame is configured at 20% opacity in the editor; the app deliberately
 * uses opaque fills so the production screen is not dimmed.
 */
@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun StoreProfileZipScreen(
    onOpenNotifications: () -> Unit,
    onOpenStoreInformation: () -> Unit,
    onOpenOperatingHours: () -> Unit,
    onOpenPaymentSettings: () -> Unit,
    onOpenEditPublicProfile: () -> Unit,
    onOpenCustomerReviews: () -> Unit,
    onOpenEnforcement: () -> Unit,
    onOpenOrderHistory: () -> Unit,
    onOpenLanguage: () -> Unit,
    onOpenStaff: () -> Unit,
    onOpenIntegrations: () -> Unit,
    onGoToRegistration: () -> Unit,
    viewModel: ProfileViewModel = appViewModel {
        ProfileViewModel(it.merchantRepository, it.authRepository, it.sessionManager)
    }
) {
    val state by viewModel.uiState.collectAsState()

    PullToRefreshBox(
        isRefreshing = state.isLoading && state.merchant != null,
        onRefresh = viewModel::load,
        modifier = Modifier.fillMaxSize()
    ) {
        Column(Modifier.fillMaxSize().background(ProfileBackground)) {
            ProfileTopBar(onOpenNotifications)
            when {
                state.isLoading -> LoadingProfile()
                state.needsRegistration -> RegistrationRequired(onGoToRegistration)
                state.merchant == null -> ProfileUnavailable(
                    message = state.errorMessage ?: stringResource(R.string.merchant_profile_unavailable),
                    onRetry = viewModel::load
                )
                else -> ProfileContent(
                    merchant = state.merchant!!,
                    isSavingOperational = state.isSavingOperational,
                    operationalError = state.operationalError,
                    onToggleOpen = viewModel::toggleOpen,
                    onToggleAutoAccept = viewModel::setAutoAcceptOrders,
                    onSetBusy = viewModel::setBusy,
                    onClearBusy = viewModel::clearBusy,
                    onClearOperationalError = viewModel::clearOperationalError,
                    onOpenStoreInformation = onOpenStoreInformation,
                    onOpenOperatingHours = onOpenOperatingHours,
                    onOpenPaymentSettings = onOpenPaymentSettings,
                    onOpenEditPublicProfile = onOpenEditPublicProfile,
                    onOpenCustomerReviews = onOpenCustomerReviews,
                    onOpenEnforcement = onOpenEnforcement,
                    onOpenOrderHistory = onOpenOrderHistory,
                    onOpenLanguage = onOpenLanguage,
                    onOpenStaff = onOpenStaff,
                    onOpenIntegrations = onOpenIntegrations,
                    onLogout = viewModel::logout
                )
            }
        }
    }
}

@Composable
private fun ProfileTopBar(onOpenNotifications: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(modifier = Modifier.size(34.dp), shape = CircleShape, color = Primary) {
            Icon(Icons.Filled.Storefront, contentDescription = null, tint = Color.White, modifier = Modifier.padding(8.dp))
        }
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f)) {
            Text("MERCHANT PORTAL", style = MaterialTheme.typography.labelSmall, color = Primary, fontWeight = FontWeight.Bold)
            Text("Akun", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, lineHeight = MaterialTheme.typography.titleMedium.lineHeight)
        }
        IconButton(onClick = onOpenNotifications, modifier = Modifier.size(40.dp)) {
            Icon(Icons.Filled.Notifications, contentDescription = stringResource(R.string.merchant_notifications), tint = MaterialTheme.colorScheme.onSurface)
        }
        Surface(modifier = Modifier.size(34.dp), shape = CircleShape, color = Primary) {
            Icon(Icons.Filled.Person, contentDescription = "Profil pemilik", tint = Color.White, modifier = Modifier.padding(8.dp))
        }
    }
}

@Composable
private fun ProfileContent(
    merchant: Merchant,
    isSavingOperational: Boolean,
    operationalError: String?,
    onToggleOpen: () -> Unit,
    onToggleAutoAccept: (Boolean) -> Unit,
    onSetBusy: (Int, Int) -> Unit,
    onClearBusy: () -> Unit,
    onClearOperationalError: () -> Unit,
    onOpenStoreInformation: () -> Unit,
    onOpenOperatingHours: () -> Unit,
    onOpenPaymentSettings: () -> Unit,
    onOpenEditPublicProfile: () -> Unit,
    onOpenCustomerReviews: () -> Unit,
    onOpenEnforcement: () -> Unit,
    onOpenOrderHistory: () -> Unit,
    onOpenLanguage: () -> Unit,
    onOpenStaff: () -> Unit,
    onOpenIntegrations: () -> Unit,
    onLogout: () -> Unit
) {
    var showBusyDurationDialog by rememberSaveable { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 2.dp, bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(11.dp)
    ) {
        item { ProfileIdentityCard(merchant, onToggleOpen, onOpenEditPublicProfile, onOpenCustomerReviews) }
        item {
            ProfileOperationalCard(
                merchant = merchant,
                isSaving = isSavingOperational,
                onOpenOperatingHours = onOpenOperatingHours,
                onToggleAutoAccept = onToggleAutoAccept,
                onToggleBusy = { enabled -> if (enabled) showBusyDurationDialog = true else onClearBusy() },
                onOpenStoreInformation = onOpenStoreInformation
            )
        }
        operationalError?.let { message ->
            item {
                Surface(color = AccentPale, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(start = 12.dp, end = 4.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(message, color = Accent, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        TextButton(onClick = onClearOperationalError) { Text("Tutup", color = Accent) }
                    }
                }
            }
        }
        item {
            ProfileSection("Informasi usaha") {
                ProfileRow(Icons.Filled.Storefront, "Informasi toko", merchant.alamat.ifBlank { "Lengkapi alamat dan informasi toko" }, onOpenStoreInformation)
                ProfileRow(Icons.Filled.Schedule, "Jam operasional", operatingHoursLabel(merchant), onOpenOperatingHours)
                ProfileRow(Icons.Filled.Business, "Status usaha", businessTypeLabel(merchant), onOpenStoreInformation)
            }
        }
        item {
            ProfileSection("Akses dan perangkat") {
                if (merchant.isCorporate) {
                    ProfileRow(Icons.Filled.People, "Kelola staf", "Undang staf dan atur tanggung jawab", onOpenStaff)
                    ProfileRow(Icons.Filled.Security, "Hak akses staf", "Atur izin sesuai peran staf", onOpenStaff)
                } else {
                    ProfileInfoRow(
                        title = "Akun perorangan",
                        body = "Akun ini menggunakan satu akses pemilik. Kelola staf tersedia untuk merchant bisnis atau PT."
                    )
                }
                ProfileRow(Icons.Filled.Print, "Perangkat dan integrasi", "Printer struk atau POS dapur", onOpenIntegrations)
            }
        }
        item {
            ProfileSection("Pembayaran dan bantuan") {
                ProfileRow(Icons.Filled.AccountBalanceWallet, "Pembayaran dan pencairan", "Rekening dan jadwal pencairan", onOpenPaymentSettings)
                ProfileRow(Icons.Filled.History, "Riwayat pesanan", "Lihat pesanan yang sudah selesai", onOpenOrderHistory)
                ProfileRow(Icons.Filled.Language, "Bahasa aplikasi", "Bahasa Indonesia", onOpenLanguage)
                ProfileRow(Icons.Filled.Security, "Status kebijakan toko", "Lihat status peninjauan toko", onOpenEnforcement)
            }
        }
        item {
            TextButton(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Logout, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                Spacer(Modifier.size(6.dp))
                Text(stringResource(R.string.merchant_log_out), color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (showBusyDurationDialog) {
        BusyDurationDialog(
            onDismiss = { showBusyDurationDialog = false },
            onConfirm = { duration ->
                showBusyDurationDialog = false
                onSetBusy(duration, 15)
            }
        )
    }
}

@Composable
private fun ProfileIdentityCard(
    merchant: Merchant,
    onToggleOpen: () -> Unit,
    onOpenEditPublicProfile: () -> Unit,
    onOpenCustomerReviews: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(18.dp)
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(modifier = Modifier.size(54.dp), shape = CircleShape, color = Primary) {
                    Text(
                        merchant.namaToko.trim().firstOrNull()?.uppercase() ?: "T",
                        color = Color.White,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(14.dp)
                    )
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(businessTypeLabel(merchant), style = MaterialTheme.typography.labelSmall, color = Primary, fontWeight = FontWeight.Bold)
                    Text(merchant.namaToko.ifBlank { stringResource(R.string.merchant_store_name_unavailable) }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(merchant.alamat.ifBlank { "Alamat toko belum diisi" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Icon(Icons.Filled.Link, contentDescription = null, tint = Primary, modifier = Modifier.size(20.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(modifier = Modifier.size(30.dp), shape = CircleShape, color = PrimarySoft) {
                    Icon(Icons.Filled.Business, contentDescription = null, tint = Primary, modifier = Modifier.padding(7.dp))
                }
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text("Pemilik utama", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                    Text(merchant.ownerEmail.ifBlank { "Akun pemilik tersambung" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                StoreStatusPill(merchant.isOpen, onToggleOpen)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                ProfileMetric("★ ${ratingValue(merchant)}", ratingSubtitle(merchant), Modifier.weight(1f))
                ProfileMetric("${completionValue(merchant)}%", "Pesanan selesai", Modifier.weight(1f))
                ProfileMetric(if (merchant.isCorporate) "Bisnis" else "Pribadi", "Jenis usaha", Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onOpenEditPublicProfile,
                    modifier = Modifier.weight(1f).height(42.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = Color.White),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.Filled.Edit, contentDescription = null, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(5.dp))
                    Text("Ubah profil", style = MaterialTheme.typography.labelLarge)
                }
                OutlinedButton(
                    onClick = onOpenCustomerReviews,
                    modifier = Modifier.weight(1f).height(42.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.Filled.Star, contentDescription = null, tint = Color(0xFFF97316), modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(5.dp))
                    Text(ratingActionLabel(merchant), style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

@Composable
private fun StoreStatusPill(isOpen: Boolean, onToggleOpen: () -> Unit) {
    Surface(
        color = if (isOpen) PrimarySoft else MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(50),
        modifier = Modifier.clickable(onClick = onToggleOpen)
    ) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(7.dp).background(if (isOpen) Primary else MaterialTheme.colorScheme.outline, CircleShape))
            Spacer(Modifier.width(5.dp))
            Text(if (isOpen) "BUKA" else "TUTUP", color = if (isOpen) Primary else MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ProfileMetric(value: String, label: String, modifier: Modifier) {
    Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(8.dp), modifier = modifier) {
        Column(Modifier.padding(horizontal = 7.dp, vertical = 7.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun ProfileOperationalCard(
    merchant: Merchant,
    isSaving: Boolean,
    onOpenOperatingHours: () -> Unit,
    onToggleAutoAccept: (Boolean) -> Unit,
    onToggleBusy: (Boolean) -> Unit,
    onOpenStoreInformation: () -> Unit
) {
    val isBusy = merchant.busyUntil?.let { runCatching { Instant.parse(it).isAfter(Instant.now()) }.getOrDefault(false) } == true
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(18.dp)
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Storefront, contentDescription = null, tint = Primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(7.dp))
                Text("Operasional resto", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text("Diperbarui otomatis", style = MaterialTheme.typography.labelSmall, color = Primary)
            }
            OperationalRow(
                icon = Icons.Filled.Schedule,
                title = "Jam operasional",
                subtitle = operatingHoursLabel(merchant),
                trailing = if (merchant.isOpen) "Buka sekarang" else "Tutup",
                onClick = onOpenOperatingHours
            )
            OperationalSwitchRow(
                icon = Icons.Filled.Security,
                title = "Konfirmasi otomatis",
                subtitle = if (merchant.isOpen) "Pesanan langsung masuk di dapur" else "Buka toko terlebih dahulu",
                checked = merchant.autoAcceptOrders,
                enabled = merchant.isOpen && !isSaving,
                onCheckedChange = onToggleAutoAccept
            )
            OperationalSwitchRow(
                icon = Icons.Filled.Schedule,
                title = "Mode sibuk",
                subtitle = if (isBusy) "Pesanan tetap masuk dengan waktu tambahan" else "Jeda pesanan saat antrean penuh",
                checked = isBusy,
                enabled = merchant.isOpen && !isSaving,
                onCheckedChange = onToggleBusy
            )
            OperationalRow(
                icon = Icons.Filled.Storefront,
                title = "Lokasi dan titik jemput kurir",
                subtitle = merchant.alamat.ifBlank { "Lokasi toko belum diatur" },
                trailing = null,
                onClick = onOpenStoreInformation
            )
        }
    }
}

@Composable
private fun OperationalRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    trailing: String?,
    onClick: () -> Unit
) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(modifier = Modifier.size(32.dp), shape = CircleShape, color = PrimarySoft) {
            Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.padding(7.dp))
        }
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        trailing?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = Primary, fontWeight = FontWeight.Bold) }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = title, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun OperationalSwitchRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Surface(modifier = Modifier.size(32.dp), shape = CircleShape, color = PrimarySoft) {
            Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.padding(7.dp))
        }
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled,
            colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = Primary)
        )
    }
}

@Composable
private fun BusyDurationDialog(onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    val options = remember { listOf(30, 60, 120, 180) }
    var selected by rememberSaveable { mutableIntStateOf(options.first()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Mode sibuk") },
        text = {
            Column {
                Text("Toko tetap menerima pesanan dengan waktu persiapan tambahan.", style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(8.dp))
                options.forEach { minutes ->
                    Row(Modifier.fillMaxWidth().clickable { selected = minutes }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = selected == minutes, onClick = { selected = minutes })
                        Text("${minutes} menit")
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(selected) }) { Text("Aktifkan", color = Primary) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Batal") } }
    )
}

@Composable
private fun ProfileSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            shape = RoundedCornerShape(14.dp),
            content = { Column(content = content) }
        )
    }
}

@Composable
private fun ProfileRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(modifier = Modifier.size(34.dp), shape = CircleShape, color = PrimarySoft) {
            Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.padding(8.dp))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = title, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun ProfileInfoRow(title: String, body: String) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.Top) {
        Surface(modifier = Modifier.size(34.dp), shape = CircleShape, color = PrimarySoft) {
            Icon(Icons.Filled.Business, contentDescription = null, tint = Primary, modifier = Modifier.padding(8.dp))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
            Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun businessTypeLabel(merchant: Merchant): String = when (merchant.businessType.lowercase()) {
    "perusahaan", "business", "pt" -> "Merchant bisnis / PT"
    else -> "Merchant perorangan"
}

private fun operatingHoursLabel(merchant: Merchant): String = when {
    merchant.jamBuka.isNullOrBlank() || merchant.jamTutup.isNullOrBlank() -> "Jam operasional belum diatur"
    else -> "Setiap hari • ${merchant.jamBuka} – ${merchant.jamTutup} WIB"
}

private fun ratingValue(merchant: Merchant): String = if (merchant.ratingCount > 0) "%.1f".format(java.util.Locale.US, merchant.avgRating) else "—"

private fun ratingSubtitle(merchant: Merchant): String = if (merchant.ratingCount > 0) "${merchant.ratingCount} ulasan" else "Belum ada ulasan"

private fun ratingActionLabel(merchant: Merchant): String = if (merchant.ratingCount > 0) "${merchant.ratingCount} ulasan" else "Belum ada ulasan"

private fun completionValue(merchant: Merchant): String = merchant.completionRatePct.coerceIn(0.0, 100.0).let { "%.0f".format(java.util.Locale.US, it) }

@Composable
private fun LoadingProfile() {
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        CircularProgressIndicator(color = Primary)
    }
}

@Composable
private fun RegistrationRequired(onGoToRegistration: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(Icons.Filled.Storefront, contentDescription = null, tint = Primary, modifier = Modifier.size(48.dp))
        Spacer(Modifier.size(12.dp))
        Text(stringResource(R.string.merchant_profile_unavailable), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.size(16.dp))
        Button(onClick = onGoToRegistration) { Text(stringResource(R.string.merchant_register)) }
    }
}

@Composable
private fun ProfileUnavailable(message: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(Icons.Filled.Storefront, contentDescription = null, tint = Primary, modifier = Modifier.size(48.dp))
        Spacer(Modifier.size(12.dp))
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.size(12.dp))
        OutlinedButton(onClick = onRetry) { Text(stringResource(R.string.merchant_try_again)) }
    }
}
