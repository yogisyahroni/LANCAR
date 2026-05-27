package com.lancar.courier.ui.screens.scan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lancar.courier.data.api.TEMBUSApiService
import com.lancar.courier.data.model.ScanRequest
import com.lancar.courier.data.model.ScanResponse
import com.lancar.courier.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject

/**
 * Scan View Model
 * 
 * Manages package scanning state and API calls.
 */
@HiltViewModel
class ScanViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val apiService: TEMBUSApiService
) : ViewModel() {

    private val _uiState = MutableStateFlow<ScanUiState>(ScanUiState.Idle)
    val uiState: StateFlow<ScanUiState> = _uiState.asStateFlow()

    /**
     * Process a scanned barcode
     */
    fun processScan(
        orderId: String,
        latitude: Double,
        longitude: Double,
        accuracy: Float?,
        scanType: String = "pickup",
        barcodeValue: String? = null
    ) {
        viewModelScope.launch {
            _uiState.value = ScanUiState.Loading
            try {
                val request = ScanRequest(
                    orderId = orderId,
                    scanType = scanType,
                    latitude = latitude,
                    longitude = longitude,
                    accuracy = accuracy,
                    barcodeValue = barcodeValue,
                    spoofRisk = accuracy?.let { if (it > 50f) "low_accuracy" else "normal" } ?: "unknown_accuracy"
                )
                
                val response = apiService.scanPackage(request)
                
                if (response.isSuccessful && response.body()?.success == true) {
                    val scanData = response.body()?.data
                    if (scanData != null) {
                        orderRepository.saveScanLocally(orderId, latitude, longitude, scanType)
                        _uiState.value = ScanUiState.Success(scanData)
                    } else {
                        _uiState.value = ScanUiState.Error("Respons verifikasi tidak valid. Coba lagi.")
                    }
                } else {
                    _uiState.value = ScanUiState.Error(response.errorMessage())
                }
            } catch (e: Exception) {
                _uiState.value = ScanUiState.Error("Verifikasi membutuhkan koneksi dan lokasi aktif. Coba lagi.")
            }
        }
    }

    private fun retrofit2.Response<*>.errorMessage(): String {
        val fallback = "Verifikasi ditolak. Pastikan Anda berada di titik yang benar."
        val raw = errorBody()?.string() ?: return fallback
        return try {
            Json.parseToJsonElement(raw).jsonObject["message"]?.jsonPrimitive?.content ?: fallback
        } catch (_: Exception) {
            fallback
        }
    }

    /**
     * Reset UI state to idle
     */
    fun resetState() {
        _uiState.value = ScanUiState.Idle
    }
}

/**
 * UI State for Scan Screen
 */
sealed class ScanUiState {
    object Idle : ScanUiState()
    object Loading : ScanUiState()
    data class Success(val scanData: ScanResponse) : ScanUiState()
    data class Error(val message: String) : ScanUiState()
}
