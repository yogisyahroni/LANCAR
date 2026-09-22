package com.tembus.customer.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.MarketLegalDocument
import com.tembus.customer.data.repository.MarketConfigRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface PrivacyTermsUiState {
    data object Loading : PrivacyTermsUiState
    data class Content(val documents: List<MarketLegalDocument>) : PrivacyTermsUiState
    data class Error(val message: String) : PrivacyTermsUiState
}

@HiltViewModel
class PrivacyTermsViewModel @Inject constructor(
    private val repository: MarketConfigRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow<PrivacyTermsUiState>(PrivacyTermsUiState.Loading)
    val uiState: StateFlow<PrivacyTermsUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        _uiState.value = PrivacyTermsUiState.Loading
        viewModelScope.launch {
            repository.getApprovedLegalDocuments()
                .onSuccess { documents ->
                    _uiState.value = if (documents.isEmpty()) {
                        PrivacyTermsUiState.Error("Dokumen legal belum tersedia untuk pasar ini.")
                    } else {
                        PrivacyTermsUiState.Content(documents)
                    }
                }
                .onFailure { error ->
                    _uiState.value = PrivacyTermsUiState.Error(error.localizedMessage ?: "Kebijakan legal belum dapat dimuat.")
                }
        }
    }
}
