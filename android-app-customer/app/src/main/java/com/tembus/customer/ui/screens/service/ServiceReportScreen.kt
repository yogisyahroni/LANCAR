package com.tembus.customer.ui.screens.service

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.components.PhotoComparisonView

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceReportScreen(
    orderId: String,
    serviceSubType: String,
    onBackClick: () -> Unit,
    viewModel: ServiceReportViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    androidx.compose.runtime.LaunchedEffect(orderId) {
        viewModel.loadReport(orderId, serviceSubType)
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Laporan Layanan", fontWeight = FontWeight.Bold) },
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
                .verticalScroll(rememberScrollState())
        ) {
            // Order info
            Text(
                "Order #$orderId",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(Modifier.height(16.dp))
            
            when {
                uiState.isLoading -> {
                    Text("Memuat laporan...", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                uiState.error != null -> {
                    Text(uiState.error ?: "Terjadi kesalahan", color = MaterialTheme.colorScheme.error)
                }
                uiState.tambalBanReport != null -> {
                    // Tambal Ban Report
                    val report = uiState.tambalBanReport!!
                    
                    if (report.tireConditionBefore != null || report.tirePhotoBeforeUrl != null) {
                        PhotoComparisonView(
                            title = "Kondisi Ban",
                            beforePhotoUrl = report.tirePhotoBeforeUrl,
                            afterPhotoUrl = report.tirePhotoAfterUrl,
                            beforeLabel = "Sebelum",
                            afterLabel = "Sesudah"
                        )
                    }
                    
                    Spacer(Modifier.height(16.dp))
                    
                    report.materialsUsed?.let { materials ->
                        Text("Bahan yang digunakan:", fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text(materials, fontSize = 14.sp)
                    }
                    
                    report.notes?.let { notes ->
                        Spacer(Modifier.height(8.dp))
                        Text("Catatan:", fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text(notes, fontSize = 14.sp)
                    }
                    
                    report.serviceDurationMinutes?.let { duration ->
                        Spacer(Modifier.height(8.dp))
                        Text("Durasi layanan: $duration menit", fontSize = 14.sp)
                    }
                }
                uiState.towingReport != null -> {
                    // Towing Report
                    val report = uiState.towingReport!!
                    
                    if (report.vehiclePhotoBeforeUrl != null || report.vehiclePhotoBeforeUrl != null) {
                        PhotoComparisonView(
                            title = "Kondisi Kendaraan",
                            beforePhotoUrl = report.vehiclePhotoBeforeUrl,
                            afterPhotoUrl = report.completionPhotoUrl,
                            beforeLabel = "Saat Diambil",
                            afterLabel = "Saat Diturunkan"
                        )
                    }
                    
                    Spacer(Modifier.height(16.dp))
                    
                    report.loadingPhotoUrl?.let { url ->
                        Text("Foto Loading:", fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        // Show loading photo
                    }
                    
                    report.unloadingPhotoUrl?.let { url ->
                        Spacer(Modifier.height(8.dp))
                        Text("Foto Unloading:", fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        // Show unloading photo
                    }
                    
                    report.notes?.let { notes ->
                        Spacer(Modifier.height(8.dp))
                        Text("Catatan:", fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text(notes, fontSize = 14.sp)
                    }
                }
            }
        }
    }
}
