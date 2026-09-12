package com.tembus.customer.ui.screens.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.UniversalSearchDocument
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class UniversalSearchUiState(
    val results: List<UniversalSearchDocument> = emptyList(),
    val suggestions: List<String> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class UniversalSearchViewModel @Inject constructor(
    private val apiService: TEMBUSApiService,
) : ViewModel() {
    private val _uiState = MutableStateFlow(UniversalSearchUiState())
    val uiState: StateFlow<UniversalSearchUiState> = _uiState.asStateFlow()

    private var requestJob: Job? = null

    fun search(query: String, marketCode: String = "id-jk", locale: String = "id-ID") {
        val normalized = query.trim()
        requestJob?.cancel()
        if (normalized.isBlank()) {
            _uiState.value = UniversalSearchUiState()
            return
        }

        requestJob = viewModelScope.launch {
            delay(220)
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val searchResponse = apiService.universalSearch(
                    query = normalized,
                    marketCode = marketCode,
                    locale = locale,
                )
                val autocompleteResponse = apiService.universalSearchAutocomplete(
                    query = normalized,
                    marketCode = marketCode,
                    locale = locale,
                )
                if (!searchResponse.isSuccessful) {
                    _uiState.value = UniversalSearchUiState(error = "Pencarian sedang tidak tersedia.")
                    return@launch
                }
                _uiState.value = UniversalSearchUiState(
                    results = searchResponse.body()?.data?.results.orEmpty(),
                    suggestions = autocompleteResponse.body()?.data?.suggestions.orEmpty(),
                )
            } catch (_: Exception) {
                // The safe, local service-intent catalogue remains visible when
                // discovery is temporarily unavailable; no fake entity result is created.
                _uiState.value = UniversalSearchUiState(error = "Pencarian sedang tidak tersedia.")
            }
        }
    }
}
