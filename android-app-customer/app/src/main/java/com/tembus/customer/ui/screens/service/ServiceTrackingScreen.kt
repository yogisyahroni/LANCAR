package com.tembus.customer.ui.screens.service

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import com.tembus.customer.ui.accessible
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.components.ServiceProgressBar
import com.tembus.customer.ui.components.TambalBanProgressSteps
import com.tembus.customer.ui.components.TowingProgressSteps
import com.tembus.customer.ui.theme.PrimarySoft
import com.tembus.customer.ui.theme.OnSurfaceVariant

private val RoadsideTrackingCanvas = androidx.compose.ui.graphics.Color(0xFFF2FCF3) // Figma roadside tracking shell

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceTrackingScreen(
    orderId: String,
    serviceSubType: String,
    onBackClick: () -> Unit,
    onChatClick: (String) -> Unit,
    onCallClick: (String) -> Unit,
    onReportClick: (String) -> Unit = {},
    viewModel: ServiceTrackingViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    androidx.compose.runtime.LaunchedEffect(orderId) {
        viewModel.startTracking(orderId, serviceSubType)
    }
    
    val isTambalBan = serviceSubType.startsWith("tambal_ban")
    val steps = if (isTambalBan) TambalBanProgressSteps.steps else TowingProgressSteps.steps
    val currentStep = uiState.currentStepIndex
    var isRefreshing by remember { mutableStateOf(false) }

    androidx.compose.runtime.LaunchedEffect(uiState.isLoading) {
        if (!uiState.isLoading) isRefreshing = false
    }
    
    Scaffold(
        containerColor = RoadsideTrackingCanvas,
        topBar = {
            TopAppBar(
                title = { Text(formatServiceName(serviceSubType), fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"))
                    }
                },
                colors = androidx.compose.material3.TopAppBarDefaults.topAppBarColors(
                    containerColor = RoadsideTrackingCanvas,
                    scrolledContainerColor = RoadsideTrackingCanvas,
                )
            )
        }
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = {
                isRefreshing = true
                viewModel.startTracking(orderId, serviceSubType)
            },
            modifier = Modifier.fillMaxSize()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(RoadsideTrackingCanvas)
                    .padding(padding)
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            ) {
                Column(Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Pelacakan layanan", fontSize = 12.sp, color = OnSurfaceVariant)
                            Text(
                                "Order #$orderId",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                            )
                        }
                        if (uiState.isStale) {
                            androidx.compose.material3.Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = PrimarySoft,
                            ) {
                                Text("Status terakhir", fontSize = 11.sp, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp))
                            }
                        }
                    }

                    Spacer(Modifier.height(16.dp))
                    if (uiState.isLoading && !uiState.hasSnapshot) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 3.dp, color = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(10.dp))
                            Text("Mengambil status terbaru…", fontSize = 13.sp, color = OnSurfaceVariant)
                        }
                    } else {
                        ServiceProgressBar(steps = steps, currentStep = currentStep)

                        uiState.courierName?.let { name ->
                            Spacer(Modifier.height(18.dp))
                            Text(name, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                        }

                        uiState.statusText?.let { status ->
                            Spacer(Modifier.height(6.dp))
                            Text(status, fontSize = 14.sp, color = MaterialTheme.colorScheme.primary, modifier = Modifier.accessible("Status pesanan: $status"))
                        }

                        uiState.etaMinutes?.let { eta ->
                            Spacer(Modifier.height(6.dp))
                            Text("Estimasi tiba $eta menit", fontSize = 13.sp, color = OnSurfaceVariant, modifier = Modifier.accessible("Estimasi tiba: $eta menit"))
                        }
                    }
                }
            }

            uiState.error?.let { error ->
                Spacer(Modifier.height(16.dp))
                Text(error, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { viewModel.startTracking(orderId, serviceSubType) }) {
                    Text("Coba lagi")
                }
            }

            if (uiState.isStale && uiState.hasSnapshot) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Koneksi terputus. Tampilan ini memakai status terakhir yang berhasil diterima server.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
            }

            if (uiState.noSupply) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Belum ada petugas yang dapat menerima layanan di lokasi ini. Coba lagi setelah kondisi berubah atau kembali untuk memilih layanan lain.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp
                )
            }

            if (uiState.courierName != null && uiState.error == null && !uiState.isTerminal) {
                Spacer(Modifier.height(20.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { onChatClick(orderId) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Icon(Icons.Default.ChatBubbleOutline, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Chat")
                    }
                    Button(
                        onClick = { onCallClick(orderId) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                    ) {
                        Icon(Icons.Default.Phone, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Telepon")
                    }
                }
            }

            if (uiState.canViewReport) {
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { onReportClick(orderId) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text("Lihat status, bukti & bantuan")
                }
            }
            }
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
