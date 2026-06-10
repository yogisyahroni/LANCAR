package com.tembus.courier.ui.screens.face

import android.annotation.SuppressLint
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions

data class FaceMetrics(
    val faceFound: Boolean,
    val bounds: android.graphics.Rect? = null,
    val headEulerAngleY: Float = 0f, // Left/Right turn
    val headEulerAngleX: Float = 0f, // Up/Down tilt
    val leftEyeOpenProbability: Float = 1f,
    val rightEyeOpenProbability: Float = 1f,
    val smilingProbability: Float = 0f
)

class FaceAnalyzer(
    private val onFaceDetected: (FaceMetrics) -> Unit
) : ImageAnalysis.Analyzer {

    // Configure ML Kit Face Detector
    // Require landmarks and classification (eyes open, smile)
    private val options = FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
        .build()

    private val detector = FaceDetection.getClient(options)

    @SuppressLint("UnsafeOptInUsageError")
    override fun analyze(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image
        if (mediaImage != null) {
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            
            detector.process(image)
                .addOnSuccessListener { faces ->
                    processFaces(faces)
                }
                .addOnFailureListener { e ->
                    Log.e("FaceAnalyzer", "Face detection failed", e)
                }
                .addOnCompleteListener {
                    imageProxy.close()
                }
        } else {
            imageProxy.close()
        }
    }

    private fun processFaces(faces: List<Face>) {
        if (faces.isEmpty()) {
            onFaceDetected(FaceMetrics(faceFound = false))
            return
        }

        // Just take the largest/first face
        val face = faces.first()
        
        onFaceDetected(
            FaceMetrics(
                faceFound = true,
                bounds = face.boundingBox,
                headEulerAngleY = face.headEulerAngleY,
                headEulerAngleX = face.headEulerAngleX,
                leftEyeOpenProbability = face.leftEyeOpenProbability ?: 1f,
                rightEyeOpenProbability = face.rightEyeOpenProbability ?: 1f,
                smilingProbability = face.smilingProbability ?: 0f
            )
        )
    }
}
