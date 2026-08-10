package com.tembus.courier.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.model.CourierPerformanceStats
import com.tembus.courier.data.model.CourierTipsSummary
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class PerformanceUiState {
    object Loading : PerformanceUiState()
    data class Success(val stats: CourierPerformanceStats, val tipSummary: CourierTipsSummary? = null) : PerformanceUiState()
    data class Error(val message: String) : PerformanceUiState()
}

@HiltViewModel
class PerformanceViewModel @Inject constructor(
    private val apiService: TEMBUSApiService
) : ViewModel() {

    private val _uiState = MutableStateFlow<PerformanceUiState>(PerformanceUiState.Loading)
    val uiState: StateFlow<PerformanceUiState> = _uiState.asStateFlow()

    init {
        fetchPerformanceStats()
    }

    fun fetchPerformanceStats() {
        viewModelScope.launch {
            _uiState.value = PerformanceUiState.Loading
            try {
                val response = apiService.getMyPerformanceStats()
                if (response.isSuccessful && response.body()?.success == true) {
                    val stats = response.body()?.data
                    if (stats != null) {
                        // FB-077: fetch rekap tip parallel (non-blokir kalau gagal)
                        val tipSummary = fetchTipsSummaryQuietly()
                        _uiState.value = PerformanceUiState.Success(stats, tipSummary)
                    } else {
                        _uiState.value = PerformanceUiState.Error("Data performa kosong")
                    }
                } else {
                    _uiState.value = PerformanceUiState.Error(response.message() ?: "Gagal memuat data")
                }
            } catch (e: Exception) {
                _uiState.value = PerformanceUiState.Error(e.localizedMessage ?: "Terjadi kesalahan koneksi")
            }
        }
    }

    private suspend fun fetchTipsSummaryQuietly(): CourierTipsSummary? {
        return try {
            val resp = apiService.getCourierTipsSummary()
            if (resp.isSuccessful && resp.body()?.success == true) resp.body()?.data else null
        } catch (_: Exception) {
            null
        }
    }
}
