package com.tembus.courier.ui.screens.service

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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

    fun requestUpgrade() {
        if (proofImageUrl.isBlank()) {
            _uiState.value = ServiceUpgradeUiState(isError = true, message = "URL foto bukti harus diisi")
            return
        }

        viewModelScope.launch {
            _uiState.value = ServiceUpgradeUiState(isLoading = true)
            try {
                val request = CourierCapabilityUpgradeRequest(
                    serviceCode = "TAMBAL_BAN",
                    proofImageUrl = proofImageUrl
                )
                val response = apiService.requestCourierCapabilityUpgrade(request)
                if (response.isSuccessful && response.body()?.success == true) {
                    _uiState.value = ServiceUpgradeUiState(message = "Permintaan upgrade layanan berhasil dikirim. Menunggu persetujuan admin.")
                } else {
                    _uiState.value = ServiceUpgradeUiState(isError = true, message = "Gagal mengirim permintaan: ${response.message()}")
                }
            } catch (e: Exception) {
                _uiState.value = ServiceUpgradeUiState(isError = true, message = "Terjadi kesalahan: ${e.message}")
            }
        }
    }
}
