package com.tembus.courier.ui.screens.pod

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.google.accompanist.permissions.shouldShowRationale
import com.tembus.courier.data.model.Order
import com.tembus.courier.domain.CourierProofTypes
import com.tembus.courier.ui.theme.Primary
import java.io.File
import java.util.concurrent.Executor
import kotlin.math.max
import kotlin.math.roundToInt
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Proof of Delivery Screen
 *
 * Provides camera interface for drivers to capture proof of delivery images.
 * Features:
 * - Camera preview with capture button
 * - Image preview with compression info
 * - Retake and confirm options
 * - Permission handling
 */
@OptIn(ExperimentalPermissionsApi::class, ExperimentalMaterial3Api::class)
@Composable
fun ProofOfDeliveryScreen(
    order: Order,
    proofMode: String = CourierProofTypes.DELIVERY_POD_PHOTO,
    onImageConfirmed: (Uri) -> Unit,
    onBack: () -> Unit,
    viewModel: ProofOfDeliveryViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current
    val uiState by viewModel.uiState.collectAsState()
    val normalizedProofMode = remember(proofMode) { CourierProofTypes.normalize(proofMode) }
    val isPickupProof = CourierProofTypes.isPickupProof(normalizedProofMode)

    val cameraPermissionState = rememberPermissionState(Manifest.permission.CAMERA)

    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    var proofNotice by remember(order.orderId, normalizedProofMode) { mutableStateOf<String?>(null) }
    var gpsRetryCount by remember(order.orderId, normalizedProofMode) { mutableStateOf(0) }
    var selectedGpsOverrideReason by remember(order.orderId, normalizedProofMode) { mutableStateOf<String?>(null) }
    val proofRadiusM = remember(order.orderId, normalizedProofMode) {
        order.serviceProofGeofenceRadiusM.coerceIn(1, 100)
    }
    val proofMinAccuracyM = remember(order.orderId, normalizedProofMode) {
        order.serviceProofMinAccuracyM.coerceIn(1, 500)
    }

    LaunchedEffect(Unit) {
        if (!cameraPermissionState.status.isGranted) {
            cameraPermissionState.launchPermissionRequest()
        }
    }

    // Handle errors
    LaunchedEffect(uiState.error) {
        uiState.error?.let { error ->
            proofNotice = error
            Toast.makeText(context, error, Toast.LENGTH_LONG).show()
            viewModel.clearError()
        }
    }

    // Handle upload completion — triggered when PoD is safely saved to local DB (offline-first)
    LaunchedEffect(uiState.podSavedLocally) {
        val capturedUri = uiState.capturedImageUri
        if (uiState.podSavedLocally && capturedUri != null) {
            proofNotice = null
            val message = if (isPickupProof) {
                if (uiState.serverSyncSuccess) {
                    "Foto pickup berhasil diverifikasi"
                } else {
                    "Foto pickup tersimpan. Akan tersinkronisasi otomatis."
                }
            } else if (uiState.serverSyncSuccess) {
                "Bukti terima berhasil terkirim"
            } else {
                "Bukti terima tersimpan. Akan tersinkronisasi otomatis."
            }
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
            onImageConfirmed(capturedUri)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isPickupProof) "Foto Barang Saat Pickup" else "Bukti Terima") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
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
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                !cameraPermissionState.status.isGranted -> {
                    CameraPermissionContent(
                        shouldShowRationale = cameraPermissionState.status.shouldShowRationale,
                        onRequestPermission = { cameraPermissionState.launchPermissionRequest() }
                    )
                }
                uiState.capturedImageUri != null -> {
                    if (!isPickupProof && !uiState.isSignatureCaptured) {
                        SignatureCaptureContent(
                            onSignatureCaptured = { bitmap ->
                                viewModel.combinePhotoAndSignature(context, bitmap)
                            },
                            onCancel = { viewModel.clearImage() }
                        )
                    } else {
                        ImagePreviewContent(
                            uiState = uiState,
                            gpsRetryCount = gpsRetryCount,
                            selectedGpsOverrideReason = selectedGpsOverrideReason,
                            onGpsOverrideReasonChange = { selectedGpsOverrideReason = it },
                            onRetake = { viewModel.clearImage() },
                            onConfirm = {
                                scope.launch {
                                    val location = getCurrentPodLocation(context)
                                    val locationCheck = evaluatePodLocationGate(
                                        order = order,
                                        isPickupProof = isPickupProof,
                                        location = location,
                                        radiusM = proofRadiusM,
                                        minAccuracyM = proofMinAccuracyM,
                                        retryCount = gpsRetryCount,
                                        overrideReason = selectedGpsOverrideReason
                                    )
                                    if (!locationCheck.canSubmit) {
                                        gpsRetryCount += 1
                                        proofNotice = locationCheck.message
                                        Toast.makeText(
                                            context,
                                            locationCheck.message,
                                            Toast.LENGTH_LONG
                                        ).show()
                                        return@launch
                                    }
                                    viewModel.uploadPod(
                                        orderId = order.orderId,
                                        latitude = locationCheck.location.latitude,
                                        longitude = locationCheck.location.longitude,
                                        accuracy = locationCheck.location.accuracy,
                                        overrideReason = if (locationCheck.requiresOverride) selectedGpsOverrideReason else null,
                                        proofType = normalizedProofMode
                                    )
                                }
                            }
                        )
                    }
                }
                else -> {
                    CameraPreviewContent(
                        order = order,
                        proofMode = normalizedProofMode,
                        onImageCaptureReady = { imageCapture = it },
                        onCapture = {
                            imageCapture?.let { capture ->
                                val executor = ContextCompat.getMainExecutor(context)
                                viewModel.captureImage(capture, context, executor)
                            }
                        },
                        isCapturing = uiState.isCapturing,
                        isTorchEnabled = uiState.isTorchEnabled,
                        onToggleTorch = { viewModel.toggleTorch() },
                        lifecycleOwner = lifecycleOwner
                    )
                }
            }
            proofNotice?.let { message ->
                ProofInlineNotice(
                    message = message,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(12.dp)
                )
            }
        }
    }
}

@Composable
private fun ProofInlineNotice(
    message: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.error.copy(alpha = 0.12f),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.GpsOff, contentDescription = null, tint = MaterialTheme.colorScheme.error)
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

@Composable
private fun CameraPermissionContent(
    shouldShowRationale: Boolean,
    onRequestPermission: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.CameraAlt,
            contentDescription = null,
            modifier = Modifier.size(80.dp),
            tint = Primary
        )
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = if (shouldShowRationale)
                "Akses kamera diperlukan untuk mengambil bukti pengiriman."
            else
                "Aktifkan akses kamera untuk melanjutkan.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onRequestPermission, modifier = Modifier.height(52.dp)) {
            Text("Aktifkan Kamera")
        }
    }
}

@Composable
private fun CameraPreviewContent(
    order: Order,
    proofMode: String,
    onImageCaptureReady: (ImageCapture) -> Unit,
    onCapture: () -> Unit,
    isCapturing: Boolean,
    isTorchEnabled: Boolean,
    onToggleTorch: () -> Unit,
    lifecycleOwner: androidx.lifecycle.LifecycleOwner
) {
    var activeCamera by remember { mutableStateOf<androidx.camera.core.Camera?>(null) }
    val isPickupProof = remember(proofMode) { CourierProofTypes.isPickupProof(proofMode) }

    LaunchedEffect(isTorchEnabled, activeCamera) {
        activeCamera?.cameraControl?.enableTorch(isTorchEnabled)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Camera Preview
        AndroidView(
            factory = { ctx ->
                PreviewView(ctx).also { preview ->
                    startCamera(
                        context = ctx,
                        lifecycleOwner = lifecycleOwner,
                        previewView = preview,
                        onImageCaptureReady = onImageCaptureReady,
                        onCameraReady = { activeCamera = it }
                    )
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        // Flash toggle button
        IconButton(
            onClick = onToggleTorch,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(16.dp)
                .background(Color.Black.copy(alpha = 0.4f), CircleShape)
        ) {
            Icon(
                imageVector = if (isTorchEnabled) Icons.Default.FlashOn else Icons.Default.FlashOff,
                contentDescription = if (isTorchEnabled) "Matikan lampu kamera" else "Nyalakan lampu kamera",
                tint = if (isTorchEnabled) Color.Yellow else Color.White
            )
        }

        // Capture overlay with order info
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 100.dp),
            contentAlignment = Alignment.BottomCenter
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 32.dp),
                colors = CardDefaults.cardColors(
                    containerColor = Color.Black.copy(alpha = 0.7f)
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Pesanan: ${order.orderId}",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Pelanggan: ${order.customerName.ifBlank { "Data sedang disinkronkan" }}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White
                    )
                    Text(
                        text = "Tujuan: ${order.dropAddress}",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.8f)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = if (isPickupProof)
                            "Ambil foto barang yang jelas untuk verifikasi pickup"
                        else
                            "Ambil foto paket yang jelas di titik penerima",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.6f),
                        textAlign = TextAlign.Center
                    )
                    if (order.contactless && !isPickupProof) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Surface(
                            color = Color(0xFFE65100).copy(alpha = 0.9f),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                text = "ANTAR TANPA KONTAK — letakkan paket di lokasi tanpa serah terima fisik. Foto tetap wajib.",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                            )
                        }
                    }
                }
            }

            // Capture button
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.9f))
                    .border(4.dp, Primary, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                IconButton(
                    onClick = onCapture,
                    enabled = !isCapturing,
                    modifier = Modifier.size(70.dp)
                ) {
                    if (isCapturing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(40.dp),
                            color = Primary
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.CameraAlt,
                            contentDescription = "Ambil foto bukti",
                            modifier = Modifier.size(40.dp),
                            tint = Primary
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ImagePreviewContent(
    uiState: PodUiState,
    gpsRetryCount: Int,
    selectedGpsOverrideReason: String?,
    onGpsOverrideReasonChange: (String) -> Unit,
    onRetake: () -> Unit,
    onConfirm: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Image preview
        Card(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            shape = RoundedCornerShape(16.dp)
        ) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(uiState.capturedImageUri)
                    .crossfade(true)
                    .build(),
                contentDescription = "Pratinjau foto bukti",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Compression info
        if (uiState.originalFileSize > 0) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text(
                            text = "Ukuran awal",
                            style = MaterialTheme.typography.labelSmall
                        )
                        Text(
                            text = formatFileSize(uiState.originalFileSize),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    if (uiState.isCompressed) {
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = "Ukuran kirim",
                                style = MaterialTheme.typography.labelSmall
                            )
                            Text(
                                text = formatFileSize(uiState.compressedFileSize),
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold,
                                color = Primary
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (gpsRetryCount >= 2) {
            GpsOverrideReasonPanel(
                selectedReason = selectedGpsOverrideReason,
                onReasonSelected = onGpsOverrideReasonChange
            )
            Spacer(modifier = Modifier.height(16.dp))
        }

        // Action buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedButton(
                onClick = onRetake,
                modifier = Modifier.weight(1f).height(52.dp)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Ambil Ulang")
            }

            Button(
                onClick = onConfirm,
                modifier = Modifier.weight(1f).height(52.dp),
                enabled = !uiState.isUploading
            ) {
                if (uiState.isUploading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.White
                    )
                } else {
                    Icon(Icons.Default.Check, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Konfirmasi")
                }
            }
        }
    }
}

@Composable
private fun GpsOverrideReasonPanel(
    selectedReason: String?,
    onReasonSelected: (String) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.26f))
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = Primary)
                Column(modifier = Modifier.weight(1f)) {
                    Text("Override GPS terkendali", fontWeight = FontWeight.Bold)
                    Text(
                        "Gunakan hanya saat sudah berada di titik operasional tetapi sinyal GPS buruk. Alasan, akurasi, dan jarak tetap diaudit server.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            gpsOverrideReasons.forEach { (code, label) ->
                FilterChip(
                    selected = selectedReason == code,
                    onClick = { onReasonSelected(code) },
                    label = { Text(label, fontWeight = FontWeight.Medium) }
                )
            }
        }
    }
}

private fun startCamera(
    context: Context,
    lifecycleOwner: androidx.lifecycle.LifecycleOwner,
    previewView: PreviewView,
    onImageCaptureReady: (ImageCapture) -> Unit,
    onCameraReady: (androidx.camera.core.Camera) -> Unit
) {
    val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

    cameraProviderFuture.addListener({
        val cameraProvider = cameraProviderFuture.get()

        val preview = Preview.Builder().build().also {
            it.setSurfaceProvider(previewView.surfaceProvider)
        }

        val imageCapture = ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .build()

        onImageCaptureReady(imageCapture)

        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

        try {
            cameraProvider.unbindAll()
            val camera = cameraProvider.bindToLifecycle(
                lifecycleOwner,
                cameraSelector,
                preview,
                imageCapture
            )
            onCameraReady(camera)
        } catch (e: Exception) {
            // Handle camera binding failure
        }
    }, ContextCompat.getMainExecutor(context))
}

private fun formatFileSize(bytes: Long): String {
    return when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${bytes / 1024} KB"
        else -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
    }
}

private data class PodLocationGateResult(
    val canSubmit: Boolean,
    val requiresOverride: Boolean,
    val message: String,
    val location: Location
)

private val gpsOverrideReasons = listOf(
    "gps_indoor_weak_signal" to "GPS indoor lemah",
    "map_pin_offset" to "Titik peta bergeser",
    "receiver_area_access_limited" to "Akses titik terbatas"
)

private fun evaluatePodLocationGate(
    order: Order,
    isPickupProof: Boolean,
    location: Location?,
    radiusM: Int,
    minAccuracyM: Int,
    retryCount: Int,
    overrideReason: String?
): PodLocationGateResult {
    if (location == null) {
        return PodLocationGateResult(
            canSubmit = false,
            requiresOverride = false,
            message = "Lokasi perangkat belum siap. Aktifkan GPS, tunggu akurasi membaik, lalu coba lagi.",
            location = Location("unavailable")
        )
    }

    val targetLat = if (isPickupProof) order.pickupLatitude else order.dropLatitude
    val targetLng = if (isPickupProof) order.pickupLongitude else order.dropLongitude
    val distanceM = if (targetLat != null && targetLng != null) {
        FloatArray(1).also { result ->
            Location.distanceBetween(location.latitude, location.longitude, targetLat, targetLng, result)
        }[0].roundToInt()
    } else {
        null
    }
    val accuracyM = location.accuracy.roundToInt()
    val isAccurateEnough = accuracyM <= minAccuracyM
    val isInsideRadius = distanceM == null || distanceM <= radiusM

    if (isAccurateEnough && isInsideRadius) {
        return PodLocationGateResult(
            canSubmit = true,
            requiresOverride = false,
            message = "Lokasi valid.",
            location = location
        )
    }

    val maxOverrideDistanceM = max(35, radiusM * 3)
    val canOverrideDistance = distanceM == null || distanceM <= maxOverrideDistanceM
    val canOverrideAccuracy = accuracyM <= 120
    val overrideEligible = canOverrideDistance && canOverrideAccuracy
    val hasRetriedEnough = retryCount >= 2
    val hasOverrideReason = !overrideReason.isNullOrBlank()
    val distanceCopy = distanceM?.let { "jarak ${it}m dari radius ${radiusM}m" }
    val accuracyCopy = "akurasi ${accuracyM}m dari batas ${minAccuracyM}m"
    val issueCopy = listOfNotNull(
        if (!isInsideRadius) distanceCopy else null,
        if (!isAccurateEnough) accuracyCopy else null
    ).joinToString(", ")

    if (!overrideEligible) {
        return PodLocationGateResult(
            canSubmit = false,
            requiresOverride = false,
            message = "Validasi GPS belum aman: $issueCopy. Dekati titik operasional dan coba lagi.",
            location = location
        )
    }

    if (!hasRetriedEnough) {
        return PodLocationGateResult(
            canSubmit = false,
            requiresOverride = true,
            message = "Validasi GPS belum memenuhi aturan: $issueCopy. Coba ulang sampai lokasi stabil.",
            location = location
        )
    }

    if (!hasOverrideReason) {
        return PodLocationGateResult(
            canSubmit = false,
            requiresOverride = true,
            message = "GPS masih belum ideal: $issueCopy. Pilih alasan override agar dikirim untuk audit server.",
            location = location
        )
    }

    return PodLocationGateResult(
        canSubmit = true,
        requiresOverride = true,
        message = "Override GPS dikirim untuk audit.",
        location = location
    )
}

private suspend fun getCurrentPodLocation(context: Context): Location? {
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

@Composable
private fun SignatureCaptureContent(
    onSignatureCaptured: (android.graphics.Bitmap) -> Unit,
    onCancel: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Default.Edit,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = Primary
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Tanda Tangan Digital",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Minta penerima paket menuliskan tanda tangannya langsung pada kanvas kotak di bawah ini untuk menyelesaikan pengiriman.",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 28.dp)
        )

        SignaturePad(
            onSignatureCaptured = onSignatureCaptured,
            onClear = {}
        )

        Spacer(modifier = Modifier.height(24.dp))
        
        TextButton(onClick = onCancel) {
            Text("Batal & Foto Ulang", color = MaterialTheme.colorScheme.error)
        }
    }
}
