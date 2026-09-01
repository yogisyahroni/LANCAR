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
import androidx.compose.material.icons.filled.Language
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
import com.tembus.merchant.ui.localization.MerchantText as Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.R
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.PrimarySoft

/**
 * Native port of the ZIP StoreProfile screen.
 * Presentation follows the ZIP hierarchy; all displayed merchant values come from the API.
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
    onOpenOrderHistory: () -> Unit,
    onOpenLanguage: () -> Unit,
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
            StoreProfileZipTopBar(onOpenNotifications)
            when {
            state.isLoading -> LoadingProfile()
            state.needsRegistration -> RegistrationRequired(onGoToRegistration)
            state.merchant == null -> ProfileUnavailable(
                message = state.errorMessage ?: stringResource(R.string.merchant_profile_unavailable),
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
                onOpenLanguage = onOpenLanguage,
                onLogout = viewModel::logout
            )
            }
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
        Text(stringResource(R.string.merchant_store_profile), modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
        IconButton(onClick = onOpenNotifications) {
            Icon(Icons.Filled.Notifications, contentDescription = stringResource(R.string.merchant_notifications))
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
    onOpenLanguage: () -> Unit,
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
                title = stringResource(R.string.merchant_order_history),
                subtitle = stringResource(R.string.merchant_order_history_subtitle),
                onClick = onOpenOrderHistory
            )
        }
        item {
            StoreProfileOption(
                icon = Icons.Filled.Store,
                title = stringResource(R.string.merchant_store_information),
                subtitle = stringResource(R.string.merchant_store_information_subtitle),
                onClick = onOpenStoreInformation
            )
        }
        item {
            StoreProfileOption(
                icon = Icons.Filled.Schedule,
                title = stringResource(R.string.merchant_operating_hours),
                subtitle = stringResource(R.string.merchant_operating_hours_subtitle),
                onClick = onOpenOperatingHours
            )
        }
        item {
            StoreProfileOption(
                icon = Icons.Filled.AccountBalanceWallet,
                title = stringResource(R.string.merchant_payment_settings),
                subtitle = stringResource(R.string.merchant_payment_settings_subtitle),
                onClick = onOpenPaymentSettings
            )
        }
        item {
            StoreProfileOption(
                icon = Icons.Filled.Notifications,
                title = stringResource(R.string.merchant_notifications),
                subtitle = stringResource(R.string.merchant_notifications_subtitle),
                onClick = onOpenNotifications
            )
        }
        item {
            StoreProfileOption(
                icon = Icons.Filled.Language,
                title = stringResource(R.string.merchant_language),
                subtitle = stringResource(R.string.merchant_language_description),
                onClick = onOpenLanguage
            )
        }
        item {
            TextButton(
                onClick = onLogout,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.merchant_log_out), color = MaterialTheme.colorScheme.error)
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
                merchant.namaToko.ifBlank { stringResource(R.string.merchant_store_name_unavailable) },
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
                    if (merchant.ratingCount > 0) stringResource(R.string.merchant_reviews_count, merchant.ratingCount) else stringResource(R.string.merchant_no_reviews),
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
                Text(stringResource(R.string.merchant_edit_public_profile))
            }
            androidx.compose.material3.TextButton(onClick = onOpenCustomerReviews) {
                Text(stringResource(R.string.merchant_view_customer_reviews))
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
