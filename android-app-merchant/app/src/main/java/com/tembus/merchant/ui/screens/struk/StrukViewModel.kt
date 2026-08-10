package com.tembus.merchant.ui.screens.struk

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.StrukData
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class StrukUiState(
    val struk: StrukData? = null,
    val qrBitmap: Bitmap? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class StrukViewModel(
    private val merchantRepository: MerchantRepository,
    private val orderId: String
) : ViewModel() {

    private val _uiState = MutableStateFlow(StrukUiState())
    val uiState: StateFlow<StrukUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.getStruk(orderId)
                .onSuccess { struk ->
                    _uiState.value = _uiState.value.copy(
                        struk = struk,
                        qrBitmap = decodeQrDataUri(struk.qrCodeDataUri),
                        isLoading = false
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = e.message ?: "Gagal memuat struk",
                        isLoading = false
                    )
                }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    companion object {
        /**
         * Decode QR data URI dari backend: "data:image/png;base64,...." → Bitmap.
         */
        fun decodeQrDataUri(dataUri: String): Bitmap? {
            if (dataUri.isBlank()) return null
            val base64Part = dataUri.substringAfter(",", dataUri)
            return runCatching {
                val bytes = Base64.decode(base64Part, Base64.DEFAULT)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            }.getOrNull()
        }
    }
}
