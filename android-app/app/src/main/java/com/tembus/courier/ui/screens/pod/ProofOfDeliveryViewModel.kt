package com.tembus.courier.ui.screens.pod

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.exifinterface.media.ExifInterface
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.Executor
import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.api.withRequestReference
import com.tembus.courier.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * ViewModel for Proof of Delivery (PoD) Camera feature.
 * 
 * Handles image capture, compression, and preparation for upload.
 * Uses CameraX for camera operations and Coil for image loading.
 * 
 * @see ProofOfDeliveryScreen
 */
data class PodUiState(
    val capturedImageUri: Uri? = null,
    val isCapturing: Boolean = false,
    val isUploading: Boolean = false,
    val isCompressed: Boolean = false,
    val isSignatureCaptured: Boolean = false, // Tracks UI stage switch
    val compressionRatio: Float = 1.0f,
    val originalFileSize: Long = 0L,
    val compressedFileSize: Long = 0L,
    val error: String? = null,
    // Idempotency flag: true = PoD already submitted, reject any further upload attempts
    val isUploadSubmitted: Boolean = false,
    // True when saved to local Room DB (offline-first guarantee)
    val podSavedLocally: Boolean = false,
    // True ONLY when backend confirmed receipt (may be false while offline)
    val serverSyncSuccess: Boolean = false,
    val isTorchEnabled: Boolean = false
)

@HiltViewModel
class ProofOfDeliveryViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val apiService: TEMBUSApiService
) : ViewModel() {

    private val _uiState = MutableStateFlow(PodUiState())
    val uiState: StateFlow<PodUiState> = _uiState.asStateFlow()
    
    private var originalBitmap: Bitmap? = null

    /**
     * Toggles the camera flash/torch state.
     */
    fun toggleTorch() {
        _uiState.value = _uiState.value.copy(
            isTorchEnabled = !_uiState.value.isTorchEnabled
        )
    }
    
    /**
     * Captures an image using CameraX and stores it to the app's cache directory.
     * 
     * @param imageCapture CameraX ImageCapture instance
     * @param context Android context for file operations
     * @param executor Executor for callback operations
     */
    fun captureImage(
        imageCapture: ImageCapture,
        context: Context,
        executor: Executor
    ) {
        if (_uiState.value.isCapturing) return
        
        _uiState.value = _uiState.value.copy(isCapturing = true, error = null)
        
        val photoFile = createImageFile(context)
        val outputOptions = ImageCapture.OutputFileOptions.Builder(photoFile).build()
        
        imageCapture.takePicture(
            outputOptions,
            executor,
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                    val savedUri = Uri.fromFile(photoFile)
                    _uiState.value = _uiState.value.copy(
                        capturedImageUri = savedUri,
                        isCapturing = false,
                        originalFileSize = photoFile.length()
                    )
                }
                
                override fun onError(exception: ImageCaptureException) {
                    _uiState.value = _uiState.value.copy(
                        isCapturing = false,
                        error = "Foto belum dapat diambil. Periksa kamera lalu coba lagi."
                    )
                }
            }
        )
    }
    
    /**
     * Compresses the captured image to reduce file size while maintaining acceptable quality.
     * 
     * @param context Android context
     * @param quality Compression quality (0-100), default is 80
     * @param maxDimension Maximum width/height in pixels
     */
    fun compressImage(context: Context, quality: Int = 80, maxDimension: Int = 1920) {
        val uri = _uiState.value.capturedImageUri ?: return
        
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(isCompressed = false)
                
                val result = withContext(Dispatchers.IO) {
                    compressImageInternal(context, uri, quality, maxDimension)
                }
                
                _uiState.value = _uiState.value.copy(
                    capturedImageUri = result.compressedUri,
                    isCompressed = true,
                    compressionRatio = result.ratio,
                    compressedFileSize = result.compressedSize
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    error = "Foto belum dapat diproses. Coba ambil ulang."
                )
            }
        }
    }
    
    private suspend fun compressImageInternal(
        context: Context,
        uri: Uri,
        quality: Int,
        maxDimension: Int
    ): CompressionResult {
        return withContext(Dispatchers.IO) {
            val inputStream = context.contentResolver.openInputStream(uri)
            var bitmap = BitmapFactory.decodeStream(inputStream)
            inputStream?.close()
            
            // Fix rotation based on EXIF data
            bitmap = fixRotation(context, uri, bitmap)
            
            // Scale down if necessary
            bitmap = scaleBitmap(bitmap, maxDimension)
            
            // Create compressed file
            val compressedFile = createCompressedImageFile(context)
            val outputStream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, outputStream)
            
            compressedFile.outputStream().use { fileOut ->
                fileOut.write(outputStream.toByteArray())
            }
            
            val originalSize = context.contentResolver.openInputStream(uri)?.use { it.available().toLong() } ?: 0L
            val compressedSize = compressedFile.length()
            val ratio = if (originalSize > 0) originalSize.toFloat() / compressedSize else 1f
            
            bitmap.recycle()
            
            CompressionResult(
                compressedUri = Uri.fromFile(compressedFile),
                ratio = ratio,
                compressedSize = compressedSize
            )
        }
    }
    
    private fun fixRotation(context: Context, uri: Uri, bitmap: Bitmap): Bitmap {
        try {
            val inputStream = context.contentResolver.openInputStream(uri) ?: return bitmap
            val exif = ExifInterface(inputStream)
            inputStream.close()
            
            val orientation = exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            )
            
            val matrix = Matrix()
            when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
                ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
                ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
                else -> return bitmap
            }
            
            val rotatedBitmap = Bitmap.createBitmap(
                bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true
            )
            if (rotatedBitmap != bitmap) {
                bitmap.recycle()
            }
            return rotatedBitmap
        } catch (e: Exception) {
            return bitmap
        }
    }
    
    private fun scaleBitmap(bitmap: Bitmap, maxDimension: Int): Bitmap {
        val width = bitmap.width
        val height = bitmap.height
        
        if (width <= maxDimension && height <= maxDimension) {
            return bitmap
        }
        
        val ratio = minOf(
            maxDimension.toFloat() / width,
            maxDimension.toFloat() / height
        )
        
        val newWidth = (width * ratio).toInt()
        val newHeight = (height * ratio).toInt()
        
        val scaledBitmap = Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
        if (scaledBitmap != bitmap) {
            bitmap.recycle()
        }
        return scaledBitmap
    }
    
    /**
     * Clears the current captured image and resets state.
     */
    fun clearImage() {
        _uiState.value.capturedImageUri?.let { uri ->
            try {
                File(uri.path ?: "").delete()
            } catch (e: Exception) {
                // Ignore deletion errors
            }
        }
        _uiState.value = PodUiState()
    }
    
    /**
     * Prepares the image for upload by creating the multipart request body.
     * 
     * @return Pair of (file, content type) or null if no image
     */
    fun prepareForUpload(): Pair<File, String>? {
        val uri = _uiState.value.capturedImageUri ?: return null
        val file = File(uri.path ?: "") 
        return if (file.exists()) Pair(file, "image/jpeg") else null
    }
    
    /**
     * Gets the bytes of the compressed image for upload.
     */
    fun getImageBytes(context: Context): ByteArray? {
        val uri = _uiState.value.capturedImageUri ?: return null
        return try {
            context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * Async stitches signature onto captured POD photo dynamically.
     */
    fun combinePhotoAndSignature(context: Context, signature: Bitmap) {
        val uri = _uiState.value.capturedImageUri ?: return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isUploading = true, error = null)
            try {
                val resultUri = withContext(Dispatchers.IO) {
                    combinePhotoAndSignatureInternal(context, uri, signature)
                }
                _uiState.value = _uiState.value.copy(
                    capturedImageUri = resultUri,
                    isSignatureCaptured = true,
                    isUploading = false,
                    // Force recompute of size properties
                    originalFileSize = File(resultUri.path ?: "").length()
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isUploading = false,
                    error = "Bukti serah terima belum dapat diproses. Coba ambil ulang."
                )
            }
        }
    }

    private suspend fun combinePhotoAndSignatureInternal(
        context: Context,
        photoUri: Uri,
        signature: Bitmap
    ): Uri {
        return withContext(Dispatchers.IO) {
            // Step 1: Query dimensions without loading into memory
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            context.contentResolver.openInputStream(photoUri)?.use {
                BitmapFactory.decodeStream(it, null, options)
            }

            // Step 2: Compute suitable inSampleSize to target max width of 1280px
            val reqWidth = 1280
            var inSampleSize = 1
            if (options.outWidth > reqWidth) {
                val halfWidth = options.outWidth / 2
                while ((halfWidth / inSampleSize) >= reqWidth) {
                    inSampleSize *= 2
                }
            }

            // Step 3: Decode with optimal sub-sampling to keep Heap RAM footprint low
            val decodeOptions = BitmapFactory.Options().apply {
                inSampleSize = inSampleSize
            }
            val original = context.contentResolver.openInputStream(photoUri)?.use {
                BitmapFactory.decodeStream(it, null, decodeOptions)
            }

            // Safety sanity guard
            if (original == null) throw IllegalStateException("Invalid backing bitmap source.")

            // Append the signature area beneath the photo
            // Scale signature preserving aspect ratio to match photo width
            val targetSigHeight = (original.width * (signature.height.toFloat() / signature.width.toFloat())).toInt()
            val scaledSignature = Bitmap.createScaledBitmap(signature, original.width, targetSigHeight, true)

            val labelSectionHeight = (original.width * 0.06f).coerceAtLeast(60f).toInt()
            val finalHeight = original.height + targetSigHeight + labelSectionHeight

            val finalBitmap = Bitmap.createBitmap(
                original.width,
                finalHeight,
                Bitmap.Config.ARGB_8888
            )
            
            val canvas = Canvas(finalBitmap)
            canvas.drawColor(Color.WHITE) // Background fills non-drawn elements
            
            // Stage 1: Draw Photo
            canvas.drawBitmap(original, 0f, 0f, null)
            
            // Stage 2: Draw separation dividing border
            val borderPaint = Paint().apply {
                color = Color.GRAY
                strokeWidth = (original.width * 0.005f).coerceAtLeast(2f)
            }
            canvas.drawLine(0f, original.height.toFloat(), original.width.toFloat(), original.height.toFloat(), borderPaint)
            
            // Stage 3: Write legal label text
            val textPaint = Paint().apply {
                color = Color.DKGRAY
                textSize = (original.width * 0.03f).coerceAtLeast(28f)
                isAntiAlias = true
            }
            canvas.drawText(
                "Penerima & Tanda Tangan Bukti Pengiriman:", 
                20f, 
                original.height + (textPaint.textSize * 1.2f), 
                textPaint
            )

            // Stage 4: Draw signature below label
            canvas.drawBitmap(scaledSignature, 0f, (original.height + labelSectionHeight).toFloat(), null)

            // Overwrite or cache locally
            val finalFile = createCompressedImageFile(context)
            finalFile.outputStream().use { out ->
                finalBitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
            }
            
            original.recycle()
            scaledSignature.recycle()
            finalBitmap.recycle()

            Uri.fromFile(finalFile)
        }
    }

    /**
     * Uploads the PoD image to the backend (Offline-First).
     *
     * IDEMPOTENCY GUARD: Rejects duplicate calls if submission already in progress or completed.
     * This prevents double-submit race conditions on rapid button taps.
     */
    fun uploadPod(orderId: String, latitude: Double, longitude: Double, accuracy: Float?, barcodeValue: String? = null, proofType: String = "delivery") {
        // ── Idempotency Check ──────────────────────────────────────────────────
        val currentState = _uiState.value
        if (currentState.isUploading || currentState.isUploadSubmitted) {
            // Already submitted or currently uploading — silently reject duplicate call
            return
        }

        val prepared = prepareForUpload()
        if (prepared == null) {
            _uiState.value = currentState.copy(error = "Tidak ada foto yang dipilih")
            return
        }

        val (file, contentType) = prepared
        // Mark as submitted IMMEDIATELY to prevent any concurrent calls from slipping through
        _uiState.value = currentState.copy(
            isUploading = true,
            isUploadSubmitted = true,
            error = null
        )

        viewModelScope.launch {
            try {
                val requestFile = file.asRequestBody(contentType.toMediaTypeOrNull())
                val body = MultipartBody.Part.createFormData("photo", file.name, requestFile)
                val orderIdPart = orderId.toRequestBody("text/plain".toMediaTypeOrNull())
                val latitudePart = latitude.toString().toRequestBody("text/plain".toMediaTypeOrNull())
                val longitudePart = longitude.toString().toRequestBody("text/plain".toMediaTypeOrNull())
                val accuracyPart = (accuracy ?: 0f).toString().toRequestBody("text/plain".toMediaTypeOrNull())
                val proofTypePart = proofType.toRequestBody("text/plain".toMediaTypeOrNull())
                val barcodePart = barcodeValue?.toRequestBody("text/plain".toMediaTypeOrNull())
                val spoofRiskPart = (accuracy?.let { if (it > 50f) "low_accuracy" else "normal" } ?: "unknown_accuracy")
                    .toRequestBody("text/plain".toMediaTypeOrNull())

                val response = apiService.uploadPod(orderIdPart, latitudePart, longitudePart, accuracyPart, proofTypePart, barcodePart, spoofRiskPart, body)
                if (!response.isSuccessful || response.body()?.success != true) {
                    _uiState.value = _uiState.value.copy(
                        isUploading = false,
                        isUploadSubmitted = false,
                        error = response.errorMessage()
                    )
                    return@launch
                }

                if (proofType == "pickup") {
                    orderRepository.saveScanLocally(orderId, latitude, longitude, "pickup_photo")
                } else {
                    orderRepository.savePodLocally(orderId, file.absolutePath, latitude, longitude)
                }

                _uiState.value = _uiState.value.copy(
                    isUploading = false,
                    podSavedLocally = true,
                    serverSyncSuccess = true
                )
            } catch (exception: Exception) {
                _uiState.value = _uiState.value.copy(
                    isUploading = false,
                    isUploadSubmitted = false,
                    error = "Verifikasi membutuhkan koneksi dan lokasi aktif. Coba lagi."
                )
            }
        }
    }

    private fun retrofit2.Response<*>.errorMessage(): String {
        val fallback = "Verifikasi ditolak. Pastikan Anda berada di titik yang benar."
        val raw = errorBody()?.string() ?: return fallback.withRequestReference(this)
        return try {
            (Json.parseToJsonElement(raw).jsonObject["message"]?.jsonPrimitive?.content ?: fallback)
                .withRequestReference(this)
        } catch (_: Exception) {
            fallback.withRequestReference(this)
        }
    }
    
    /**
     * Clears any error state.
     */
    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }
    
    private fun createImageFile(context: Context): File {
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(System.currentTimeMillis())
        val storageDir = context.cacheDir
        return File.createTempFile("POD_${timeStamp}_", ".jpg", storageDir)
    }
    
    private fun createCompressedImageFile(context: Context): File {
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(System.currentTimeMillis())
        val storageDir = context.cacheDir
        return File.createTempFile("POD_COMP_${timeStamp}_", ".jpg", storageDir)
    }
    
    private data class CompressionResult(
        val compressedUri: Uri,
        val ratio: Float,
        val compressedSize: Long
    )
}
