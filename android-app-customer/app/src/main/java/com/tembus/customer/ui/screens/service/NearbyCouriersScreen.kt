package com.tembus.customer.ui.screens.service

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.components.CourierPriceCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NearbyCouriersScreen(
    serviceSubType: String,
    customerLat: Double,
    customerLng: Double,
    onBackClick: () -> Unit,
    onCourierSelected: (String, Long) -> Unit,
    viewModel: NearbyCouriersViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var selectedCourierId by remember { mutableStateOf<String?>(null) }
    
    androidx.compose.runtime.LaunchedEffect(serviceSubType) {
        viewModel.loadNearbyCouriers(serviceSubType, customerLat, customerLng)
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text("Petugas di Sekitar Anda", fontWeight = FontWeight.Bold)
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            Text(formatServiceName(serviceSubType), fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            uiState.priceRange?.let { range ->
                Text("Estimasi harga jasa: Rp ${formatRupiah(range.min)} - Rp ${formatRupiah(range.max)}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(16.dp))
            when {
                uiState.isLoading -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                uiState.error != null -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(uiState.error ?: "Terjadi kesalahan", color = MaterialTheme.colorScheme.error) }
                uiState.couriers.isEmpty() -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Tidak ada petugas tersedia di sekitar Anda", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(uiState.couriers) { courier ->
                        CourierPriceCard(courier = courier, isSelected = courier.courierId == selectedCourierId, onSelect = { selectedCourierId = courier.courierId; onCourierSelected(courier.courierId, courier.courierServicePrice) })
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Text("💡 Harga jasa ditentukan oleh masing-masing petugas. Biaya per-km dan tol ditentukan oleh sistem.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun formatServiceName(serviceSubType: String): String {
    return when (serviceSubType) {
        "tambal_ban_motor" -> "Tambal Ban Motor"
        "tambal_ban_mobil" -> "Tambal Ban Mobil"
        "towing_motor" -> "Towing Motor"
        "towing_mobil" -> "Towing Mobil"
        else -> serviceSubType
    }
}

private fun formatRupiah(amount: Long): String {
    return amount.toString().reversed().chunked(3).joinToString(".").reversed()
}
