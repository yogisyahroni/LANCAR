package com.tembus.customer.ui.screens.service

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.tembus.customer.ui.components.VehicleDetailInput

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceBookingScreen(
    serviceSubType: String,
    onBackClick: () -> Unit,
    onBookingSuccess: (String) -> Unit,
    onSelectCourierClick: (lat: Double, lng: Double) -> Unit = { _, _ -> },
    courierId: String? = null,
    courierPrice: Long? = null,
    viewModel: ServiceBookingViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    var vehicleType by remember { mutableStateOf("") }
    var damageType by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        )
    }

    val fusedLocationClient = remember { LocationServices.getFusedLocationProviderClient(context) }

    fun fetchCurrentLocation() {
        if (!hasLocationPermission) return
        fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnSuccessListener { location ->
                if (location != null) {
                    viewModel.setLocation(location.latitude, location.longitude)
                }
            }
            .addOnFailureListener {
                viewModel.setLocation(0.0, 0.0)
            }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasLocationPermission = granted
        if (granted) fetchCurrentLocation()
    }

    LaunchedEffect(hasLocationPermission) {
        if (hasLocationPermission) {
            fetchCurrentLocation()
        }
    }

    LaunchedEffect(uiState.orderId) {
        uiState.orderId?.let { id ->
            onBookingSuccess(id)
        }
    }

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

            // Location section (GPS)
            Text(
                "Lokasi Anda",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(Modifier.height(8.dp))

            when {
                !hasLocationPermission -> {
                    Text(
                        "Aktifkan lokasi untuk menentukan posisi Anda.",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { permissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION) }
                    ) {
                        Text("Aktifkan Lokasi")
                    }
                }

                uiState.isResolvingLocation -> {
                    CircularProgressIndicator(modifier = Modifier.height(18.dp))
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Membaca alamat dari GPS...",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                uiState.customerLat != 0.0 -> {
                    Text(
                        uiState.customerAddress.ifBlank { "Lokasi saat ini" },
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "${uiState.customerLat}, ${uiState.customerLng}",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                else -> {
                    Text(
                        "Mengambil lokasi...",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // Selected courier (dari "Pilih Petugas")
            if (courierId != null) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    )
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            "Petugas dipilih",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                        if (courierPrice != null && courierPrice > 0) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Harga jasa: Rp ${formatRupiah(courierPrice)}",
                                fontSize = 13.sp
                            )
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            } else {
                // Pilih petugas dulu (wajib untuk tambal ban & towing)
                OutlinedButton(
                    onClick = {
                        if (uiState.customerLat != 0.0) {
                            onSelectCourierClick(uiState.customerLat, uiState.customerLng)
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = uiState.customerLat != 0.0
                ) {
                    Text("🛠️ Pilih Petugas")
                }
                Spacer(Modifier.height(8.dp))
            }

            // Price estimation
            if (uiState.priceEstimate != null) {
                val estimate = uiState.priceEstimate!!
                Text(
                    "💰 Estimasi Harga",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )

                Spacer(Modifier.height(8.dp))

                Text(
                    "Jarak: ${estimate.distanceKm} km",
                    fontSize = 14.sp
                )

                Text(
                    "Base Fare: Rp ${formatRupiah(estimate.baseFare)}",
                    fontSize = 14.sp
                )

                Spacer(Modifier.height(8.dp))

                Text(
                    "TOTAL: Rp ${formatRupiah(estimate.totalPrice)}",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )

                Spacer(Modifier.height(24.dp))

                // Submit button
                Button(
                    onClick = {
                        viewModel.createOrder(
                            serviceSubType = serviceSubType,
                            vehicleType = vehicleType,
                            damageType = damageType,
                            notes = notes,
                            preferredCourierId = courierId
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = courierId != null && !uiState.isLoading,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    )
                ) {
                    Text(
                        when {
                            uiState.isLoading -> "Membuat pesanan..."
                            courierId == null -> "Pilih Petugas Dulu"
                            else -> "Pesan Sekarang"
                        },
                        fontWeight = FontWeight.Bold
                    )
                }
            } else {
                // Check price button
                Button(
                    onClick = {
                        if (uiState.customerLat != 0.0) {
                            viewModel.fetchEstimate(
                                serviceSubType = serviceSubType,
                                lat = uiState.customerLat,
                                lng = uiState.customerLng
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = uiState.customerLat != 0.0 && !uiState.isLoading,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    )
                ) {
                    Text(
                        if (uiState.isLoading) "Menghitung..." else "Cek Harga",
                        fontWeight = FontWeight.Bold
                    )
                }
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

private fun formatRupiah(amount: Long): String {
    return amount.toString().reversed().chunked(3).joinToString(".").reversed()
}
