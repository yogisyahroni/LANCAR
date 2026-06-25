package com.tembus.courier.ui.screens.auth

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import android.view.ViewGroup
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.tembus.courier.ui.security.SecureScreenEffect
import com.tembus.courier.ui.theme.Primary
import kotlinx.coroutines.delay
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

data class KtpData(val nik: String, val name: String)

@Composable
fun KtpScannerScreen(
    onSuccess: (Bitmap, KtpData?) -> Unit,
    onCancel: () -> Unit
) {
    SecureScreenEffect()

    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var instructionText by remember { mutableStateOf("Posisikan KTP di dalam kotak") }
    var detectedData by remember { mutableStateOf<KtpData?>(null) }
    var captureInProgress by remember { mutableStateOf(false) }
    var showManualInputDialog by remember { mutableStateOf(false) }
    var capturedBitmapForManual by remember { mutableStateOf<Bitmap?>(null) }

    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    val imageCapture = remember { ImageCapture.Builder().build() }
    
    val recognizer = remember { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    var lastAnalyzeTime by remember { mutableLongStateOf(0L) }

    // Text Analyzer
    val imageAnalyzer = remember {
        ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also { analysis ->
                analysis.setAnalyzer(cameraExecutor) { imageProxy ->
                    if (captureInProgress) {
                        imageProxy.close()
                        return@setAnalyzer
                    }
                    
                    val currentTime = System.currentTimeMillis()
                    // Throttle OCR to run max 2 times per second
                    if (currentTime - lastAnalyzeTime < 500) {
                        imageProxy.close()
                        return@setAnalyzer
                    }
                    lastAnalyzeTime = currentTime

                    @androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
                    val mediaImage = imageProxy.image
                    if (mediaImage != null) {
                        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                        recognizer.process(image)
                            .addOnSuccessListener { visionText ->
                                val text = visionText.text
                                
                                // Basic regex to find 16-digit NIK
                                val nikRegex = Regex("\\b\\d{16}\\b")
                                val match = nikRegex.find(text)
                                
                                if (match != null) {
                                    val nik = match.value
                                    // Extremely basic heuristic to find name (usually the line after NIK or containing uppercase)
                                    val lines = text.split("\n")
                                    var extractedName = ""
                                    for (i in lines.indices) {
                                        if (lines[i].contains("Nama", ignoreCase = true) && i + 1 < lines.size) {
                                            extractedName = lines[i+1].replace(Regex("[^A-Za-z ]"), "").trim()
                                            break
                                        } else if (lines[i].contains(nik) && i + 1 < lines.size) {
                                            // Fallback: take next line
                                            extractedName = lines[i+1].replace(Regex("[^A-Za-z ]"), "").trim()
                                        }
                                    }
                                    if (extractedName.length < 3) {
                                        // Attempt another fallback
                                        extractedName = lines.firstOrNull { it.length > 5 && it == it.uppercase() && !it.contains("PROVINSI") && !it.contains("KABUPATEN") } ?: ""
                                    }
                                    
                                    detectedData = KtpData(nik, extractedName)
                                }
                            }
                            .addOnCompleteListener {
                                imageProxy.close()
                            }
                    } else {
                        imageProxy.close()
                    }
                }
            }
    }

    LaunchedEffect(detectedData) {
        if (detectedData != null && !captureInProgress) {
            captureInProgress = true
            instructionText = "KTP terdeteksi! Mengambil foto..."
            delay(800) // Brief pause to let user hold still
            takePhoto(context, imageCapture, cameraExecutor) { bitmap ->
                if (bitmap != null) {
                    onSuccess(bitmap, detectedData)
                } else {
                    captureInProgress = false
                    detectedData = null
                    instructionText = "Gagal memotret, coba lagi."
                }
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                }

                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

                val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

                try {
                    val cameraProvider = cameraProviderFuture.get()
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        cameraSelector,
                        preview,
                        imageCapture,
                        imageAnalyzer
                    )
                } catch (e: Exception) {
                    Log.e("KtpScanner", "Use case binding failed", e)
                }

                previewView
            },
            modifier = Modifier.fillMaxSize()
        )

        // Overlay & UI Elements
        KtpOverlay(isSuccess = captureInProgress)

        // Instruction Text
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 80.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Card(
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = Color.Black.copy(alpha = 0.6f)),
                modifier = Modifier.padding(horizontal = 24.dp)
            ) {
                Text(
                    text = instructionText,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    modifier = Modifier.padding(horizontal = 24.dp, vertical = 12.dp)
                )
            }
        }

        // Manual capture button (in case OCR fails to find NIK but user wants to snap anyway)
        if (!captureInProgress) {
            Button(
                onClick = {
                    captureInProgress = true
                    instructionText = "Mengambil foto manual..."
                    takePhoto(context, imageCapture, cameraExecutor) { bitmap ->
                        if (bitmap != null) {
                            capturedBitmapForManual = bitmap
                            showManualInputDialog = true
                            captureInProgress = false
                        } else {
                            captureInProgress = false
                            instructionText = "Gagal memotret, coba lagi."
                        }
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 40.dp)
            ) {
                Text("Input Manual NIK & Nama")
            }
        }

        // Back Button
        IconButton(
            onClick = {
                cameraExecutor.shutdown()
                onCancel()
            },
            modifier = Modifier
                .padding(16.dp)
                .align(Alignment.TopStart)
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Batal", tint = Color.White)
        }
    }
    
    if (showManualInputDialog && capturedBitmapForManual != null) {
        ManualKtpInputDialog(
            onDismiss = {
                showManualInputDialog = false
                capturedBitmapForManual = null
                instructionText = "Posisikan KTP di dalam kotak"
            },
            onSubmit = { nik, name ->
                showManualInputDialog = false
                onSuccess(capturedBitmapForManual!!, KtpData(nik, name))
            }
        )
    }
}

@Composable
fun ManualKtpInputDialog(
    onDismiss: () -> Unit,
    onSubmit: (String, String) -> Unit
) {
    var nik by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Input Manual Data KTP") },
        text = {
            Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                OutlinedTextField(
                    value = nik,
                    onValueChange = { if (it.length <= 16) nik = it },
                    label = { Text("NIK (16 digit)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                )
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nama Lengkap") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                if (nik.isNotEmpty() && nik.length < 16) {
                    Text(
                        text = "NIK harus 16 digit",
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSubmit(nik, name) },
                enabled = nik.length == 16 && name.isNotBlank()
            ) {
                Text("Simpan")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Batal")
            }
        }
    )
}

@Composable
fun KtpOverlay(isSuccess: Boolean) {
    val borderColor = if (isSuccess) Color.Green else Primary
    Canvas(modifier = Modifier.fillMaxSize()) {
        val width = size.width
        val height = size.height
        
        drawRect(
            color = Color.Black.copy(alpha = 0.6f),
            size = size
        )

        // KTP aspect ratio is roughly 85.6mm x 53.98mm (width > height)
        val rectWidth = width * 0.85f
        val rectHeight = rectWidth * (53.98f / 85.6f)
        val rectLeft = (width - rectWidth) / 2
        val rectTop = (height - rectHeight) / 2

        // Cut out the rectangle
        drawRoundRect(
            color = Color.Transparent,
            topLeft = Offset(rectLeft, rectTop),
            size = Size(rectWidth, rectHeight),
            cornerRadius = CornerRadius(16f, 16f),
            blendMode = BlendMode.Clear
        )

        // Draw border
        drawRoundRect(
            color = borderColor,
            topLeft = Offset(rectLeft, rectTop),
            size = Size(rectWidth, rectHeight),
            cornerRadius = CornerRadius(16f, 16f),
            style = Stroke(width = 6f)
        )
    }
}

private fun takePhoto(
    context: Context,
    imageCapture: ImageCapture,
    executor: ExecutorService,
    onCaptured: (Bitmap?) -> Unit
) {
    imageCapture.takePicture(
        executor,
        object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: androidx.camera.core.ImageProxy) {
                val buffer = image.planes[0].buffer
                val bytes = ByteArray(buffer.remaining())
                buffer.get(bytes)
                val bitmap = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, null)
                
                val matrix = android.graphics.Matrix()
                matrix.postRotate(image.imageInfo.rotationDegrees.toFloat())
                
                val rotatedBitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
                image.close()
                onCaptured(rotatedBitmap)
            }

            override fun onError(exception: ImageCaptureException) {
                Log.e("KtpScanner", "Photo capture failed", exception)
                onCaptured(null)
            }
        }
    )
}
