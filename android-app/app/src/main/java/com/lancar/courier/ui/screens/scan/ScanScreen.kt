package com.lancar.courier.ui.screens.scan

import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lancar.courier.ui.theme.Primary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanScreen(
    onScanSuccess: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: ScanViewModel = viewModel()
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()
    
    var orderIdInput by remember { mutableStateOf("") }
    
    LaunchedEffect(uiState) {
        when (uiState) {
            is ScanUiState.Success -> {
                val data = (uiState as ScanUiState.Success).scanData
                Toast.makeText(context, "Scan successful for ${data.orderId}", Toast.LENGTH_SHORT).show()
                onScanSuccess(data.orderId)
                viewModel.resetState()
            }
            is ScanUiState.Error -> {
                Toast.makeText(context, (uiState as ScanUiState.Error).message, Toast.LENGTH_LONG).show()
                viewModel.resetState()
            }
            else -> {}
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Scan Package") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Primary,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Default.QrCodeScanner,
                contentDescription = null,
                modifier = Modifier.size(120.dp),
                tint = Primary
            )
            Spacer(modifier = Modifier.height(32.dp))
            
            Text(
                text = "Manual Entry / Demo Scanner",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(16.dp))
            
            OutlinedTextField(
                value = orderIdInput,
                onValueChange = { orderIdInput = it },
                label = { Text("Order ID / Barcode") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Button(
                onClick = {
                    if (orderIdInput.isNotBlank()) {
                        // Demo coords for Jakarta
                        viewModel.processScan(
                            orderId = orderIdInput,
                            latitude = -6.2088,
                            longitude = 106.8456,
                            scanType = "pickup"
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                enabled = orderIdInput.isNotBlank() && uiState !is ScanUiState.Loading
            ) {
                if (uiState is ScanUiState.Loading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                } else {
                    Text("Simulate Scan")
                }
            }
        }
    }
}
