package com.tembus.courier.ui.screens.service

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.courier.domain.TambalBanNextActionType
import com.tembus.courier.domain.TambalBanStage
import com.tembus.courier.ui.components.service.EarningsBreakdown
import com.tembus.courier.ui.components.service.ServiceProgressBar
import com.tembus.courier.ui.components.service.TambalBanProgressSteps

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TambalBanFlowScreen(
    orderId: String,
    onBackClick: () -> Unit,
    onComplete: () -> Unit,
    onOpenCompletion: (orderId: String, serviceType: String) -> Unit,
    viewModel: TambalBanFlowViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var selectedDamage by remember { mutableStateOf<String?>(null) }

    // Auto-navigate when completed without needing extra tap
    LaunchedEffect(uiState.isCompleted) {
        if (uiState.isCompleted) {
            onComplete()
        }
    }

    LaunchedEffect(orderId) {
        viewModel.loadOrder(orderId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tambal Ban", fontWeight = FontWeight.Bold) },
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
                        .verticalScroll(rememberScrollState())
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
                steps = TambalBanProgressSteps.steps,
                currentStep = uiState.currentStepIndex
            )

            Spacer(Modifier.height(24.dp))

            // Status
            Text(
                uiState.title,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )

            Spacer(Modifier.height(8.dp))

            Text(
                uiState.instruction,
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(24.dp))

            // Earnings breakdown
            uiState.earnings?.let { earnings ->
                EarningsBreakdown(data = earnings)
            }

            // ===== JENIS KERUSAKAN BAN (saat inspeksi — design Stitch) =====
            if (uiState.nextActionType == TambalBanNextActionType.CAPTURE_INSPECTION) {
                Spacer(Modifier.height(16.dp))
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Jenis kerusakan ban",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.height(8.dp))
                        val damageOptions = listOf(
                            "bocor" to "Ban Bocor",
                            "pecah" to "Ban Pecah",
                            "aus" to "Ban Aus / Gundul",
                            "pentil" to "Pentil Rusak"
                        )
                        damageOptions.forEach { (key, label) ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Card(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clickable {
                                            selectedDamage = key
                                            viewModel.setDamageType(key)
                                        },
                                    shape = RoundedCornerShape(10.dp),
                                    colors = CardDefaults.cardColors(
                                        containerColor = if (selectedDamage == key) Color(0xFF00AED6).copy(alpha = 0.15f)
                                            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
                                    )
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 12.dp, vertical = 10.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        if (selectedDamage == key) {
                                            Icon(
                                                Icons.Default.CheckCircle,
                                                contentDescription = null,
                                                tint = Color(0xFF00AED6),
                                                modifier = Modifier.width(18.dp)
                                            )
                                            Spacer(Modifier.width(6.dp))
                                        }
                                        Text(
                                            label,
                                            fontSize = 13.sp,
                                            fontWeight = if (selectedDamage == key) FontWeight.Bold else FontWeight.Normal,
                                            color = if (selectedDamage == key) Color(0xFF008EB0) else MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Error message
            if (uiState.error != null) {
                Text(
                    uiState.error!!,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }

            // Action button
            Button(
                onClick = {
                    if (uiState.nextActionType == TambalBanNextActionType.CAPTURE_COMPLETION) {
                        onOpenCompletion(orderId, "tambal_ban")
                    } else {
                        viewModel.handleNextAction(uiState.nextActionType)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !uiState.isLoading,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                if (uiState.isLoading) {
                    Text("Memproses...", fontWeight = FontWeight.Bold)
                } else {
                    Text(
                        uiState.nextActionLabel,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
