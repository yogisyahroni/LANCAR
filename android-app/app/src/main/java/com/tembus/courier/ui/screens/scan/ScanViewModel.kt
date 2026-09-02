package com.tembus.courier.ui.screens.scan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.api.withRequestReference
import com.tembus.courier.data.model.ProofTokenIssueRequest
import com.tembus.courier.data.model.ProofTokenIssueResponse
import com.tembus.courier.data.model.ScanRequest
import com.tembus.courier.data.model.ScanResponse
import com.tembus.courier.data.repository.OrderRepository
import com.tembus.courier.domain.CourierProofTypes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
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
     * Process a scanned barcode.
     *
     * After a successful pickup scan the backend proof matrix (CORE-2026-006)
     * requires a one-time custody token. The token is issued here and persisted
     * locally so [ProofOfDeliveryViewModel] can verify it when uploading POD.
     */
    fun processScan(
        orderId: String,
        latitude: Double,
        longitude: Double,
        accuracy: Float?,
        scanType: String = CourierProofTypes.PICKUP_SCAN,
        barcodeValue: String? = null,
        handoffToken: String? = null
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
                    packageCode = barcodeValue,
                    handoffToken = handoffToken,
                    spoofRisk = accuracy?.let { if (it > 50f) "low_accuracy" else "normal" } ?: "unknown_accuracy"
                )

                val response = apiService.scanPackage(
                    idempotencyKey = "courier-scan-$orderId-$scanType-${UUID.randomUUID()}",
                    request = request
                )

                if (response.isSuccessful && response.body()?.success == true) {
                    val scanData = response.body()?.data
                    if (scanData == null) {
                        _uiState.value = ScanUiState.Error("Respons verifikasi tidak valid. Coba lagi.")
                        return@launch
                    }
                    orderRepository.saveScanLocally(orderId, latitude, longitude, scanType, synced = true)

                    // CORE-2026-006: issue one-time proof token after pickup scan.
                    if (CourierProofTypes.isPickupProof(scanType)) {
                        val tokenResult = issueProofToken(orderId, scanType)
                        tokenResult.onSuccess { token ->
                            orderRepository.saveProofToken(orderId, token.tokenId, token.plaintext, token.stage)
                            _uiState.value = ScanUiState.ScanSuccessWithToken(scanData, token)
                        }
                        tokenResult.onFailure {
                            _uiState.value = ScanUiState.ScanSuccess(scanData)
                        }
                    } else {
                        _uiState.value = ScanUiState.ScanSuccess(scanData)
                    }
                } else {
                    _uiState.value = ScanUiState.Error(response.errorMessage())
                }
            } catch (e: Exception) {
                _uiState.value = ScanUiState.Error("Verifikasi membutuhkan koneksi dan lokasi aktif. Coba lagi.")
            }
        }
    }

    /**
     * Issue a one-time proof token for the given [stage] via the backend
     * proof chain-of-custody service (CORE-2026-006).
     */
    private suspend fun issueProofToken(orderId: String, stage: String): Result<ProofTokenIssueResponse> {
        return try {
            val proofStage = when (stage) {
                CourierProofTypes.PICKUP_SCAN,
                CourierProofTypes.PICKUP_PHOTO,
                CourierProofTypes.PICKUP_OTP -> "picked_up"
                else -> stage
            }
            val request = ProofTokenIssueRequest(stage = proofStage, tokenFormat = "numeric_6")
            val response = apiService.issueProofToken(orderId = orderId, request = request)
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) Result.success(body)
                else Result.failure(IllegalStateException("Token tidak valid"))
            } else {
                Result.failure(IllegalStateException(response.errorMessage()))
            }
        } catch (e: Exception) {
            Result.failure(e)
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
    data class ScanSuccess(val scanData: ScanResponse) : ScanUiState()
    data class ScanSuccessWithToken(val scanData: ScanResponse, val token: ProofTokenIssueResponse) : ScanUiState()
    data class Error(val message: String) : ScanUiState()
}
