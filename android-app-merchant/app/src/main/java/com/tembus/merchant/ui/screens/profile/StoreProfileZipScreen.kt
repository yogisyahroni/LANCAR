package com.tembus.merchant.ui.screens.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Store
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.PrimarySoft

/**
 * Native port of the ZIP StoreProfile screen.
 * Presentation follows the ZIP hierarchy; all displayed merchant values come from the API.
 */
@Composable
fun StoreProfileZipScreen(
    onOpenNotifications: () -> Unit,
    onOpenStoreInformation: () -> Unit,
    onOpenOperatingHours: () -> Unit,
    onOpenPaymentSettings: () -> Unit,
    onOpenEditPublicProfile: () -> Unit,
    onOpenCustomerReviews: () -> Unit,
    onOpenOrderHistory: () -> Unit,
    onGoToRegistration: () -> Unit,
    viewModel: ProfileViewModel = appViewModel {
        ProfileViewModel(it.merchantRepository, it.authRepository, it.sessionManager)
    }
) {
    val state by viewModel.uiState.collectAsState()

    Column(Modifier.fillMaxSize().background(PrimaryPale)) {
        StoreProfileZipTopBar(onOpenNotifications)
        when {
            state.isLoading -> LoadingProfile()
            state.needsRegistration -> RegistrationRequired(onGoToRegistration)
            state.merchant == null -> ProfileUnavailable(
                message = state.errorMessage ?: "Profil toko belum tersedia dari backend.",
                onRetry = viewModel::load
            )
            else -> StoreProfileZipContent(
                merchant = state.merchant!!,
                onOpenNotifications = onOpenNotifications,
                onOpenStoreInformation = onOpenStoreInformation,
                onOpenOperatingHours = onOpenOperatingHours,
                onOpenPaymentSettings = onOpenPaymentSettings,
                onOpenEditPublicProfile = onOpenEditPublicProfile,
                onOpenCustomerReviews = onOpenCustomerReviews,
                onOpenOrderHistory = onOpenOrderHistory,
                onLogout = viewModel::logout
            )
        }
    }
}

@Composable
private fun StoreProfileZipTopBar(onOpenNotifications: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(modifier = Modifier.size(32.dp), shape = CircleShape, color = PrimaryPale) {
            Icon(Icons.Filled.Storefront, contentDescription = null, tint = Primary, modifier = Modifier.padding(6.dp))
        }
        Spacer(Modifier.size(8.dp))
        Text("Store Profile", modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
        IconButton(onClick = onOpenNotifications) {
            Icon(Icons.Filled.Notifications, contentDescription = "Notifications")
        }
    }
}

@Composable
private fun StoreProfileZipContent(
    merchant: Merchant,
    onOpenNotifications: () -> Unit,
    onOpenStoreInformation: () -> Unit,
    onOpenOperatingHours: () -> Unit,
    onOpenPaymentSettings: () -> Unit,
    onOpenEditPublicProfile: () -> Unit,
    onOpenCustomerReviews: () -> Unit,
    onOpenOrderHistory: () -> Unit,
    onLogout: () -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item { Spacer(Modifier.size(8.dp)) }
        item {
            StoreIdentityCard(
                merchant = merchant,
                onOpenEditPublicProfile = onOpenEditPublicProfile,
                onOpenCustomerReviews = onOpenCustomerReviews
            )
        }
        item {
            StoreProfileOption(
                icon = Icons.Filled.History,
                title = "Order History",
                subtitle = "Completed and ended orders",
                onClick = onOpenOrderHistory
            )
        }
        item {
            StoreProfileOption(
                icon = Icons.Filled.Store,
                title = "Store Information",
                subtitle = "Address, contact, description",
                onClick = onOpenStoreInformation
            )
        }
        item {
            StoreProfileOption(
                icon = Icons.Filled.Schedule,
                title = "Operating Hours",
                subtitle = "Set open/close times & holidays",
                onClick = onOpenOperatingHours
            )
        }
        item {
            StoreProfileOption(
                icon = Icons.Filled.AccountBalanceWallet,
                title = "Payment Settings",
                subtitle = "Bank accounts & payouts",
                onClick = onOpenPaymentSettings
            )
        }
        item {
            StoreProfileOption(
                icon = Icons.Filled.Notifications,
                title = "Notifications",
                subtitle = "Order alerts & email prefs",
                onClick = onOpenNotifications
            )
        }
        item {
            TextButton(
                onClick = onLogout,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Log out", color = MaterialTheme.colorScheme.error)
            }
        }
        item { Spacer(Modifier.size(8.dp)) }
    }
}

@Composable
private fun StoreIdentityCard(
    merchant: Merchant,
    onOpenEditPublicProfile: () -> Unit,
    onOpenCustomerReviews: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Surface(
                modifier = Modifier.size(96.dp),
                shape = CircleShape,
                color = PrimaryPale
            ) {
                Icon(Icons.Filled.Storefront, contentDescription = null, tint = Primary, modifier = Modifier.padding(26.dp))
            }
            Spacer(Modifier.size(16.dp))
            Text(
                merchant.namaToko.ifBlank { "Nama toko belum tersedia" },
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.size(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Star, contentDescription = null, tint = Color(0xFFF97316), modifier = Modifier.size(20.dp))
                Spacer(Modifier.size(4.dp))
                Text(
                    if (merchant.ratingCount > 0) "%.1f".format(java.util.Locale.US, merchant.avgRating) else "-",
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.bodyLarge
                )
                Spacer(Modifier.size(8.dp))
                Text(
                    if (merchant.ratingCount > 0) "(${merchant.ratingCount} Reviews)" else "Belum ada review",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(Modifier.size(16.dp))
            Button(
                onClick = onOpenEditPublicProfile,
                colors = ButtonDefaults.buttonColors(
                    containerColor = PrimarySoft,
                    contentColor = Primary
                )
            ) {
                Text("Edit Public Profile")
            }
            androidx.compose.material3.TextButton(onClick = onOpenCustomerReviews) {
                Text("Lihat customer reviews")
            }
        }
    }
}

@Composable
private fun StoreProfileOption(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = CircleShape, color = PrimaryPale, modifier = Modifier.size(48.dp)) {
                Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.padding(12.dp))
            }
            Spacer(Modifier.size(16.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.outlineVariant)
        }
    }
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
        Text("Profil merchant belum tersedia", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.size(16.dp))
        Button(onClick = onGoToRegistration) { Text("Daftar sebagai merchant") }
    }
}

@Composable
private fun ProfileUnavailable(message: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(Icons.Filled.Storefront, contentDescription = null, tint = Primary, modifier = Modifier.size(48.dp))
        Spacer(Modifier.size(12.dp))
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.size(12.dp))
        OutlinedButton(onClick = onRetry) { Text("Coba Lagi") }
    }
}
