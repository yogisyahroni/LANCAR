package com.tembus.customer.ui.screens.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.CartStore
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.MapsProviderConfig
import com.tembus.customer.data.model.Order
import com.tembus.customer.data.model.OrderTrackingDetail
import com.tembus.customer.data.model.ReorderInfo
import com.tembus.customer.data.repository.OrderRepository
import com.tembus.customer.data.repository.TrackingRepository
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

/** FB-084: state dialog "Pesan Lagi" (reorder food). */
sealed class ReorderUiState {
    object Idle : ReorderUiState()
    object Loading : ReorderUiState()
    data class Ready(val info: ReorderInfo) : ReorderUiState()
    data class Error(val message: String) : ReorderUiState()
}

@HiltViewModel
class OrderHistoryViewModel @Inject constructor(
    private val repository: OrderRepository,
    private val apiService: TEMBUSApiService,
    private val cartStore: CartStore,
    private val trackingRepository: TrackingRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<HistoryUiState>(HistoryUiState.Idle)
    val uiState: StateFlow<HistoryUiState> = _uiState.asStateFlow()

    private val _reorderState = MutableStateFlow<ReorderUiState>(ReorderUiState.Idle)
    val reorderState: StateFlow<ReorderUiState> = _reorderState.asStateFlow()

    // Only server-provided tracking coordinates may drive the activity map.
    // Null is an honest "snapshot unavailable" state, not a design fallback.
    private val _activeTracking = MutableStateFlow<OrderTrackingDetail?>(null)
    val activeTracking: StateFlow<OrderTrackingDetail?> = _activeTracking.asStateFlow()

    private val _mapsProviderConfig = MutableStateFlow(MapsProviderConfig())
    val mapsProviderConfig: StateFlow<MapsProviderConfig> = _mapsProviderConfig.asStateFlow()

    init {
        fetchHistory()
    }

    fun fetchHistory() {
        viewModelScope.launch {
            _uiState.value = HistoryUiState.Loading
            repository.getOrderHistory().collectLatest { result ->
                result.onSuccess { list ->
                    _uiState.value = HistoryUiState.Success(list)
                    refreshActivitySnapshot(list)
                }
                result.onFailure { error ->
                    _uiState.value = HistoryUiState.Error(error.localizedMessage ?: "Gagal memuat riwayat")
                }
            }
        }
    }

    private fun refreshActivitySnapshot(orders: List<Order>) {
        val activeOrder = orders.firstOrNull { order ->
            val status = order.status.trim().lowercase()
            status !in setOf("delivered", "completed", "arrived", "cancelled", "canceled", "failed", "rejected", "payment_failed") && !status.contains("cancel")
        }
        if (activeOrder == null) {
            _activeTracking.value = null
            return
        }
        viewModelScope.launch {
            trackingRepository.getMapsProviderConfig()
                .onSuccess { _mapsProviderConfig.value = it }
            repository.getOrderTrackingDetail(activeOrder.orderId)
                .onSuccess { _activeTracking.value = it }
                .onFailure { _activeTracking.value = null }
        }
    }

    // ── FB-084 REORDER: cek validasi ulang order food sebelum "Pesan Lagi" ──
    fun checkReorder(orderId: String) {
        if (_reorderState.value is ReorderUiState.Loading) return
        viewModelScope.launch {
            _reorderState.value = ReorderUiState.Loading
            try {
                val res = apiService.getReorderInfo(orderId)
                val body = res.body()
                if (res.isSuccessful && body?.success == true && body.data != null) {
                    _reorderState.value = ReorderUiState.Ready(body.data)
                } else {
                    _reorderState.value = ReorderUiState.Error(
                        body?.message ?: "Gagal cek reorder (${res.code()})"
                    )
                }
            } catch (e: Exception) {
                _reorderState.value = ReorderUiState.Error(e.localizedMessage ?: "Gagal cek reorder")
            }
        }
    }

    /** Konfirmasi "Pesan Lagi": isi cart dari item yang masih tersedia. */
    fun confirmReorder() {
        val state = _reorderState.value
        if (state is ReorderUiState.Ready) {
            cartStore.prefillFromReorder(state.info.items)
        }
    }

    fun dismissReorder() {
        _reorderState.value = ReorderUiState.Idle
    }
}
