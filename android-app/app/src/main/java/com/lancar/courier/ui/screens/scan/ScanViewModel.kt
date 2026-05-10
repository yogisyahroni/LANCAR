package com.lancar.courier.ui.screens.scan

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lancar.courier.data.api.ApiClient
import com.lancar.courier.data.model.ScanRequest
import com.lancar.courier.data.model.ScanResponse
import com.lancar.courier.data.repository.OrderRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Scan View Model
 * 
 * Manages package scanning state and API calls.
 */
class ScanViewModel(application: Application) : AndroidViewModel(application) {

    private val apiService = ApiClient.apiService
    private val orderRepository = OrderRepository(application)

    private val _uiState = MutableStateFlow<ScanUiState>(ScanUiState.Idle)
    val uiState: StateFlow<ScanUiState> = _uiState.asStateFlow()

    /**
     * Process a scanned barcode
     */
    fun processScan(orderId: String, latitude: Double, longitude: Double, scanType: String = "pickup") {
        viewModelScope.launch {
            _uiState.value = ScanUiState.Loading
            try {
                // Offline first: Save locally
                orderRepository.saveScanLocally(orderId, latitude, longitude, scanType)
                
                // Then try to sync immediately
                val request = ScanRequest(
                    orderId = orderId,
                    scanType = scanType,
                    latitude = latitude,
                    longitude = longitude
                )
                
                val response = apiService.scanPackage(request)
                
                if (response.isSuccessful && response.body()?.success == true) {
                    val scanData = response.body()?.data
                    if (scanData != null) {
                        _uiState.value = ScanUiState.Success(scanData)
                    } else {
                        // Even if response format is invalid, we saved locally.
                        val fallbackData = ScanResponse(orderId = orderId, scanType = scanType, timestamp = System.currentTimeMillis().toString(), status = "picked_up")
                        _uiState.value = ScanUiState.Success(fallbackData)
                    }
                } else {
                    // API failed, but we saved locally, so it's a success for offline-first.
                    val fallbackData = ScanResponse(orderId = orderId, scanType = scanType, timestamp = System.currentTimeMillis().toString(), status = "picked_up")
                    _uiState.value = ScanUiState.Success(fallbackData)
                }
            } catch (e: Exception) {
                // Network error, but we saved locally.
                val fallbackData = ScanResponse(orderId = orderId, scanType = scanType, timestamp = System.currentTimeMillis().toString(), status = "picked_up")
                _uiState.value = ScanUiState.Success(fallbackData)
            }
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
