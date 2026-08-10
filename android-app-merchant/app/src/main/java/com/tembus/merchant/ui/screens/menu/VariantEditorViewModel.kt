package com.tembus.merchant.ui.screens.menu

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.MenuItemVariant
import com.tembus.merchant.data.model.MenuItemVariantOption
import com.tembus.merchant.data.model.ReplaceVariantsRequest
import com.tembus.merchant.data.model.VariantGroupRequest
import com.tembus.merchant.data.model.VariantOptionRequest
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * VariantEditorViewModel — FB-108: kelola grup varian menu item.
 * Load GET /merchant/menu/{id}/variants → edit lokal → simpan PUT (replace atomik).
 */
class VariantEditorViewModel(
    private val merchantRepository: MerchantRepository,
    private val menuItemId: String
) : ViewModel() {

    data class DraftOption(
        val nama: String = "",
        val priceDelta: String = "0"
    ) {
        val parsedDelta: Long get() = priceDelta.filter { it.isDigit() }.toLongOrNull() ?: 0
    }

    data class DraftGroup(
        val nama: String = "",
        val isRequired: Boolean = false,
        val maxSelect: String = "1",
        val options: MutableList<DraftOption> = mutableListOf(DraftOption())
    )

    data class VariantEditorUiState(
        val isLoading: Boolean = true,
        val saving: Boolean = false,
        val groups: List<DraftGroup> = emptyList(),
        val errorMessage: String? = null,
        val saved: Boolean = false
    )

    private val _uiState = MutableStateFlow(VariantEditorUiState())
    val uiState: StateFlow<VariantEditorUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            val result = merchantRepository.getMenuItemVariants(menuItemId)
            result.onSuccess { variants ->
                _uiState.value = VariantEditorUiState(
                    isLoading = false,
                    groups = variants.map { v ->
                        DraftGroup(
                            nama = v.nama,
                            isRequired = v.isRequired,
                            maxSelect = v.maxSelect.toString(),
                            options = (v.options.ifEmpty { listOf(MenuItemVariantOption()) })
                                .map { o -> DraftOption(nama = o.nama, priceDelta = o.priceDelta.toString()) }
                                .toMutableList()
                        )
                    }
                )
            }.onFailure { e ->
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = e.message ?: "Gagal memuat varian"
                )
            }
        }
    }

    fun addGroup() {
        _uiState.value = _uiState.value.copy(groups = _uiState.value.groups + DraftGroup())
    }

    fun removeGroup(index: Int) {
        val groups = _uiState.value.groups.toMutableList()
        if (index in groups.indices) groups.removeAt(index)
        _uiState.value = _uiState.value.copy(groups = groups)
    }

    fun updateGroupName(index: Int, nama: String) {
        val groups = _uiState.value.groups.toMutableList()
        if (index in groups.indices) groups[index] = groups[index].copy(nama = nama)
        _uiState.value = _uiState.value.copy(groups = groups)
    }

    fun updateGroupRequired(index: Int, required: Boolean) {
        val groups = _uiState.value.groups.toMutableList()
        if (index in groups.indices) groups[index] = groups[index].copy(isRequired = required)
        _uiState.value = _uiState.value.copy(groups = groups)
    }

    fun updateGroupMaxSelect(index: Int, max: String) {
        val groups = _uiState.value.groups.toMutableList()
        if (index in groups.indices) groups[index] = groups[index].copy(maxSelect = max)
        _uiState.value = _uiState.value.copy(groups = groups)
    }

    fun addOption(groupIndex: Int) {
        val groups = _uiState.value.groups.toMutableList()
        if (groupIndex in groups.indices) {
            groups[groupIndex].options.add(DraftOption())
            _uiState.value = _uiState.value.copy(groups = groups)
        }
    }

    fun removeOption(groupIndex: Int, optionIndex: Int) {
        val groups = _uiState.value.groups.toMutableList()
        if (groupIndex in groups.indices) {
            groups[groupIndex].options.removeAt(optionIndex)
            _uiState.value = _uiState.value.copy(groups = groups)
        }
    }

    fun updateOptionName(groupIndex: Int, optionIndex: Int, nama: String) {
        val groups = _uiState.value.groups.toMutableList()
        if (groupIndex in groups.indices && optionIndex in groups[groupIndex].options.indices) {
            groups[groupIndex].options[optionIndex] = groups[groupIndex].options[optionIndex].copy(nama = nama)
            _uiState.value = _uiState.value.copy(groups = groups)
        }
    }

    fun updateOptionDelta(groupIndex: Int, optionIndex: Int, delta: String) {
        val groups = _uiState.value.groups.toMutableList()
        if (groupIndex in groups.indices && optionIndex in groups[groupIndex].options.indices) {
            groups[groupIndex].options[optionIndex] = groups[groupIndex].options[optionIndex].copy(priceDelta = delta.filter { it.isDigit() })
            _uiState.value = _uiState.value.copy(groups = groups)
        }
    }

    fun save() {
        val state = _uiState.value
        // Validasi lokal: grup kosong diabaikan, grup dengan nama harus punya opsi bernama.
        val validGroups = state.groups.filter { it.nama.isNotBlank() }
        for (g in validGroups) {
            if (g.options.none { it.nama.isNotBlank() }) {
                _uiState.value = state.copy(errorMessage = "Varian \"${g.nama}\" minimal punya 1 opsi")
                return
            }
        }
        val request = ReplaceVariantsRequest(
            variants = validGroups.map { g ->
                VariantGroupRequest(
                    nama = g.nama.trim(),
                    isRequired = g.isRequired,
                    minSelect = if (g.isRequired) 1 else 0,
                    maxSelect = g.maxSelect.toIntOrNull()?.coerceIn(1, 10) ?: 1,
                    options = g.options.filter { it.nama.isNotBlank() }.map { o ->
                        VariantOptionRequest(nama = o.nama.trim(), priceDelta = o.parsedDelta)
                    }
                )
            }
        )
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(saving = true, errorMessage = null)
            val result = merchantRepository.replaceMenuItemVariants(menuItemId, request)
            result.onSuccess {
                _uiState.value = _uiState.value.copy(saving = false, saved = true)
            }.onFailure { e ->
                _uiState.value = _uiState.value.copy(
                    saving = false,
                    errorMessage = e.message ?: "Gagal menyimpan varian"
                )
            }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}
