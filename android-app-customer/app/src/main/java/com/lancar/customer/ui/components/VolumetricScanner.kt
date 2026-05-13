package com.lancar.customer.ui.components

import android.annotation.SuppressLint
import android.util.Size
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.objects.ObjectDetection
import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions
import java.util.concurrent.Executors
import kotlin.math.roundToInt

@Composable
fun VolumetricScanner(
    onDimensionsDetected: (Int, Int, Int) -> Unit,
    onClose: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    
    var detectedBox by remember { mutableStateOf<android.graphics.Rect?>(null) }
    var detectedDimensions by remember { mutableStateOf(Triple(0, 0, 0)) }

    Box(modifier = Modifier.fillMaxSize()) {
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx)
                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)

                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()
                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }

                    val imageAnalyzer = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .setTargetResolution(Size(1280, 720))
                        .build()
                        .also {
                            it.setAnalyzer(cameraExecutor) { imageProxy ->
                                processImageProxy(imageProxy) { box ->
                                    detectedBox = box
                                    // Mock dimension estimation logic based on bounding box size
                                    // In a real high-end enterprise app, we'd use ARCore for precision
                                    box?.let {
                                        val l = (it.width() * 0.1).roundToInt().coerceAtLeast(10)
                                        val w = (it.height() * 0.1).roundToInt().coerceAtLeast(10)
                                        val h = 15 // Mock depth
                                        detectedDimensions = Triple(l, w, h)
                                    }
                                }
                            }
                        }

                    val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

                    try {
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            cameraSelector,
                            preview,
                            imageAnalyzer
                        )
                    } catch (exc: Exception) {
                        exc.printStackTrace()
                    }
                }, ContextCompat.getMainExecutor(ctx))
                previewView
            },
            modifier = Modifier.fillMaxSize()
        )

        // Overlay with Bounding Box
        Canvas(modifier = Modifier.fillMaxSize()) {
            detectedBox?.let { box ->
                // Coordinate transformation from image to view
                // Simplified for demo:
                val strokeWidth = 4.dp.toPx()
                drawRect(
                    color = Color.Cyan,
                    topLeft = Offset(box.left.toFloat() * 2, box.top.toFloat() * 2),
                    size = androidx.compose.ui.geometry.Size(box.width().toFloat() * 2, box.height().toFloat() * 2),
                    style = Stroke(width = strokeWidth)
                )
            }
        }

        // UI Controls
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(24.dp)
                .background(Color.Black.copy(alpha = 0.7f), RoundedCornerShape(20.dp))
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                "Package Detected",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp
            )
            Text(
                "${detectedDimensions.first} x ${detectedDimensions.second} x ${detectedDimensions.third} cm",
                color = Color.Cyan,
                fontSize = 24.sp,
                fontWeight = FontWeight.ExtraBold
            )
            Spacer(modifier = Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = onClose,
                    colors = ButtonDefaults.buttonColors(containerColor = Color.DarkGray)
                ) {
                    Text("Batal")
                }
                Button(
                    onClick = { 
                        onDimensionsDetected(detectedDimensions.first, detectedDimensions.second, detectedDimensions.third)
                        onClose()
                    }
                ) {
                    Text("Gunakan Dimensi")
                }
            }
        }
    }
}

@SuppressLint("UnsafeOptInUsageError")
private fun processImageProxy(
    imageProxy: ImageProxy,
    onBoxDetected: (android.graphics.Rect?) -> Unit
) {
    val mediaImage = imageProxy.image
    if (mediaImage != null) {
        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
        
        val options = ObjectDetectorOptions.Builder()
            .setDetectorMode(ObjectDetectorOptions.STREAM_MODE)
            .enableClassification() // Optional
            .build()
        
        val objectDetector = ObjectDetection.getClient(options)
        
        objectDetector.process(image)
            .addOnSuccessListener { detectedObjects ->
                onBoxDetected(detectedObjects.firstOrNull()?.boundingBox)
            }
            .addOnFailureListener {
                onBoxDetected(null)
            }
            .addOnCompleteListener {
                imageProxy.close()
            }
    } else {
        imageProxy.close()
    }
}
