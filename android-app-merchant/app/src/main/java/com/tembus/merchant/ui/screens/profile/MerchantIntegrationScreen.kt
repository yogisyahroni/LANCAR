package com.tembus.merchant.ui.screens.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.PointOfSale
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SettingsInputComponent
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.MerchantPOSConnectorStatus
import com.tembus.merchant.data.model.MerchantPOSIntegrationStatus
import com.tembus.merchant.data.repository.MerchantRepository
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.PrimarySoft
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class MerchantIntegrationUiState(
    val status: MerchantPOSIntegrationStatus? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class MerchantIntegrationViewModel(private val repository: MerchantRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(MerchantIntegrationUiState())
    val uiState: StateFlow<MerchantIntegrationUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            repository.getPOSIntegrationStatus()
                .onSuccess { _uiState.value = MerchantIntegrationUiState(status = it) }
                .onFailure { _uiState.value = MerchantIntegrationUiState(errorMessage = it.message ?: "Status perangkat belum dapat dimuat") }
        }
    }
}

@Composable
fun MerchantIntegrationScreen(
    onBack: () -> Unit,
    viewModel: MerchantIntegrationViewModel = appViewModel { MerchantIntegrationViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    Column(Modifier.fillMaxSize().background(PrimaryPale)) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
            }
            Column(Modifier.weight(1f)) {
                Text("Perangkat & integrasi", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("Pantau perangkat yang membantu pesanan toko", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = viewModel::load) { Icon(Icons.Filled.Refresh, contentDescription = "Muat ulang") }
        }
        when {
            state.isLoading && state.status == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary)
            }
            state.errorMessage != null && state.status == null -> IntegrationError(state.errorMessage!!, viewModel::load)
            else -> IntegrationContent(state.status!!)
        }
    }
}

@Composable
private fun IntegrationContent(status: MerchantPOSIntegrationStatus) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item { Spacer(Modifier.size(4.dp)) }
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                shape = RoundedCornerShape(20.dp)
            ) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(Modifier.size(44.dp), CircleShape, color = PrimarySoft) {
                            Icon(Icons.Filled.SettingsInputComponent, contentDescription = null, tint = Primary, modifier = Modifier.padding(10.dp))
                        }
                        Spacer(Modifier.size(12.dp))
                        Column {
                            Text("Perangkat & POS dapur", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(
                                if (status.connectors.isEmpty()) "Belum ada perangkat yang terhubung" else "${status.connectors.size} perangkat terdaftar",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Text(
                        "Status di bawah berasal dari sistem Tembus. Perangkat hanya menerima salinan pesanan; persetujuan pesanan tetap dilakukan di aplikasi.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        if (status.connectors.isEmpty()) {
            item {
                IntegrationEmptyState(
                    title = "Belum ada integrasi",
                    body = "Saat ini toko belum memiliki printer struk atau POS yang terhubung. Pesanan tetap dapat dikelola dari aplikasi."
                )
            }
        } else {
            items(status.connectors, key = { "${it.providerCode}:${it.branchId.orEmpty()}" }) { connector -> ConnectorCard(connector) }
        }
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = PrimarySoft),
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.Top) {
                    Icon(Icons.Filled.Print, contentDescription = null, tint = Primary)
                    Spacer(Modifier.size(12.dp))
                    Column {
                        Text("Printer struk", fontWeight = FontWeight.Bold)
                        Text(
                            "Pengaturan printer akan muncul setelah perangkat terdaftar di toko.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
        item { Spacer(Modifier.size(16.dp)) }
    }
}

@Composable
private fun ConnectorCard(connector: MerchantPOSConnectorStatus) {
    val healthy = connector.enabled && connector.state.equals("healthy", ignoreCase = true)
    val title = connector.providerName.ifBlank { connector.providerCode.ifBlank { "Perangkat toko" } }
    val stateLabel = when {
        healthy -> "Terhubung"
        connector.enabled -> "Perlu diperiksa"
        else -> "Tidak aktif"
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(Modifier.size(42.dp), CircleShape, color = if (healthy) PrimarySoft else MaterialTheme.colorScheme.errorContainer) {
                    Icon(
                        if (healthy) Icons.Filled.CheckCircle else Icons.Filled.ErrorOutline,
                        contentDescription = null,
                        tint = if (healthy) Primary else MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(10.dp)
                    )
                }
                Spacer(Modifier.size(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(stateLabel, color = if (healthy) Primary else MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                }
            }
            connector.availabilityReason?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (connector.capabilities.isNotEmpty()) {
                Text("Fungsi: ${connector.capabilities.joinToString(", ")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                IntegrationMetric(Modifier.weight(1f), "Pesanan tertunda", connector.pendingOrderDeliveries.toString())
                IntegrationMetric(Modifier.weight(1f), "Perlu dicocokkan", connector.openReconciliation.toString())
            }
        }
    }
}

@Composable
private fun IntegrationMetric(modifier: Modifier, label: String, value: String) {
    Column(modifier) {
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun IntegrationEmptyState(title: String, body: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Filled.PointOfSale, contentDescription = null, tint = Primary, modifier = Modifier.size(40.dp))
            Spacer(Modifier.size(8.dp))
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun IntegrationError(message: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(Icons.Filled.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(42.dp))
        Spacer(Modifier.size(12.dp))
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.size(12.dp))
        Button(onClick = onRetry) { Text("Coba lagi") }
    }
}
