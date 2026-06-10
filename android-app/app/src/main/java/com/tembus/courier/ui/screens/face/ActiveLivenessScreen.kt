package com.tembus.courier.ui.screens.face

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import android.view.ViewGroup
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.tembus.courier.ui.security.SecureScreenEffect
import com.tembus.courier.ui.theme.Primary
import kotlinx.coroutines.delay
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

enum class LivenessChallenge {
    ALIGN_FACE,
    BLINK,
    TURN_LEFT_OR_RIGHT,
    SUCCESS
}

@Composable
fun ActiveLivenessScreen(
    onSuccess: (Bitmap) -> Unit,
    onCancel: () -> Unit
) {
    SecureScreenEffect()

    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var challenge by remember { mutableStateOf(LivenessChallenge.ALIGN_FACE) }
    var instructionText by remember { mutableStateOf("Posisikan wajah di dalam oval") }
    var isSuccess by remember { mutableStateOf(false) }

    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    val imageCapture = remember { ImageCapture.Builder().build() }

    var blinkStarted by remember { mutableStateOf(false) }
    var captureInProgress by remember { mutableStateOf(false) }

    val onFaceMetrics = { metrics: FaceMetrics ->
        if (!isSuccess && !captureInProgress) {
            if (!metrics.faceFound) {
                if (challenge != LivenessChallenge.ALIGN_FACE) {
                    challenge = LivenessChallenge.ALIGN_FACE
                }
                instructionText = "Wajah tidak terdeteksi. Posisikan di dalam oval."
            } else {
                when (challenge) {
                    LivenessChallenge.ALIGN_FACE -> {
                        instructionText = "Tahan posisi..."
                        // Move to next challenge automatically if aligned
                        challenge = LivenessChallenge.BLINK
                        instructionText = "Kedipkan mata Anda"
                    }
                    LivenessChallenge.BLINK -> {
                        // Both eyes closed probability high (low open probability)
                        if (metrics.leftEyeOpenProbability < 0.3f && metrics.rightEyeOpenProbability < 0.3f) {
                            blinkStarted = true
                        } else if (blinkStarted && metrics.leftEyeOpenProbability > 0.8f && metrics.rightEyeOpenProbability > 0.8f) {
                            // Blink completed
                            challenge = LivenessChallenge.TURN_LEFT_OR_RIGHT
                            instructionText = "Tengok perlahan ke salah satu sisi"
                        } else {
                            instructionText = "Kedipkan mata Anda"
                        }
                    }
                    LivenessChallenge.TURN_LEFT_OR_RIGHT -> {
                        // Check EulerAngleY for head turn (e.g. > 20 or < -20)
                        if (metrics.headEulerAngleY > 20f || metrics.headEulerAngleY < -20f) {
                            challenge = LivenessChallenge.SUCCESS
                            instructionText = "Verifikasi Berhasil! Mengambil foto..."
                            isSuccess = true
                        } else {
                            instructionText = "Tengok perlahan ke salah satu sisi"
                        }
                    }
                    LivenessChallenge.SUCCESS -> {
                        // Already handled
                    }
                }
            }
        }
    }

    // Capture photo when SUCCESS is reached
    LaunchedEffect(isSuccess) {
        if (isSuccess && !captureInProgress) {
            captureInProgress = true
            delay(500) // wait half a second for user to look back at camera
            
            // Note: In a real advanced setup we'd extract the bitmap from the proxy,
            // but for simplicity we trigger ImageCapture here.
            takePhoto(context, imageCapture, cameraExecutor) { bitmap ->
                if (bitmap != null) {
                    onSuccess(bitmap)
                } else {
                    // Fallback to error if capture fails
                    isSuccess = false
                    captureInProgress = false
                    challenge = LivenessChallenge.ALIGN_FACE
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

                val imageAnalyzer = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .also {
                        it.setAnalyzer(cameraExecutor, FaceAnalyzer(onFaceDetected = onFaceMetrics))
                    }

                // Default to front camera
                val cameraSelector = CameraSelector.DEFAULT_FRONT_CAMERA

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
                    Log.e("ActiveLiveness", "Use case binding failed", e)
                }

                previewView
            },
            modifier = Modifier.fillMaxSize()
        )

        // Overlay & UI Elements
        LivenessOverlay(challenge = challenge)

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

        if (isSuccess) {
            Box(
                modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = "Success",
                        tint = Color.Green,
                        modifier = Modifier.size(80.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Memproses...", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }

        // Back Button
        IconButton(
            onClick = onCancel,
            modifier = Modifier
                .padding(16.dp)
                .align(Alignment.TopStart)
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Batal", tint = Color.White)
        }
    }
}

@Composable
fun LivenessOverlay(challenge: LivenessChallenge) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.8f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse_alpha"
    )

    val ovalColor = when (challenge) {
        LivenessChallenge.SUCCESS -> Color.Green
        LivenessChallenge.TURN_LEFT_OR_RIGHT -> Primary
        LivenessChallenge.BLINK -> Color.Yellow
        else -> Color.White.copy(alpha = pulseAlpha)
    }

    Canvas(modifier = Modifier.fillMaxSize()) {
        val width = size.width
        val height = size.height
        
        // Draw semi-transparent background
        drawRect(
            color = Color.Black.copy(alpha = 0.7f),
            size = size
        )

        val ovalWidth = width * 0.75f
        val ovalHeight = ovalWidth * 1.3f
        val ovalLeft = (width - ovalWidth) / 2
        val ovalTop = (height - ovalHeight) / 2

        // Cut out the oval (Clear blend mode makes it transparent)
        drawRoundRect(
            color = Color.Transparent,
            topLeft = Offset(ovalLeft, ovalTop),
            size = Size(ovalWidth, ovalHeight),
            cornerRadius = CornerRadius(ovalWidth / 2, ovalHeight / 2),
            blendMode = BlendMode.Clear
        )

        // Draw oval border
        drawRoundRect(
            color = ovalColor,
            topLeft = Offset(ovalLeft, ovalTop),
            size = Size(ovalWidth, ovalHeight),
            cornerRadius = CornerRadius(ovalWidth / 2, ovalHeight / 2),
            style = Stroke(width = 8f)
        )
        
        // Draw corner guides
        val guideLength = 60f
        val guideStroke = 12f
        val guideColor = Primary

        // Top Left
        drawLine(guideColor, Offset(ovalLeft, ovalTop + guideLength), Offset(ovalLeft, ovalTop), strokeWidth = guideStroke, cap = StrokeCap.Round)
        drawLine(guideColor, Offset(ovalLeft, ovalTop), Offset(ovalLeft + guideLength, ovalTop), strokeWidth = guideStroke, cap = StrokeCap.Round)

        // Top Right
        drawLine(guideColor, Offset(ovalLeft + ovalWidth - guideLength, ovalTop), Offset(ovalLeft + ovalWidth, ovalTop), strokeWidth = guideStroke, cap = StrokeCap.Round)
        drawLine(guideColor, Offset(ovalLeft + ovalWidth, ovalTop), Offset(ovalLeft + ovalWidth, ovalTop + guideLength), strokeWidth = guideStroke, cap = StrokeCap.Round)

        // Bottom Left
        drawLine(guideColor, Offset(ovalLeft, ovalTop + ovalHeight - guideLength), Offset(ovalLeft, ovalTop + ovalHeight), strokeWidth = guideStroke, cap = StrokeCap.Round)
        drawLine(guideColor, Offset(ovalLeft, ovalTop + ovalHeight), Offset(ovalLeft + guideLength, ovalTop + ovalHeight), strokeWidth = guideStroke, cap = StrokeCap.Round)

        // Bottom Right
        drawLine(guideColor, Offset(ovalLeft + ovalWidth - guideLength, ovalTop + ovalHeight), Offset(ovalLeft + ovalWidth, ovalTop + ovalHeight), strokeWidth = guideStroke, cap = StrokeCap.Round)
        drawLine(guideColor, Offset(ovalLeft + ovalWidth, ovalTop + ovalHeight), Offset(ovalLeft + ovalWidth, ovalTop + ovalHeight - guideLength), strokeWidth = guideStroke, cap = StrokeCap.Round)
    }
}

// Extension to take photo
private fun takePhoto(
    context: Context,
    imageCapture: ImageCapture,
    executor: ExecutorService,
    onCaptured: (Bitmap?) -> Unit
) {
    // Basic implementation: take picture to memory
    imageCapture.takePicture(
        executor,
        object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: androidx.camera.core.ImageProxy) {
                // Convert ImageProxy to Bitmap
                val buffer = image.planes[0].buffer
                val bytes = ByteArray(buffer.remaining())
                buffer.get(bytes)
                val bitmap = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, null)
                
                // Rotation handling
                val matrix = android.graphics.Matrix()
                matrix.postRotate(image.imageInfo.rotationDegrees.toFloat())
                // Mirror horizontally for front camera
                matrix.preScale(-1f, 1f)
                
                val rotatedBitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
                image.close()
                onCaptured(rotatedBitmap)
            }

            override fun onError(exception: ImageCaptureException) {
                Log.e("ActiveLiveness", "Photo capture failed", exception)
                onCaptured(null)
            }
        }
    )
}
