package com.tembus.merchant.ui.screens.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Summarize
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MerchantNotificationPreferences
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.Error

/** Native port of the ZIP Notifications screen, backed by persisted preferences. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsZipScreen(
    onBack: () -> Unit,
    viewModel: NotificationsViewModel = appViewModel { NotificationsViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        containerColor = PrimaryPale,
        topBar = {
            TopAppBar(
                title = { Text("Notifications", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Go back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = PrimaryPale)
            )
        },
        bottomBar = {
            Surface(color = PrimaryPale, shadowElevation = 8.dp) {
                Button(
                    onClick = viewModel::savePreferences,
                    enabled = !state.isSaving && state.errorMessage == null,
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary)
                ) {
                    if (state.isSaving) CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White)
                    else Text("Update Preferences")
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                "Manage how you receive alerts and updates for your store operations.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            when {
                state.isLoading -> CircularProgressIndicator(modifier = Modifier.padding(32.dp), color = Primary)
                state.errorMessage != null -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(state.errorMessage!!, color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = viewModel::load) { Text("Coba Lagi") }
                }
                else -> NotificationPreferenceCard(
                    preferences = state.preferences,
                    onNewOrderAlertsChange = viewModel::setNewOrderAlerts,
                    onOrderCancellationsChange = viewModel::setOrderCancellations,
                    onDailySummaryReportsChange = viewModel::setDailySummaryReports,
                    onPromotionalUpdatesChange = viewModel::setPromotionalUpdates
                )
            }
            state.saveError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (state.saved) Text("Preferences updated.", color = Primary)
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun NotificationPreferenceCard(
    preferences: MerchantNotificationPreferences,
    onNewOrderAlertsChange: (Boolean) -> Unit,
    onOrderCancellationsChange: (Boolean) -> Unit,
    onDailySummaryReportsChange: (Boolean) -> Unit,
    onPromotionalUpdatesChange: (Boolean) -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column {
            PreferenceRow(Icons.Filled.NotificationsActive, "New Order Alerts", "Sound and push notifications for incoming orders.", Primary, preferences.newOrderAlerts, onNewOrderAlertsChange)
            Divider()
            PreferenceRow(Icons.Filled.Cancel, "Order Cancellations", "Alerts when a customer or driver cancels an order.", Error, preferences.orderCancellations, onOrderCancellationsChange)
            Divider()
            PreferenceRow(Icons.Filled.Summarize, "Daily Summary Reports", "End-of-day summary of sales and completed orders.", MaterialTheme.colorScheme.onSurfaceVariant, preferences.dailySummaryReports, onDailySummaryReportsChange)
            Divider()
            PreferenceRow(Icons.Filled.Campaign, "Promotional Updates from Tembus", "News, tips, and promotional offers to boost sales.", MaterialTheme.colorScheme.primary, preferences.promotionalUpdates, onPromotionalUpdatesChange)
        }
    }
}

@Composable
private fun PreferenceRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    description: String,
    tint: Color,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = CircleShape, color = tint.copy(alpha = 0.12f), modifier = Modifier.size(40.dp)) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.padding(8.dp))
        }
        Spacer(Modifier.size(16.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
