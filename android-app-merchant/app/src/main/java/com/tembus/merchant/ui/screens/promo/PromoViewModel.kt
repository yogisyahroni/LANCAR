package com.tembus.merchant.ui.screens.promo

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.MerchantPromo
import com.tembus.merchant.data.model.MerchantPromoRequest
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PromoUiState(
    val items: List<MerchantPromo> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val actionLoadingId: String? = null,
    val createCompleted: Boolean = false
)

/**
 * PromoViewModel — kelola promo merchant (FB-100): list, buat, toggle aktif, hapus.
 */
class PromoViewModel(
    private val merchantRepository: MerchantRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(PromoUiState())
    val uiState: StateFlow<PromoUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.listPromos(pageSize = 100)
                .onSuccess { items ->
                    _uiState.value = _uiState.value.copy(items = items, isLoading = false)
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = e.message ?: "Gagal memuat promo",
                        isLoading = false
                    )
                }
        }
    }

    fun createPromo(request: MerchantPromoRequest) {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null, createCompleted = false)
        viewModelScope.launch {
            merchantRepository.createPromo(request)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(createCompleted = true)
                    load()
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = e.message ?: "Gagal buat promo",
                        isLoading = false
                    )
                }
        }
    }

    fun toggleActive(promo: MerchantPromo) {
        _uiState.value = _uiState.value.copy(actionLoadingId = promo.id, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.setPromoActive(promo.id, !promo.isActive)
                .onSuccess { load() }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        actionLoadingId = null,
                        errorMessage = e.message ?: "Gagal ubah status promo"
                    )
                }
        }
    }

    fun deletePromo(id: String) {
        _uiState.value = _uiState.value.copy(actionLoadingId = id, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.deletePromo(id)
                .onSuccess { load() }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        actionLoadingId = null,
                        errorMessage = e.message ?: "Gagal hapus promo"
                    )
                }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    fun clearCreateCompleted() {
        _uiState.value = _uiState.value.copy(createCompleted = false)
    }
}
