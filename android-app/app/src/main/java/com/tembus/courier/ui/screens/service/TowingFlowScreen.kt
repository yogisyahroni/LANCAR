package com.tembus.courier.ui.screens.service

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.courier.domain.TowingNextActionType
import com.tembus.courier.ui.components.service.EarningsBreakdown
import com.tembus.courier.ui.components.service.ServiceProgressBar
import com.tembus.courier.ui.components.service.TowingProgressSteps

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TowingFlowScreen(
    orderId: String,
    onBackClick: () -> Unit,
    onComplete: () -> Unit,
    onOpenCompletion: (orderId: String, serviceType: String) -> Unit,
    viewModel: TowingFlowViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

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
                title = { Text("Towing", fontWeight = FontWeight.Bold) },
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
                steps = TowingProgressSteps.steps,
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

            Spacer(Modifier.weight(1f))

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
                    if (uiState.nextActionType == TowingNextActionType.CAPTURE_COMPLETION) {
                        onOpenCompletion(orderId, "towing")
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
