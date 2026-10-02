package com.tembus.merchant.ui.screens.menu

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.MenuItem
import com.tembus.merchant.data.model.MenuItemRequest
import com.tembus.merchant.data.model.MenuCategory
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.model.MerchantPromo
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class MenuUiState(
    val items: List<MenuItem> = emptyList(),
    val categories: List<MenuCategory> = emptyList(),
    val promos: List<MerchantPromo> = emptyList(),
    val merchant: Merchant? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val actionLoadingId: String? = null,
    val actionError: String? = null,
    val isSaving: Boolean = false,
    val saveError: String? = null,
    val saveCompleted: Boolean = false,
    val isImporting: Boolean = false,
    val importTotal: Int = 0,
    val importCompleted: Int = 0,
    val importFailed: Int = 0,
    val importErrors: List<String> = emptyList()
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
            val menu = merchantRepository.listMenu(pageSize = 100)
            val categories = merchantRepository.listMenuCategories()
            val promos = merchantRepository.listPromos(pageSize = 100)
            val profile = merchantRepository.getProfile()
            val menuError = menu.exceptionOrNull()
            _uiState.value = _uiState.value.copy(
                items = menu.getOrElse { emptyList() },
                categories = categories.getOrElse { emptyList() },
                promos = promos.getOrElse { emptyList() },
                merchant = profile.getOrNull() ?: _uiState.value.merchant,
                isLoading = false,
                actionLoadingId = null,
                errorMessage = menuError?.message ?: categories.exceptionOrNull()?.let { "Kategori belum dapat dimuat: ${it.message ?: "coba lagi"}" }
            )
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

    fun importItems(rows: List<MenuImportRow>) {
        if (rows.isEmpty() || _uiState.value.isImporting) return
        _uiState.value = _uiState.value.copy(isImporting = true, importTotal = rows.size, importCompleted = 0, importFailed = 0, importErrors = emptyList())
        viewModelScope.launch {
            var completed = 0
            var failed = 0
            val errors = mutableListOf<String>()
            rows.forEach { row ->
                merchantRepository.createMenuItem(row.request)
                    .onSuccess { completed++ }
                    .onFailure { error ->
                        failed++
                        errors += "Baris ${row.lineNumber}: ${error.message ?: "gagal disimpan"}"
                    }
                _uiState.value = _uiState.value.copy(importCompleted = completed, importFailed = failed)
            }
            _uiState.value = _uiState.value.copy(isImporting = false, importErrors = errors)
            load()
        }
    }

    fun clearImportResult() {
        _uiState.value = _uiState.value.copy(importTotal = 0, importCompleted = 0, importFailed = 0, importErrors = emptyList())
    }
}
