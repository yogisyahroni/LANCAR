package com.tembus.courier.ui.screens.service

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.model.CourierCapabilityUpgradeRequest
import com.tembus.courier.data.model.CourierServicePrice
import com.tembus.courier.data.model.CourierServicePriceUpdateRequest
import com.tembus.courier.data.repository.RoadsideRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject
import retrofit2.Response
import javax.inject.Inject

data class ServiceUpgradeUiState(
    val isLoading: Boolean = false,
    val isError: Boolean = false,
    val message: String? = null,
    val servicePrices: List<CourierServicePrice> = emptyList(),
    val savingPriceCode: String? = null
)

@HiltViewModel
class ServiceUpgradeViewModel @Inject constructor(
    private val apiService: TEMBUSApiService,
    private val roadsideRepository: RoadsideRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ServiceUpgradeUiState())
    val uiState: StateFlow<ServiceUpgradeUiState> = _uiState.asStateFlow()

    var proofImageUrl by mutableStateOf("")

    fun clearProofImage() {
        proofImageUrl = ""
    }

    fun setMessage(message: String, isError: Boolean) {
        _uiState.update { it.copy(isError = isError, message = message) }
    }

    fun uploadProofImage(photo: Bitmap) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, isError = false, message = null) }
            roadsideRepository.uploadCapabilityEvidence(photo)
                .onSuccess { upload ->
                    proofImageUrl = upload.storageKey
                    _uiState.update { it.copy(isLoading = false, message = "Foto kamera berhasil disimpan dengan aman.") }
                }
                .onFailure { error ->
                    _uiState.update { it.copy(isLoading = false, isError = true, message = error.message ?: "Foto kamera gagal disimpan.") }
                }
        }
    }

    init {
        loadServicePrices()
    }

    fun loadServicePrices() {
        viewModelScope.launch {
            roadsideRepository.getServicePrices().onSuccess { prices ->
                _uiState.update { it.copy(servicePrices = prices) }
            }
        }
    }

    fun saveServicePrice(
        serviceCode: String,
        priceAmount: Long,
        perKmRateIdr: Long,
        tollEntryIdr: Long,
        tollExitIdr: Long,
        pricePerHoleIdr: Long = 0L,
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(savingPriceCode = serviceCode, isError = false, message = null) }
            roadsideRepository.updateServicePrice(
                CourierServicePriceUpdateRequest(
                    serviceCode = serviceCode,
                    priceAmount = priceAmount,
                    pricePerHoleIdr = pricePerHoleIdr,
                    perKmRateIdr = perKmRateIdr,
                    tollEntryIdr = tollEntryIdr,
                    tollExitIdr = tollExitIdr,
                )
            )
                .onSuccess { saved ->
                    _uiState.update { state ->
                        state.copy(
                            savingPriceCode = null,
                            servicePrices = state.servicePrices.map { if (it.serviceCode == saved.serviceCode) saved else it },
                            message = "Harga ${saved.serviceName.ifBlank { saved.serviceCode }} tersimpan dari server."
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update { it.copy(savingPriceCode = null, isError = true, message = error.message ?: "Harga jasa gagal disimpan.") }
                }
        }
    }

    fun requestUpgrade(
        serviceCode: String,
        supportsTubeless: Boolean,
        supportsTube: Boolean,
        hasTireRepairKit: Boolean,
        hasElectricPump: Boolean,
        materialInventory: Map<String, Int>,
        pricePerHoleIdr: Long,
    ) {
        if (proofImageUrl.isBlank()) {
            _uiState.update { it.copy(isError = true, message = "Bukti foto alat wajib diisi") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, isError = false, message = null) }
            try {
                val request = CourierCapabilityUpgradeRequest(
                    serviceCode = serviceCode,
                    proofImageUrl = proofImageUrl.trim(),
                    supportsTubeless = supportsTubeless,
                    supportsTube = supportsTube,
                    hasTireRepairKit = hasTireRepairKit,
                    hasElectricPump = hasElectricPump,
                    materialInventory = materialInventory,
                    pricePerHoleIdr = pricePerHoleIdr,
                )
                val response = apiService.requestCourierCapabilityUpgrade(request)
                if (response.isSuccessful && response.body()?.success == true) {
                    _uiState.update { it.copy(isLoading = false, message = "Pengajuan Tambal Ban berhasil dikirim. Layanan aktif setelah review dan persetujuan admin.") }
                } else {
                    _uiState.update { it.copy(isLoading = false, isError = true, message = responseErrorMessage(response)) }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isError = true,
                        message = "Pengajuan belum terkirim. ${e.message?.takeIf { message -> message.isNotBlank() } ?: "Periksa koneksi lalu coba lagi."}",
                    )
                }
            }
        }
    }

    private fun responseErrorMessage(response: Response<*>): String {
        val body = runCatching { response.errorBody()?.string() }.getOrNull().orEmpty()
        val payload = runCatching { JSONObject(body) }.getOrNull()
        val serverMessage = payload?.optString("message")?.takeIf { it.isNotBlank() }
            ?: payload?.optString("error")?.takeIf { it.isNotBlank() }
        val code = payload?.optString("code")?.takeIf { it.isNotBlank() }
        return when {
            serverMessage != null && code != null -> "Gagal mengirim pengajuan: $serverMessage ($code)."
            serverMessage != null -> "Gagal mengirim pengajuan: $serverMessage."
            response.code() > 0 -> "Gagal mengirim pengajuan (HTTP ${response.code()}). Periksa data lalu coba lagi."
            else -> "Gagal mengirim pengajuan. Periksa koneksi lalu coba lagi."
        }
    }
}
