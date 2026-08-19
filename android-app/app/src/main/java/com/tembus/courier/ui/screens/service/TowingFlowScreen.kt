package com.tembus.courier.ui.screens.service

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.tembus.courier.domain.TowingNextActionType
import com.tembus.courier.domain.TowingStage
import com.tembus.courier.ui.components.service.EarningsBreakdown
import com.tembus.courier.ui.components.service.ServiceProgressBar
import com.tembus.courier.ui.components.service.TowingProgressSteps
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

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

    // Observe Room live: polling backend upsert → re-render earnings realtime.
        val lifecycleOwner = LocalLifecycleOwner.current
        LaunchedEffect(orderId, lifecycleOwner) {
            lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (isActive) {
                    viewModel.loadOrder(orderId)
                    delay(5_000)
                }
            }
        }

        // ===== SOFT-GATE ARRIVAL: jarak ke titik layanan (standar industri 100m) =====
        val context = LocalContext.current
        var distanceM by remember(orderId) { mutableStateOf<Int?>(null) }
        var overrideArrival by remember(orderId) { mutableStateOf(false) }

        // Loop monitor jarak: hitung ulang tiap 3 detik dari last known location.
        LaunchedEffect(orderId, uiState.pickupLatitude, uiState.pickupLongitude) {
            while (isActive) {
                val lat = uiState.pickupLatitude
                val lng = uiState.pickupLongitude
                distanceM = if (lat != null && lng != null) {
                    currentDistanceMeters(context, lat, lng)
                } else null
                delay(3_000)
            }
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
        },
        bottomBar = {
            // ===== STICKY CTA (standar industri: tombol aksi selalu terlihat) =====
                        if (uiState.nextActionType != TowingNextActionType.NONE &&
                            uiState.nextActionType != TowingNextActionType.CAPTURE_COMPLETION
                        ) {
                            // Soft-gate: tombol "Saya di lokasi" butuh jarak ≤100m, kecuali override
                            val isArriveAction = uiState.nextActionType == TowingNextActionType.ARRIVED_AT_PICKUP
                            val withinRadius = distanceM != null && distanceM!! <= ARRIVAL_RADIUS_M
                            val gateBlocked = isArriveAction && !overrideArrival && !withinRadius
                            Surface(shadowElevation = 8.dp) {
                                Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                                    if (uiState.error != null) {
                                        Text(
                                            uiState.error!!,
                                            color = MaterialTheme.colorScheme.error,
                                            fontSize = 14.sp,
                                            modifier = Modifier.padding(bottom = 8.dp)
                                        )
                                    }
                                    if (gateBlocked) {
                                        if (distanceM == null) {
                                            Text(
                                                "Mengecek jarak ke lokasi layanan...",
                                                fontSize = 13.sp,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                modifier = Modifier.padding(bottom = 8.dp)
                                            )
                                        } else {
                                            Text(
                                                "Kamu masih ${distanceM!!}m dari lokasi layanan. Dekati titik layanan (maks. 100m) atau konfirmasi manual.",
                                                fontSize = 13.sp,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                modifier = Modifier.padding(bottom = 8.dp)
                                            )
                                        }
                                        TextButton(
                                            onClick = { overrideArrival = true },
                                            modifier = Modifier.align(Alignment.End)
                                        ) {
                                            Text("Konfirmasi manual", fontWeight = FontWeight.Medium)
                                        }
                                    } else if (isArriveAction && distanceM != null && !overrideArrival) {
                                        Text(
                                            "Kamu ${distanceM!!}m dari lokasi layanan — siap mengonfirmasi kedatangan.",
                                            fontSize = 13.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.padding(bottom = 8.dp)
                                        )
                                    }
                                    Button(
                                        onClick = {
                                            if (uiState.nextActionType == TowingNextActionType.CAPTURE_COMPLETION) {
                                                onOpenCompletion(orderId, "towing")
                                            } else {
                                                viewModel.handleNextAction(uiState.nextActionType)
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                        enabled = !uiState.isLoading && !gateBlocked,
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
            // Resi publik — prefer order_number (TMBSxxxxxx), fallback UUID pendek
                        val resi = uiState.orderNumber
                            .ifBlank { orderId.take(8).uppercase() }
                        Text(
                            "Resi: $resi",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
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

            // ===== KARTU PELANGGAN (standar industri: nama, telepon, alamat) =====
            CustomerInfoCard(
                customerName = uiState.customerName,
                customerPhone = uiState.customerPhone,
                address = uiState.activeAddress
            )

            Spacer(Modifier.height(16.dp))

            // Earnings breakdown — TIDAK tampil saat Menuju Lokasi (fokus aksi),
            // hanya muncul saat sudah mengerjakan/selesai (transparansi di momen tepat)
            val earnings = uiState.earnings
            if (earnings != null && uiState.stage in setOf(
                                TowingStage.LOADING,
                                TowingStage.IN_TRANSIT,
                                TowingStage.ARRIVED_AT_DROPOFF,
                                TowingStage.UNLOADING,
                                TowingStage.COMPLETED
                            )
                        ) {
                EarningsBreakdown(data = earnings)
                Spacer(Modifier.height(16.dp))
            }

            Spacer(Modifier.height(16.dp))
        }
    }
}

/**
 * Kartu info pelanggan — standar industri ride-hailing/delivery:
 * nama + telepon (tap utk call) + alamat lokasi layanan.
 * Vocab maintenance: label "lokasi layanan", bukan "pickup".
 */
@Composable
private fun CustomerInfoCard(
    customerName: String,
    customerPhone: String,
    address: String
) {
    val context = LocalContext.current
    val phone = customerPhone.trim().replace(Regex("[^0-9+]"), "")
    val canCall = phone.isNotEmpty()

    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text(
                "Informasi Pelanggan",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.height(8.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (customerName.isNotBlank()) customerName else "Pelanggan",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                if (canCall) {
                    IconButton(onClick = {
                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                        context.startActivity(intent)
                    }) {
                        Icon(
                            Icons.Default.Phone,
                            contentDescription = "Telepon pelanggan",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
            Spacer(Modifier.height(8.dp))

            Box(
                modifier = Modifier
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    "Lokasi layanan",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                address.ifBlank { "Alamat lokasi layanan sedang disinkronkan" },
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (canCall) {
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "Telepon: $customerPhone",
                                fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            /** Radius soft-gate arrival (standar industri: 100m sebelum tombol aktif). */
            private const val ARRIVAL_RADIUS_M = 100

            /**
             * Jarak horizontal (meter) dari last known location ke titik layanan.
             * null jika lokasi belum tersedia / izin belum diberikan.
             */
            private fun currentDistanceMeters(context: android.content.Context, lat: Double, lng: Double): Int? {
                val lm = context.getSystemService(android.content.Context.LOCATION_SERVICE) as? android.location.LocationManager
                    ?: return null
                val provider = if (lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER))
                    android.location.LocationManager.GPS_PROVIDER
                else android.location.LocationManager.NETWORK_PROVIDER
                val loc = try {
                    lm.getLastKnownLocation(provider)
                } catch (_: SecurityException) { null }
                if (loc == null) return null
                val target = android.location.Location(provider).apply {
                    latitude = lat
                    longitude = lng
                }
                return loc.distanceTo(target).toInt()
            }