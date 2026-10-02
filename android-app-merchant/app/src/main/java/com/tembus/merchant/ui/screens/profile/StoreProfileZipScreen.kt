package com.tembus.merchant.ui.screens.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
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
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tembus.merchant.R
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.PrimarySoft
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox

/**
 * Profile hub matching the Figma information hierarchy. The five-item bottom
 * navigation remains owned by MainScreen; this screen only owns profile
 * destinations and renders merchant data returned by the API.
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
        Column(Modifier.fillMaxSize().background(PrimaryPale)) {
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
        modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(modifier = Modifier.size(42.dp), shape = CircleShape, color = Primary) {
            Icon(Icons.Filled.Storefront, contentDescription = null, tint = Color.White, modifier = Modifier.padding(10.dp))
        }
        Spacer(Modifier.size(10.dp))
        Text("Akun dan profil toko", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        IconButton(onClick = onOpenNotifications) {
            Icon(Icons.Filled.Notifications, contentDescription = stringResource(R.string.merchant_notifications), tint = Primary)
        }
    }
}

@Composable
private fun ProfileContent(
    merchant: Merchant,
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
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item { ProfileIdentityCard(merchant, onOpenEditPublicProfile, onOpenCustomerReviews) }
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
                        body = "Kelola staf tersedia untuk merchant bisnis atau PT. Akun ini menggunakan satu akses pemilik."
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
                Spacer(Modifier.size(8.dp))
                Text(stringResource(R.string.merchant_log_out), color = MaterialTheme.colorScheme.error)
            }
        }
        item { Spacer(Modifier.size(12.dp)) }
    }
}

@Composable
private fun ProfileIdentityCard(
    merchant: Merchant,
    onOpenEditPublicProfile: () -> Unit,
    onOpenCustomerReviews: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(20.dp)
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(modifier = Modifier.size(64.dp), shape = CircleShape, color = Primary) {
                    Text(
                        merchant.namaToko.trim().firstOrNull()?.uppercase() ?: "T",
                        color = Color.White,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(17.dp)
                    )
                }
                Spacer(Modifier.size(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(merchant.namaToko.ifBlank { stringResource(R.string.merchant_store_name_unavailable) }, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(businessTypeLabel(merchant), style = MaterialTheme.typography.bodyMedium, color = Primary)
                    Text(merchant.alamat.ifBlank { "Alamat toko belum diisi" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                }
                Icon(Icons.Filled.Link, contentDescription = null, tint = Primary)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = onOpenEditPublicProfile,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = Color.White),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Filled.Edit, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(6.dp))
                    Text("Ubah profil")
                }
                OutlinedButton(onClick = onOpenCustomerReviews, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp)) {
                    Icon(Icons.Filled.Star, contentDescription = null, tint = Color(0xFFF97316), modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(6.dp))
                    Text(ratingLabel(merchant))
                }
            }
        }
    }
}

@Composable
private fun ProfileSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            shape = RoundedCornerShape(16.dp),
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
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(modifier = Modifier.size(40.dp), shape = CircleShape, color = PrimarySoft) {
            Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.padding(10.dp))
        }
        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = title, tint = MaterialTheme.colorScheme.outline)
    }
}

@Composable
private fun ProfileInfoRow(title: String, body: String) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 13.dp), verticalAlignment = Alignment.Top) {
        Surface(modifier = Modifier.size(40.dp), shape = CircleShape, color = PrimarySoft) {
            Icon(Icons.Filled.Business, contentDescription = null, tint = Primary, modifier = Modifier.padding(10.dp))
        }
        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold)
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
    else -> "${merchant.jamBuka} – ${merchant.jamTutup} WIB"
}

private fun ratingLabel(merchant: Merchant): String = if (merchant.ratingCount > 0) {
    "%.1f · %d ulasan".format(java.util.Locale.US, merchant.avgRating, merchant.ratingCount)
} else {
    "Belum ada ulasan"
}

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
