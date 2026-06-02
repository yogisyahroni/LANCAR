package com.tembus.courier.ui.screens.scan

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.tembus.courier.ui.theme.Primary
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
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
    val cameraPermissionState = rememberPermissionState(Manifest.permission.CAMERA)

    var packageCodeInput by remember(initialOrderId) { mutableStateOf("") }
    var hasSubmittedScan by remember(initialOrderId, scanType) { mutableStateOf(false) }

    fun submitVerification(code: String) {
        val manualCode = code.trim()
        val orderId = initialOrderId ?: manualCode
        if (orderId.isBlank()) return

        hasSubmittedScan = true
        scope.launch {
            val location = getCurrentVerificationLocation(context)
            if (location == null) {
                hasSubmittedScan = false
                Toast.makeText(
                    context,
                    "Lokasi perangkat sedang dikunci. Aktifkan GPS dan coba lagi.",
                    Toast.LENGTH_LONG
                ).show()
                return@launch
            }
            viewModel.processScan(
                orderId = orderId,
                latitude = location.latitude,
                longitude = location.longitude,
                accuracy = location.accuracy,
                scanType = scanType,
                barcodeValue = manualCode.takeIf { it.isNotBlank() }
            )
        }
    }
    
    LaunchedEffect(uiState) {
        when (uiState) {
            is ScanUiState.Success -> {
                val data = (uiState as ScanUiState.Success).scanData
                Toast.makeText(context, "Verifikasi berhasil untuk ${data.orderId}", Toast.LENGTH_SHORT).show()
                onScanSuccess(data.orderId)
                viewModel.resetState()
            }
            is ScanUiState.Error -> {
                hasSubmittedScan = false
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            if (cameraPermissionState.status.isGranted) {
                BarcodeCameraPreview(
                    enabled = uiState !is ScanUiState.Loading && !hasSubmittedScan,
                    onBarcodeDetected = { detectedCode ->
                        if (!hasSubmittedScan) {
                            packageCodeInput = detectedCode
                            submitVerification(detectedCode)
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(320.dp)
                        .clip(RoundedCornerShape(8.dp))
                )
            } else {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(320.dp),
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(56.dp), tint = Primary)
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Akses kamera diperlukan untuk scan cepat.", fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(onClick = { cameraPermissionState.launchPermissionRequest() }) {
                            Text("Aktifkan Kamera")
                        }
                    }
                }
            }
            
            Text(
                text = if (scanType == "pickup") "Scan barcode atau masukkan kode paket" else "Scan ulang kode paket",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            
            OutlinedTextField(
                value = packageCodeInput,
                onValueChange = {
                    packageCodeInput = it
                    hasSubmittedScan = false
                },
                label = { Text(if (initialOrderId.isNullOrBlank()) "Order ID / kode paket" else "Nomor resi / kode paket") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Text(
                text = if (scanType == "pickup") {
                    "Wajib diverifikasi sebelum kurir bisa mulai pengantaran."
                } else {
                    "Validasi ulang dilakukan di titik penerima."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Button(
                onClick = { submitVerification(packageCodeInput) },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                enabled = packageCodeInput.isNotBlank() && uiState !is ScanUiState.Loading
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

@androidx.annotation.OptIn(ExperimentalGetImage::class)
@Composable
private fun BarcodeCameraPreview(
    enabled: Boolean,
    onBarcodeDetected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }

    DisposableEffect(Unit) {
        onDispose { cameraExecutor.shutdown() }
    }

    AndroidView(
        modifier = modifier,
        factory = { viewContext ->
            PreviewView(viewContext).apply {
                scaleType = PreviewView.ScaleType.FILL_CENTER
            }
        },
        update = { previewView ->
            bindBarcodeCamera(
                context = context,
                previewView = previewView,
                lifecycleOwner = lifecycleOwner,
                cameraExecutor = cameraExecutor,
                enabled = enabled,
                onBarcodeDetected = onBarcodeDetected
            )
        }
    )
}

@ExperimentalGetImage
private fun bindBarcodeCamera(
    context: Context,
    previewView: PreviewView,
    lifecycleOwner: androidx.lifecycle.LifecycleOwner,
    cameraExecutor: ExecutorService,
    enabled: Boolean,
    onBarcodeDetected: (String) -> Unit
) {
    val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
    val scanner = BarcodeScanning.getClient()

    cameraProviderFuture.addListener({
        val cameraProvider = cameraProviderFuture.get()
        val preview = Preview.Builder().build().also {
            it.setSurfaceProvider(previewView.surfaceProvider)
        }
        val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also { imageAnalysis ->
                imageAnalysis.setAnalyzer(cameraExecutor) { imageProxy ->
                    processBarcodeFrame(
                        imageProxy = imageProxy,
                        enabled = enabled,
                        scanner = scanner,
                        onBarcodeDetected = onBarcodeDetected
                    )
                }
            }

        try {
            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(
                lifecycleOwner,
                CameraSelector.DEFAULT_BACK_CAMERA,
                preview,
                analysis
            )
        } catch (_: Exception) {
            cameraProvider.unbindAll()
        }
    }, ContextCompat.getMainExecutor(context))
}

@ExperimentalGetImage
private fun processBarcodeFrame(
    imageProxy: ImageProxy,
    enabled: Boolean,
    scanner: com.google.mlkit.vision.barcode.BarcodeScanner,
    onBarcodeDetected: (String) -> Unit
) {
    if (!enabled) {
        imageProxy.close()
        return
    }
    val mediaImage = imageProxy.image
    if (mediaImage == null) {
        imageProxy.close()
        return
    }
    val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
    scanner.process(image)
        .addOnSuccessListener { barcodes ->
            barcodes.firstOrNull()?.rawValue?.takeIf { it.isNotBlank() }?.let(onBarcodeDetected)
        }
        .addOnCompleteListener {
            imageProxy.close()
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
