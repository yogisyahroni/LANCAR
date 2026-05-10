package com.lancar.courier.ui.screens.pod

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.camera.core.ImageCapture
import android.app.Application
import androidx.camera.core.ImageCaptureException
import androidx.exifinterface.media.ExifInterface
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.Executor
import com.lancar.courier.data.api.ApiClient
import com.lancar.courier.data.repository.OrderRepository
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
    val compressionRatio: Float = 1.0f,
    val originalFileSize: Long = 0L,
    val compressedFileSize: Long = 0L,
    val error: String? = null,
    val uploadSuccess: Boolean = false
)

class ProofOfDeliveryViewModel(application: Application) : AndroidViewModel(application) {
    
    private val orderRepository = OrderRepository(application)

    private val _uiState = MutableStateFlow(PodUiState())
    val uiState: StateFlow<PodUiState> = _uiState.asStateFlow()
    
    private var originalBitmap: Bitmap? = null
    
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
                        error = "Failed to capture image: ${exception.message}"
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
                    error = "Compression failed: ${e.message}"
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
     * Uploads the PoD image to the backend.
     */
    fun uploadPod(orderId: String) {
        val prepared = prepareForUpload()
        if (prepared == null) {
            _uiState.value = _uiState.value.copy(error = "No image to upload")
            return
        }
        
        val (file, contentType) = prepared
        _uiState.value = _uiState.value.copy(isUploading = true, error = null)
        
        viewModelScope.launch {
            try {
                // Offline first: Save locally
                orderRepository.savePodLocally(orderId, file.absolutePath)

                // Then try to upload immediately
                val requestFile = file.asRequestBody(contentType.toMediaTypeOrNull())
                val body = MultipartBody.Part.createFormData("photo", file.name, requestFile)
                val orderIdPart = orderId.toRequestBody("text/plain".toMediaTypeOrNull())
                
                val response = ApiClient.apiService.uploadPod(orderIdPart, body)
                
                if (response.isSuccessful && response.body()?.success == true) {
                    _uiState.value = _uiState.value.copy(
                        isUploading = false,
                        uploadSuccess = true
                    )
                } else {
                    // API failed, but we saved locally, so it's a success for offline-first.
                    _uiState.value = _uiState.value.copy(
                        isUploading = false,
                        uploadSuccess = true
                    )
                }
            } catch (e: Exception) {
                // Network error, but we saved locally.
                _uiState.value = _uiState.value.copy(
                    isUploading = false,
                    uploadSuccess = true
                )
            }
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
