package com.tembus.merchant.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.MerchantNotificationPreferences
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class NotificationsUiState(
    val isLoading: Boolean = true,
    val preferences: MerchantNotificationPreferences = MerchantNotificationPreferences(),
    val errorMessage: String? = null,
    val isSaving: Boolean = false,
    val saveError: String? = null,
    val saved: Boolean = false
)

class NotificationsViewModel(private val repository: MerchantRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(NotificationsUiState())
    val uiState: StateFlow<NotificationsUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            val preferences = repository.getNotificationPreferences()
            if (preferences.isSuccess) {
                _uiState.value = NotificationsUiState(
                    isLoading = false,
                    preferences = preferences.getOrThrow()
                )
            } else {
                val error = preferences.exceptionOrNull()
                _uiState.value = NotificationsUiState(
                    isLoading = false,
                    errorMessage = error?.message ?: "Gagal memuat preferensi notifikasi"
                )
            }
        }
    }

    fun setNewOrderAlerts(value: Boolean) = updatePreferences { it.copy(newOrderAlerts = value) }
    fun setOrderCancellations(value: Boolean) = updatePreferences { it.copy(orderCancellations = value) }
    fun setDailySummaryReports(value: Boolean) = updatePreferences { it.copy(dailySummaryReports = value) }
    fun setPromotionalUpdates(value: Boolean) = updatePreferences { it.copy(promotionalUpdates = value) }

    private fun updatePreferences(transform: (MerchantNotificationPreferences) -> MerchantNotificationPreferences) {
        _uiState.value = _uiState.value.copy(
            preferences = transform(_uiState.value.preferences),
            saved = false,
            saveError = null
        )
    }

    fun savePreferences() {
        if (_uiState.value.isSaving) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSaving = true, saveError = null, saved = false)
            repository.updateNotificationPreferences(_uiState.value.preferences)
                .onSuccess { prefs ->
                    _uiState.value = _uiState.value.copy(isSaving = false, preferences = prefs, saved = true)
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        isSaving = false,
                        saveError = error.message ?: "Gagal menyimpan preferensi"
                    )
                }
        }
    }

}
