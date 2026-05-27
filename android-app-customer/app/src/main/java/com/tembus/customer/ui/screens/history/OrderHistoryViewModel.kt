package com.tembus.customer.ui.screens.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.Order
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class HistoryUiState {
    object Idle : HistoryUiState()
    object Loading : HistoryUiState()
    data class Success(val orders: List<Order>) : HistoryUiState()
    data class Error(val message: String) : HistoryUiState()
}

@HiltViewModel
class OrderHistoryViewModel @Inject constructor(
    private val repository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<HistoryUiState>(HistoryUiState.Idle)
    val uiState: StateFlow<HistoryUiState> = _uiState.asStateFlow()

    init {
        fetchHistory()
    }

    fun fetchHistory() {
        viewModelScope.launch {
            _uiState.value = HistoryUiState.Loading
            repository.getOrderHistory().collectLatest { result ->
                result.onSuccess { list ->
                    _uiState.value = HistoryUiState.Success(list)
                }
                result.onFailure { error ->
                    _uiState.value = HistoryUiState.Error(error.localizedMessage ?: "Gagal memuat riwayat")
                }
            }
        }
    }
}
