package com.tembus.customer.ui.screens.service

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tembus.customer.BuildConfig
import com.tembus.customer.data.session.AuthSessionManager
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
    val context = LocalContext.current
    val sessionManager = androidx.compose.runtime.remember(context) { AuthSessionManager(context) }
    val authToken by sessionManager.authToken.collectAsState(initial = null)
    
    androidx.compose.runtime.LaunchedEffect(orderId) {
        viewModel.loadReport(orderId, serviceSubType)
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Laporan Layanan", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"))
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
                            beforePhotoUrl = absoluteServiceUploadUrl(report.tirePhotoBeforeUrl),
                            afterPhotoUrl = absoluteServiceUploadUrl(report.tirePhotoAfterUrl),
                            beforeLabel = "Sebelum",
                            afterLabel = "Sesudah",
                            authToken = authToken
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
                    
                    if (report.vehiclePhotoBeforeUrl != null || report.completionPhotoUrl != null) {
                        PhotoComparisonView(
                            title = "Kondisi Kendaraan",
                            beforePhotoUrl = absoluteServiceUploadUrl(report.vehiclePhotoBeforeUrl),
                            afterPhotoUrl = absoluteServiceUploadUrl(report.completionPhotoUrl),
                            beforeLabel = "Saat Diambil",
                            afterLabel = "Saat Diturunkan",
                            authToken = authToken
                        )
                    }
                    
                    Spacer(Modifier.height(16.dp))
                    
                    report.loadingPhotoUrl?.let { url ->
                        ServiceProofImage("Foto loading", absoluteServiceUploadUrl(url), authToken)
                    }
                    
                    report.unloadingPhotoUrl?.let { url ->
                        Spacer(Modifier.height(8.dp))
                        ServiceProofImage("Foto unloading", absoluteServiceUploadUrl(url), authToken)
                    }

                    report.signatureUrl?.let { url ->
                        Spacer(Modifier.height(8.dp))
                        ServiceProofImage("Tanda tangan penerima", absoluteServiceUploadUrl(url), authToken)
                    }

                    report.damageReport?.let { damage ->
                        Spacer(Modifier.height(10.dp))
                        Text("Hasil pemeriksaan kendaraan", fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        if (damage.areas.isNotEmpty()) {
                            Text("Area: ${damage.areas.joinToString(", ")}", fontSize = 14.sp)
                        }
                        if (damage.severity.isNotBlank()) {
                            Text("Tingkat kerusakan: ${damage.severity}", fontSize = 14.sp)
                        }
                        Text(
                            if (damage.safeToTransport) "Aman untuk dipindahkan" else "Tidak dinyatakan aman untuk dipindahkan",
                            fontSize = 14.sp,
                            color = if (damage.safeToTransport) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                        )
                        if (damage.notes.isNotBlank()) {
                            Text("Catatan pemeriksaan: ${damage.notes}", fontSize = 14.sp)
                        }
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

@Composable
private fun ServiceProofImage(title: String, url: String?, authToken: String?) {
    Column {
        Text(title, fontSize = 14.sp, fontWeight = FontWeight.Medium)
        androidx.compose.foundation.layout.Spacer(Modifier.height(6.dp))
        val context = LocalContext.current
        AsyncImage(
            model = if (authToken != null && !url.isNullOrBlank()) {
                ImageRequest.Builder(context)
                    .data(url)
                    .addHeader("Authorization", "Bearer $authToken")
                    .crossfade(true)
                    .build()
            } else url,
            contentDescription = title,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .height(170.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
        )
    }
}

private fun absoluteServiceUploadUrl(path: String?): String? {
    if (path.isNullOrBlank()) return null
    if (path.startsWith("http://") || path.startsWith("https://")) return path
    val gatewayBase = BuildConfig.BASE_URL.substringBefore("/api/v1").trimEnd('/')
    return "$gatewayBase$path"
}
