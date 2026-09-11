package com.tembus.merchant.ui.screens.ads

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.MerchantAd
import com.tembus.merchant.data.model.MerchantAdRequest
import com.tembus.merchant.data.model.MerchantMarketingPerformance
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AdsUiState(
    val items: List<MerchantAd> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val actionLoadingId: String? = null,
    val createCompleted: Boolean = false,
    val performance: MerchantMarketingPerformance? = null
)

class AdsViewModel(
    private val merchantRepository: MerchantRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AdsUiState())
    val uiState: StateFlow<AdsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.listMerchantAds()
                .onSuccess { items ->
                    _uiState.value = _uiState.value.copy(items = items, isLoading = false)
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = error.message ?: "Gagal memuat iklan"
                    )
                }
            merchantRepository.getMerchantMarketingPerformance("daily")
                .onSuccess { performance -> _uiState.value = _uiState.value.copy(performance = performance) }
        }
    }

    fun create(request: MerchantAdRequest) {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null, createCompleted = false)
        viewModelScope.launch {
            merchantRepository.createMerchantAd("ads-${java.util.UUID.randomUUID()}", request)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(createCompleted = true)
                    load()
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = error.message ?: "Gagal membuat iklan"
                    )
                }
        }
    }

    fun toggleActive(ad: MerchantAd) {
        _uiState.value = _uiState.value.copy(actionLoadingId = ad.id, errorMessage = null)
        viewModelScope.launch {
            val result = if (ad.status.equals("draft", ignoreCase = true)) {
                merchantRepository.transitionMerchantAd(ad.id, "validating", "merchant submitted campaign for policy review").map { true }
            } else {
                merchantRepository.setMerchantAdActive(ad.id, !ad.status.equals("active", ignoreCase = true))
            }
            result
                .onSuccess { load() }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        actionLoadingId = null,
                        errorMessage = error.message ?: "Gagal mengubah status iklan"
                    )
                }
        }
    }

    fun clearCreateCompleted() {
        _uiState.value = _uiState.value.copy(createCompleted = false)
    }

    fun clone(ad: MerchantAd) {
        _uiState.value = _uiState.value.copy(actionLoadingId = ad.id, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.cloneMerchantAd(ad.id)
                .onSuccess { load() }
                .onFailure { error -> _uiState.value = _uiState.value.copy(actionLoadingId = null, errorMessage = error.message ?: "Gagal menyalin kampanye") }
        }
    }

    fun end(ad: MerchantAd) {
        _uiState.value = _uiState.value.copy(actionLoadingId = ad.id, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.transitionMerchantAd(ad.id, "ended", "merchant ended campaign")
                .onSuccess { load() }
                .onFailure { error -> _uiState.value = _uiState.value.copy(actionLoadingId = null, errorMessage = error.message ?: "Gagal mengakhiri kampanye") }
        }
    }
}
