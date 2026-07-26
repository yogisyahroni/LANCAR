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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.components.VehicleDetailInput

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceBookingScreen(
    serviceSubType: String,
    onBackClick: () -> Unit,
    onBookingSuccess: (String) -> Unit,
    viewModel: ServiceBookingViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    var vehicleType by remember { mutableStateOf("") }
    var damageType by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var customerLat by remember { mutableStateOf(0.0) }
    var customerLng by remember { mutableStateOf(0.0) }
    var customerAddress by remember { mutableStateOf("") }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(formatServiceName(serviceSubType), fontWeight = FontWeight.Bold) },
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
            // Vehicle detail input
            VehicleDetailInput(
                serviceSubType = serviceSubType,
                vehicleType = vehicleType,
                onVehicleTypeChange = { vehicleType = it },
                damageType = damageType,
                onDamageTypeChange = { damageType = it },
                notes = notes,
                onNotesChange = { notes = it }
            )
            
            Spacer(Modifier.height(16.dp))
            
            // Location input (simplified)
            Text(
                "📍 Lokasi Anda",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
            
            Spacer(Modifier.height(8.dp))
            
            // TODO: Add location picker
            Text(
                "📍 Lokasi akan diambil dari GPS",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(Modifier.height(24.dp))
            
            // Price estimation
            uiState.priceEstimate?.let { estimate ->
                Text(
                    "💰 Estimasi Harga",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
                
                Spacer(Modifier.height(8.dp))
                
                Text(
                    "Harga jasa: Rp ${estimate.courierServicePrice}",
                    fontSize = 14.sp
                )
                
                Text(
                    "Per KM: Rp ${estimate.perKmRate} × ${estimate.distanceKm} km",
                    fontSize = 14.sp
                )
                
                Text(
                    "Base Fare: Rp ${estimate.baseFare}",
                    fontSize = 14.sp
                )
                
                Spacer(Modifier.height(8.dp))
                
                Text(
                    "TOTAL: Rp ${estimate.totalPrice}",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            
            Spacer(Modifier.height(24.dp))
            
            // Submit button
            Button(
                onClick = {
                    viewModel.createOrder(
                        serviceSubType = serviceSubType,
                        vehicleType = vehicleType,
                        damageType = damageType,
                        notes = notes,
                        customerLat = customerLat,
                        customerLng = customerLng,
                        customerAddress = customerAddress
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Text(
                    if (uiState.isLoading) "Membuat pesanan..." else "Pesan Sekarang",
                    fontWeight = FontWeight.Bold
                )
            }
            
            // Error handling
            uiState.error?.let { error ->
                Spacer(Modifier.height(8.dp))
                Text(
                    error,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 14.sp
                )
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
