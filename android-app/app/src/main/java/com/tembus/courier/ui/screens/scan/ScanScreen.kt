package com.tembus.courier.ui.screens.scan

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.camera.core.CameraSelector
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
import com.tembus.courier.ui.localization.CourierText as Text
import com.tembus.courier.ui.localization.CourierTextCatalog
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
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.LuminanceSource
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.tembus.courier.domain.CourierProofTypes
import com.tembus.courier.ui.theme.Primary
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private val barcodeDecodeHints = mapOf(
    DecodeHintType.POSSIBLE_FORMATS to listOf(
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.CODABAR,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.ITF,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.PDF_417
    ),
    DecodeHintType.TRY_HARDER to true
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun ScanScreen(
    initialOrderId: String? = null,
    scanType: String = CourierProofTypes.PICKUP_SCAN,
    title: String = "Verifikasi Barang",
    onScanSuccess: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: ScanViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val uiState by viewModel.uiState.collectAsState()
    val cameraPermissionState = rememberPermissionState(Manifest.permission.CAMERA)
    val isPickupScan = scanType in setOf("pickup", CourierProofTypes.PICKUP_SCAN)

    var packageCodeInput by remember(initialOrderId) { mutableStateOf("") }
    var hasSubmittedScan by remember(initialOrderId, scanType) { mutableStateOf(false) }
    var verificationNotice by remember(initialOrderId, scanType) { mutableStateOf<String?>(null) }

    fun submitVerification(code: String) {
        val manualCode = code.trim()
        val orderId = initialOrderId ?: manualCode
        if (orderId.isBlank()) return

        hasSubmittedScan = true
        verificationNotice = null
        scope.launch {
            val location = getCurrentVerificationLocation(context)
            if (location == null) {
                hasSubmittedScan = false
                verificationNotice = "Lokasi perangkat belum siap. Aktifkan GPS, tunggu akurasi membaik, lalu coba lagi."
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
                verificationNotice = null
                Toast.makeText(context, "Verifikasi berhasil untuk ${data.orderId}", Toast.LENGTH_SHORT).show()
                onScanSuccess(data.orderId)
                viewModel.resetState()
            }
            is ScanUiState.Error -> {
                val message = (uiState as ScanUiState.Error).message
                hasSubmittedScan = false
                verificationNotice = message
                Toast.makeText(context, message, Toast.LENGTH_LONG).show()
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
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CourierTextCatalog.translate("Kembali"))
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
                text = if (isPickupScan) "Scan Kode Paket atau masukkan kode paket" else "Scan ulang Kode Paket",
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
                text = if (isPickupScan) {
                    "Wajib diverifikasi sebelum kurir bisa mulai pengantaran."
                } else {
                    "Validasi ulang dilakukan di titik penerima."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            verificationNotice?.let { message ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.error.copy(alpha = 0.10f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
            
            Button(
                onClick = { submitVerification(packageCodeInput) },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                enabled = packageCodeInput.isNotBlank() && uiState !is ScanUiState.Loading
            ) {
                if (uiState is ScanUiState.Loading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                } else {
                    Text(if (isPickupScan) "Verifikasi Pickup" else "Verifikasi Tujuan")
                }
            }
        }
    }
}

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

private fun bindBarcodeCamera(
    context: Context,
    previewView: PreviewView,
    lifecycleOwner: androidx.lifecycle.LifecycleOwner,
    cameraExecutor: ExecutorService,
    enabled: Boolean,
    onBarcodeDetected: (String) -> Unit
) {
    val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
    val barcodeReader = MultiFormatReader().apply {
        setHints(barcodeDecodeHints)
    }

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
                        barcodeReader = barcodeReader,
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

private fun processBarcodeFrame(
    imageProxy: ImageProxy,
    enabled: Boolean,
    barcodeReader: MultiFormatReader,
    onBarcodeDetected: (String) -> Unit
) {
    try {
        if (!enabled) {
            return
        }

        decodeBarcodeFromFrame(imageProxy, barcodeReader)
            ?.takeIf { it.isNotBlank() }
            ?.let(onBarcodeDetected)
    } finally {
        barcodeReader.reset()
        imageProxy.close()
    }
}

private fun decodeBarcodeFromFrame(
    imageProxy: ImageProxy,
    barcodeReader: MultiFormatReader
): String? {
    val yPlane = imageProxy.planes.firstOrNull() ?: return null
    val width = imageProxy.width
    val height = imageProxy.height
    if (width <= 0 || height <= 0) return null

    val buffer = yPlane.buffer.duplicate()
    val rowStride = yPlane.rowStride
    val pixelStride = yPlane.pixelStride
    val luminance = ByteArray(width * height)

    for (row in 0 until height) {
        val rowOffset = row * rowStride
        val outputOffset = row * width
        for (column in 0 until width) {
            luminance[outputOffset + column] = buffer.get(rowOffset + column * pixelStride)
        }
    }

    val source = PlanarYUVLuminanceSource(
        luminance,
        width,
        height,
        0,
        0,
        width,
        height,
        false
    )

    return decodeWithSource(barcodeReader, source)
        ?: if (source.isRotateSupported) {
            barcodeReader.reset()
            decodeWithSource(barcodeReader, source.rotateCounterClockwise())
        } else {
            null
        }
}

private fun decodeWithSource(
    barcodeReader: MultiFormatReader,
    source: LuminanceSource
): String? {
    return runCatching {
        barcodeReader.decodeWithState(BinaryBitmap(HybridBinarizer(source))).text
    }.getOrNull()
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
