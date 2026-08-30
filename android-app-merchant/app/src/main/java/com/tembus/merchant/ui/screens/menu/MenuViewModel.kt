package com.tembus.merchant.ui.screens.menu

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.MenuItem
import com.tembus.merchant.data.model.MenuItemRequest
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class MenuUiState(
    val items: List<MenuItem> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val actionLoadingId: String? = null,
    val actionError: String? = null,
    val isSaving: Boolean = false,
    val saveError: String? = null,
    val saveCompleted: Boolean = false
)

class MenuViewModel(
    private val merchantRepository: MerchantRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(MenuUiState())
    val uiState: StateFlow<MenuUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.value = _uiState.value.copy(
            isLoading = true,
            errorMessage = null,
            actionLoadingId = null
        )
        viewModelScope.launch {
            merchantRepository.listMenu(pageSize = 100)
                .onSuccess { items ->
                    _uiState.value = _uiState.value.copy(
                        items = items,
                        isLoading = false,
                        actionLoadingId = null
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = e.message ?: "Gagal memuat menu",
                        isLoading = false,
                        actionLoadingId = null
                    )
                }
        }
    }

    fun createItem(request: MenuItemRequest) {
        if (_uiState.value.isSaving) return
        _uiState.value = _uiState.value.copy(
            isSaving = true,
            saveError = null,
            saveCompleted = false,
            errorMessage = null
        )
        viewModelScope.launch {
            merchantRepository.createMenuItem(request)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        isSaving = false,
                        saveCompleted = true
                    )
                    load()
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isSaving = false,
                        saveError = e.message ?: "Gagal tambah menu"
                    )
                }
        }
    }

    // FB-110: upload foto menu → URL publik. Dipanggil dari dialog editor.
    suspend fun uploadPhoto(file: java.io.File): Result<String> =
        merchantRepository.uploadMenuPhoto(file)

    fun updateItem(id: String, request: MenuItemRequest) {
        if (_uiState.value.isSaving) return
        _uiState.value = _uiState.value.copy(
            isSaving = true,
            saveError = null,
            saveCompleted = false,
            errorMessage = null
        )
        viewModelScope.launch {
            merchantRepository.updateMenuItem(id, request)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        isSaving = false,
                        saveCompleted = true
                    )
                    load()
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isSaving = false,
                        saveError = e.message ?: "Gagal ubah menu"
                    )
                }
        }
    }

    fun deleteItem(id: String) {
        _uiState.value = _uiState.value.copy(actionLoadingId = id, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.deleteMenuItem(id)
                .onSuccess { load() }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        actionLoadingId = null,
                        errorMessage = e.message ?: "Gagal hapus menu"
                    )
                }
        }
    }

    fun toggleAvailability(item: MenuItem) {
        _uiState.value = _uiState.value.copy(actionLoadingId = item.id, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.setMenuItemAvailability(item.id, !item.isAvailable)
                .onSuccess { load() }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        actionLoadingId = null,
                        errorMessage = e.message ?: "Gagal ubah ketersediaan"
                    )
                }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    fun clearSaveState() {
        _uiState.value = _uiState.value.copy(saveError = null, saveCompleted = false)
    }
}
