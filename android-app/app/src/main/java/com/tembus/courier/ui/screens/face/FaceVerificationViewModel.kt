package com.tembus.courier.ui.screens.face

import android.content.Context
import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.api.TEMBUSApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.util.UUID
import javax.inject.Inject

data class FaceVerificationUiState(
    val isLoading: Boolean = false,
    val isVerified: Boolean = false,
    val capturedBitmap: Bitmap? = null,
    val error: String? = null,
    val attemptsLeft: Int = 3
)

@HiltViewModel
class FaceVerificationViewModel @Inject constructor(
    private val apiService: TEMBUSApiService,
    @ApplicationContext private val appContext: Context
) : ViewModel() {

    private val _uiState = MutableStateFlow(FaceVerificationUiState())
    val uiState: StateFlow<FaceVerificationUiState> = _uiState.asStateFlow()

    fun onPhotoCaptured(bitmap: Bitmap) {
        _uiState.update { it.copy(capturedBitmap = bitmap, error = null) }
    }

    fun clearCapture() {
        _uiState.update { it.copy(capturedBitmap = null, error = null) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    /**
     * Kirim foto wajah ke backend untuk diverifikasi.
     * Flow: compress bitmap → multipart → POST /api/v1/courier/face/verify
     */
    fun verifyFace(orderId: String?, verificationType: String, onVerified: () -> Unit) {
        val bitmap = _uiState.value.capturedBitmap
        if (bitmap == null) {
            _uiState.update { it.copy(error = "Belum ada foto wajah. Ambil foto terlebih dahulu.") }
            return
        }

        val currentAttempts = _uiState.value.attemptsLeft
        if (currentAttempts <= 0) {
            _uiState.update { it.copy(error = "Batas percobaan habis. Hubungi operasional.") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val idempotencyKey = "face-verify-${UUID.randomUUID()}"

                val result = withContext(Dispatchers.IO) {
                    // Compress bitmap to JPEG bytes — max 800px di sisi terpanjang untuk hemat bandwidth
                    val scaledBitmap = scaleBitmap(bitmap, maxDim = 800)
                    val baos = ByteArrayOutputStream()
                    scaledBitmap.compress(Bitmap.CompressFormat.JPEG, 85, baos)
                    val jpegBytes = baos.toByteArray()

                    val photoBody = jpegBytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
                    val photoPart = MultipartBody.Part.createFormData("photo", "face_${System.currentTimeMillis()}.jpg", photoBody)

                    val textType = "text/plain".toMediaTypeOrNull()
                    val orderIdPart = orderId?.takeIf { it.isNotBlank() }?.toRequestBody(textType)
                    val verificationTypePart = verificationType.toRequestBody(textType)
                    val livenessScorePart = "0.0".toRequestBody(textType) // backend menghitung sendiri

                    apiService.verifyCourierFace(
                        idempotencyKey = idempotencyKey,
                        orderId = orderIdPart,
                        verificationType = verificationTypePart,
                        livenessScore = livenessScorePart,
                        photo = photoPart
                    )
                }

                val body = result.body()
                if (result.isSuccessful && body?.success == true) {
                    _uiState.update { it.copy(isLoading = false, isVerified = true, error = null) }
                    onVerified()
                } else {
                    val remaining = currentAttempts - 1
                    val serverMsg = body?.message?.takeIf { it.isNotBlank() }
                    val errorMsg = when {
                        remaining <= 0 -> "Verifikasi gagal. Batas percobaan habis. Hubungi operasional."
                        serverMsg != null -> "$serverMsg ($remaining percobaan tersisa)"
                        else -> "Wajah tidak terverifikasi. Pastikan wajah terlihat jelas dan coba lagi. ($remaining percobaan tersisa)"
                    }
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            capturedBitmap = null,
                            error = errorMsg,
                            attemptsLeft = remaining
                        )
                    }
                }
            } catch (e: java.net.UnknownHostException) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = "Tidak ada koneksi internet. Sambungkan internet dan coba lagi."
                    )
                }
            } catch (e: java.net.SocketTimeoutException) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = "Koneksi terlalu lambat. Coba lagi."
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = "Verifikasi gagal. Coba ambil foto ulang."
                    )
                }
            }
        }
    }

    private fun scaleBitmap(source: Bitmap, maxDim: Int): Bitmap {
        val w = source.width
        val h = source.height
        if (w <= maxDim && h <= maxDim) return source
        val ratio = maxDim.toFloat() / maxOf(w, h)
        val newW = (w * ratio).toInt().coerceAtLeast(1)
        val newH = (h * ratio).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(source, newW, newH, true)
    }
}
