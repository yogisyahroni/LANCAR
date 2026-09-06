package com.tembus.courier.ui.screens.service

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import com.tembus.courier.ui.localization.CourierText as Text
import com.tembus.courier.ui.localization.CourierTextCatalog
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import android.location.Location
import android.os.Build
import com.tembus.courier.data.model.Order
import com.tembus.courier.domain.TambalBanNextActionType
import com.tembus.courier.domain.TambalBanStage
import com.tembus.courier.ui.components.service.EarningsBreakdown
import com.tembus.courier.ui.components.service.ServiceProgressBar
import com.tembus.courier.ui.components.service.TambalBanProgressSteps
import com.tembus.courier.ui.theme.TembusRadius
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import android.Manifest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TambalBanFlowScreen(
    orderId: String,
    onBackClick: () -> Unit,
    onComplete: () -> Unit,
    onVerifyFace: (orderId: String, serviceType: String) -> Unit,
    onOpenCompletion: (orderId: String, serviceType: String) -> Unit,
    viewModel: TambalBanFlowViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var selectedDamage by remember { mutableStateOf<String?>(null) }
    var selectedMaterials by remember { mutableStateOf<Set<String>>(emptySet()) }
    var inspectionPhoto by remember(orderId) { mutableStateOf<Bitmap?>(null) }
    var pendingCriticalAction by remember { mutableStateOf<TambalBanNextActionType?>(null) }

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
        val runNextAction: (TambalBanNextActionType) -> Unit = { actionType ->
            if (actionType == TambalBanNextActionType.CAPTURE_COMPLETION) {
                onOpenCompletion(orderId, "tambal_ban")
            } else if (actionType == TambalBanNextActionType.VERIFY_FACE) {
                onVerifyFace(orderId, "tambal_ban")
            } else if (actionType == TambalBanNextActionType.CAPTURE_INSPECTION) {
                inspectionPhoto?.let { viewModel.captureInspection(it) }
            } else {
                viewModel.handleNextAction(actionType)
            }
        }

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

    pendingCriticalAction?.let { actionType ->
        AlertDialog(
            onDismissRequest = { pendingCriticalAction = null },
            title = { Text("Konfirmasi aksi") },
            text = {
                Text(
                    tambalBanConfirmationMessage(actionType, uiState.nextActionLabel),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingCriticalAction = null
                        runNextAction(actionType)
                    }
                ) {
                    Text("Konfirmasi", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingCriticalAction = null }) {
                    Text("Batal")
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tambal Ban", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CourierTextCatalog.translate("Kembali"))
                    }
                }
            )
        },
        bottomBar = {
            // ===== STICKY CTA (standar industri: tombol aksi selalu terlihat) =====
                        if (uiState.nextActionType != TambalBanNextActionType.NONE) {
                            // Soft-gate: tombol "Saya di lokasi" butuh jarak ≤100m, kecuali override
                            val isArriveAction = uiState.nextActionType == TambalBanNextActionType.ARRIVED_AT_LOCATION
                            val isInspectionAction = uiState.nextActionType == TambalBanNextActionType.CAPTURE_INSPECTION
                            val withinRadius = distanceM != null && distanceM!! <= ARRIVAL_RADIUS_M
                            val gateBlocked = isArriveAction && !overrideArrival && !withinRadius
                            val inspectionBlocked = isInspectionAction &&
                                (inspectionPhoto == null || selectedDamage.isNullOrBlank())
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
                                    } else if (inspectionBlocked) {
                                        Text(
                                            "Pilih jenis kerusakan dan ambil foto kondisi awal ban sebelum mulai layanan.",
                                            fontSize = 13.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.padding(bottom = 8.dp)
                                        )
                                    }
                                    Button(
                                        onClick = {
                                            if (requiresTambalBanConfirmation(uiState.nextActionType)) {
                                                pendingCriticalAction = uiState.nextActionType
                                            } else {
                                                runNextAction(uiState.nextActionType)
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                        enabled = !uiState.isLoading && !gateBlocked && !inspectionBlocked,
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
                                TambalBanStage.SERVICE_IN_PROGRESS,
                                TambalBanStage.SERVICE_COMPLETE,
                                TambalBanStage.COMPLETED
                            )
                        ) {
                            EarningsBreakdown(data = earnings)
                            Spacer(Modifier.height(16.dp))
                        }

            if (uiState.stage == TambalBanStage.SERVICE_IN_PROGRESS) {
                ServiceAdjustmentProposalCard(
                    isSubmitting = uiState.adjustmentSubmitting,
                    feedbackMessage = uiState.adjustmentMessage,
                    feedbackError = uiState.adjustmentError,
                    onSubmit = viewModel::proposeServiceAdjustment
                )
                Spacer(Modifier.height(16.dp))
            }

            // ===== JENIS KERUSAKAN BAN (saat inspeksi — design Stitch) =====
            if (uiState.nextActionType == TambalBanNextActionType.CAPTURE_INSPECTION) {
                Spacer(Modifier.height(16.dp))
                Card(
                    shape = RoundedCornerShape(TembusRadius.Card),
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
                                    shape = RoundedCornerShape(TembusRadius.Chip),
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
                        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                        Text("Material yang digunakan", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "Pilih material yang benar-benar dipakai; daftar ini masuk ke laporan layanan.",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        val materialOptions = listOf(
                            "patch_kit" to "Patch kit",
                            "valve_core" to "Pentil / valve core",
                            "rubber_strip" to "Karet tambal",
                            "sealant" to "Cairan sealant"
                        )
                        materialOptions.forEach { (key, label) ->
                            val selected = key in selectedMaterials
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .clickable {
                                        selectedMaterials = if (selected) selectedMaterials - key else selectedMaterials + key
                                        viewModel.setMaterialsUsed(selectedMaterials.toList())
                                    },
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Checkbox(
                                    checked = selected,
                                    onCheckedChange = {
                                        selectedMaterials = if (selected) selectedMaterials - key else selectedMaterials + key
                                        viewModel.setMaterialsUsed(selectedMaterials.toList())
                                    }
                                )
                                Text(label, fontSize = 13.sp)
                            }
                        }
                    }
                }
            }

            if (uiState.nextActionType == TambalBanNextActionType.CAPTURE_INSPECTION) {
                Spacer(Modifier.height(16.dp))
                InspectionPhotoCard(
                    photo = inspectionPhoto,
                    uploadedUrl = uiState.inspectionBeforePhotoUrl,
                    title = "Foto kondisi awal ban",
                    description = "Ambil foto ban sebelum pekerjaan dimulai sebagai bukti inspeksi.",
                    onPhotoCaptured = { inspectionPhoto = it }
                )
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
        shape = RoundedCornerShape(TembusRadius.Card),
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
                            contentDescription = CourierTextCatalog.translate("Telepon pelanggan"),
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
            Spacer(Modifier.height(8.dp))

            Row(verticalAlignment = Alignment.Top) {
                Box(
                    modifier = Modifier
                        .padding(top = 2.dp)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f), RoundedCornerShape(TembusRadius.Chip))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        "Lokasi layanan",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
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

            private fun requiresTambalBanConfirmation(actionType: TambalBanNextActionType): Boolean =
                actionType in setOf(
                    TambalBanNextActionType.ARRIVED_AT_LOCATION,
                    TambalBanNextActionType.CAPTURE_INSPECTION,
                    TambalBanNextActionType.START_SERVICE,
                    TambalBanNextActionType.COMPLETE_SERVICE
                )

            private fun tambalBanConfirmationMessage(actionType: TambalBanNextActionType, label: String): String =
                when (actionType) {
                    TambalBanNextActionType.ARRIVED_AT_LOCATION ->
                        "Pastikan kamu benar-benar sudah berada di lokasi customer sebelum mengonfirmasi kedatangan."
                    TambalBanNextActionType.CAPTURE_INSPECTION ->
                        "Pastikan jenis kerusakan dan foto kondisi awal ban sudah benar. Data ini akan menjadi bukti awal layanan."
                    TambalBanNextActionType.START_SERVICE ->
                        "Mulai layanan hanya setelah customer siap dan kondisi awal sudah diverifikasi."
                    TambalBanNextActionType.COMPLETE_SERVICE ->
                        "Selesaikan layanan hanya setelah pekerjaan selesai dan customer sudah menerima hasilnya."
                    else -> "Lanjutkan aksi \"$label\"?"
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
