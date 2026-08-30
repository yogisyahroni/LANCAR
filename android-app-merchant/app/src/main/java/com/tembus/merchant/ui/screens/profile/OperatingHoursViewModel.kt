package com.tembus.merchant.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.MerchantOperatingHour
import com.tembus.merchant.data.model.MerchantSpecialClosure
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class OperatingHoursUiState(
    val hours: List<MerchantOperatingHour> = emptyList(),
    val closures: List<MerchantSpecialClosure> = emptyList(),
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    val errorMessage: String? = null,
    val saveMessage: String? = null
)

class OperatingHoursViewModel(
    private val merchantRepository: MerchantRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(OperatingHoursUiState())
    val uiState: StateFlow<OperatingHoursUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.getOperatingHours().onSuccess { response ->
                _uiState.value = OperatingHoursUiState(hours = response.hours, closures = response.closures, isLoading = false)
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = error.message ?: "Gagal memuat jam operasional")
            }
        }
    }

    fun save(hours: List<MerchantOperatingHour>) {
        _uiState.value = _uiState.value.copy(isSaving = true, errorMessage = null, saveMessage = null)
        viewModelScope.launch {
            merchantRepository.replaceOperatingHours(hours).onSuccess { response ->
                _uiState.value = _uiState.value.copy(hours = response.hours, closures = response.closures, isSaving = false, saveMessage = "Jadwal berhasil disimpan")
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(isSaving = false, errorMessage = error.message ?: "Gagal menyimpan jadwal")
            }
        }
    }

    fun addClosure(date: String, label: String) {
        _uiState.value = _uiState.value.copy(isSaving = true, errorMessage = null, saveMessage = null)
        viewModelScope.launch {
            merchantRepository.createSpecialClosure(date, label).onSuccess { closure ->
                _uiState.value = _uiState.value.copy(closures = (_uiState.value.closures + closure).sortedBy { it.closureDate }, isSaving = false, saveMessage = "Tanggal tutup ditambahkan")
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(isSaving = false, errorMessage = error.message ?: "Gagal menambah tanggal tutup")
            }
        }
    }

    fun deleteClosure(id: String) {
        _uiState.value = _uiState.value.copy(isSaving = true, errorMessage = null, saveMessage = null)
        viewModelScope.launch {
            merchantRepository.deleteSpecialClosure(id).onSuccess {
                _uiState.value = _uiState.value.copy(closures = _uiState.value.closures.filterNot { closure -> closure.id == id }, isSaving = false, saveMessage = "Tanggal tutup dihapus")
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(isSaving = false, errorMessage = error.message ?: "Gagal menghapus tanggal tutup")
            }
        }
    }
}
