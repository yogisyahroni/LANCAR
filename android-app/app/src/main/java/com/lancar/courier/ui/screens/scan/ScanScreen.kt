package com.lancar.courier.ui.screens.scan

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
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
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.lancar.courier.ui.theme.Primary
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanScreen(
    initialOrderId: String? = null,
    scanType: String = "pickup",
    title: String = "Verifikasi Barang",
    onScanSuccess: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: ScanViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val uiState by viewModel.uiState.collectAsState()
    
    var orderIdInput by remember(initialOrderId) { mutableStateOf(initialOrderId.orEmpty()) }
    
    LaunchedEffect(uiState) {
        when (uiState) {
            is ScanUiState.Success -> {
                val data = (uiState as ScanUiState.Success).scanData
                Toast.makeText(context, "Verifikasi berhasil untuk ${data.orderId}", Toast.LENGTH_SHORT).show()
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
                title = { Text(title) },
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
                text = if (scanType == "pickup") "Scan barcode atau masukkan kode paket" else "Scan ulang kode paket",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(16.dp))
            
            OutlinedTextField(
                value = orderIdInput,
                onValueChange = { orderIdInput = it },
                label = { Text(if (initialOrderId.isNullOrBlank()) "Order ID / Barcode" else "Barcode / kode paket") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = initialOrderId.isNullOrBlank()
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Button(
                onClick = {
                    if (orderIdInput.isNotBlank()) {
                        scope.launch {
                            val location = getCurrentVerificationLocation(context)
                            if (location == null) {
                                Toast.makeText(
                                    context,
                                    "Lokasi belum tersedia. Aktifkan GPS dan coba lagi.",
                                    Toast.LENGTH_LONG
                                ).show()
                                return@launch
                            }
                            val orderId = initialOrderId ?: orderIdInput
                            viewModel.processScan(
                                orderId = orderId,
                                latitude = location.latitude,
                                longitude = location.longitude,
                                accuracy = location.accuracy,
                                scanType = scanType,
                                barcodeValue = orderIdInput.takeIf { it != orderId }
                            )
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                enabled = orderIdInput.isNotBlank() && uiState !is ScanUiState.Loading
            ) {
                if (uiState is ScanUiState.Loading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                } else {
                    Text(if (scanType == "pickup") "Verifikasi Pickup" else "Verifikasi Dropoff")
                }
            }
        }
    }
}

private suspend fun getCurrentVerificationLocation(context: Context): android.location.Location? {
    val fineGranted = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED
    val coarseGranted = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_COARSE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED
    if (!fineGranted && !coarseGranted) return null

    val client = LocationServices.getFusedLocationProviderClient(context)
    return try {
        withTimeoutOrNull(8_000L) {
            client.getCurrentLocation(
                Priority.PRIORITY_HIGH_ACCURACY,
                CancellationTokenSource().token
            ).await()
        } ?: client.lastLocation.await()
    } catch (_: Exception) {
        null
    }
}
