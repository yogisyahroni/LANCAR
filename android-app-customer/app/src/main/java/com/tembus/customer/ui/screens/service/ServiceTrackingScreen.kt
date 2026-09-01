package com.tembus.customer.ui.screens.service

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceTrackingScreen(
    orderId: String,
    serviceSubType: String,
    onBackClick: () -> Unit,
    onChatClick: (String) -> Unit,
    onCallClick: (String) -> Unit,
    viewModel: ServiceTrackingViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    androidx.compose.runtime.LaunchedEffect(orderId) {
        viewModel.startTracking(orderId)
    }
    
    val isTambalBan = serviceSubType.startsWith("tambal_ban")
    val steps = if (isTambalBan) TambalBanProgressSteps.steps else TowingProgressSteps.steps
    val currentStep = uiState.currentStepIndex
    var isRefreshing by remember { mutableStateOf(false) }

    androidx.compose.runtime.LaunchedEffect(uiState.isLoading) {
        if (!uiState.isLoading) isRefreshing = false
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(formatServiceName(serviceSubType), fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"))
                    }
                }
            )
        }
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = {
                isRefreshing = true
                viewModel.startTracking(orderId)
            },
            modifier = Modifier.fillMaxSize()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
            // Order number
            Text(
                "Order #$orderId",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(Modifier.height(16.dp))
            
            // Progress bar
            ServiceProgressBar(
                steps = steps,
                currentStep = currentStep
            )
            
            Spacer(Modifier.height(24.dp))
            
            // Courier info
            uiState.courierName?.let { name ->
                Text(
                    name,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            
            uiState.statusText?.let { status ->
                Spacer(Modifier.height(8.dp))
                Text(
                    status,
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.accessible("Status pesanan: $status")
                )
            }
            
            uiState.etaMinutes?.let { eta ->
                Spacer(Modifier.height(8.dp))
                Text(
                    "Estimasi: $eta menit",
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.accessible("Estimasi tiba: $eta menit")
                )
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
