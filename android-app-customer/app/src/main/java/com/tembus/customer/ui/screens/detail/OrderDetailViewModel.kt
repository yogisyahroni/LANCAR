package com.tembus.customer.ui.screens.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.Order
import com.tembus.customer.data.model.ServiceAdjustment
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import com.tembus.customer.data.model.CreateDisputeRequest
import javax.inject.Inject

sealed class DisputeSubmitState {
    object Idle : DisputeSubmitState()
    object Loading : DisputeSubmitState()
    object Success : DisputeSubmitState()
    data class Error(val message: String) : DisputeSubmitState()
}

sealed class CancelOrderState {
    object Idle : CancelOrderState()
    object Loading : CancelOrderState()
    data class Success(val message: String) : CancelOrderState()
    data class Error(val message: String) : CancelOrderState()
}

sealed class OrderDetailUiState {
    object Idle : OrderDetailUiState()
    object Loading : OrderDetailUiState()
    data class Success(val order: Order) : OrderDetailUiState()
    data class Error(val message: String) : OrderDetailUiState()
}

sealed class ServiceAdjustmentDecisionState {
    object Idle : ServiceAdjustmentDecisionState()
    object Loading : ServiceAdjustmentDecisionState()
    data class Success(val message: String) : ServiceAdjustmentDecisionState()
    data class Error(val message: String) : ServiceAdjustmentDecisionState()
}

@HiltViewModel
class OrderDetailViewModel @Inject constructor(
    private val repository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<OrderDetailUiState>(OrderDetailUiState.Idle)
    val uiState: StateFlow<OrderDetailUiState> = _uiState.asStateFlow()

    private val _disputeState = MutableStateFlow<DisputeSubmitState>(DisputeSubmitState.Idle)
    val disputeState: StateFlow<DisputeSubmitState> = _disputeState.asStateFlow()

    private val _cancelState = MutableStateFlow<CancelOrderState>(CancelOrderState.Idle)
    val cancelState: StateFlow<CancelOrderState> = _cancelState.asStateFlow()

    private val _serviceAdjustments = MutableStateFlow<List<ServiceAdjustment>>(emptyList())
    val serviceAdjustments: StateFlow<List<ServiceAdjustment>> = _serviceAdjustments.asStateFlow()

    private val _serviceAdjustmentDecisionState = MutableStateFlow<ServiceAdjustmentDecisionState>(ServiceAdjustmentDecisionState.Idle)
    val serviceAdjustmentDecisionState: StateFlow<ServiceAdjustmentDecisionState> = _serviceAdjustmentDecisionState.asStateFlow()

    fun fetchOrderDetail(orderId: String) {
        viewModelScope.launch {
            _uiState.value = OrderDetailUiState.Loading
            repository.getOrderDetail(orderId).collectLatest { result ->
                result.onSuccess { order ->
                    _uiState.value = OrderDetailUiState.Success(order)
                    loadServiceAdjustments(orderId)
                }
                result.onFailure { error ->
                    _uiState.value = OrderDetailUiState.Error(error.localizedMessage ?: "Order tidak ditemukan")
                }
            }
        }
    }

    fun submitDispute(
        orderId: String,
        type: String,
        description: String,
        evidenceBytes: ByteArray?,
        evidenceMimeType: String?
    ) {
        viewModelScope.launch {
            _disputeState.value = DisputeSubmitState.Loading
            var uploadedUrl: String? = null
            
            if (evidenceBytes != null) {
                val reqFile = evidenceBytes.toRequestBody((evidenceMimeType ?: "image/jpeg").toMediaTypeOrNull())
                val part = MultipartBody.Part.createFormData("file", "evidence.jpg", reqFile)
                val uploadRes = repository.uploadDisputeEvidence(orderId, part)
                if (uploadRes.isSuccess) {
                    uploadedUrl = uploadRes.getOrNull()
                } else {
                    _disputeState.value = DisputeSubmitState.Error(uploadRes.exceptionOrNull()?.message ?: "Gagal upload bukti foto")
                    return@launch
                }
            }

            val req = CreateDisputeRequest(
                orderId = orderId,
                type = type,
                description = description,
                evidenceUrls = if (uploadedUrl != null) listOf(uploadedUrl) else null,
                isCustomer = true
            )
            val res = repository.createCustomerDispute(req)
            if (res.isSuccess) {
                _disputeState.value = DisputeSubmitState.Success
            } else {
                _disputeState.value = DisputeSubmitState.Error(res.exceptionOrNull()?.message ?: "Gagal mengirim laporan")
            }
        }
    }

    fun resetDisputeState() {
        _disputeState.value = DisputeSubmitState.Idle
    }

    fun cancelOrder(orderId: String, reason: String) {
        viewModelScope.launch {
            _cancelState.value = CancelOrderState.Loading
            val result = repository.cancelOrder(orderId, reason)
            result.onSuccess { message ->
                _cancelState.value = CancelOrderState.Success(message)
            }
            result.onFailure { error ->
                _cancelState.value = CancelOrderState.Error(error.localizedMessage ?: "Gagal membatalkan pesanan")
            }
        }
    }

    fun resetCancelState() {
        _cancelState.value = CancelOrderState.Idle
    }

    fun refreshServiceAdjustments(orderId: String) {
        viewModelScope.launch { loadServiceAdjustments(orderId) }
    }

    private suspend fun loadServiceAdjustments(orderId: String) {
        repository.getServiceAdjustments(orderId)
            .onSuccess { _serviceAdjustments.value = it }
    }

    fun decideServiceAdjustment(orderId: String, adjustmentId: String, approve: Boolean, rejectionReason: String? = null) {
        viewModelScope.launch {
            _serviceAdjustmentDecisionState.value = ServiceAdjustmentDecisionState.Loading
            repository.decideServiceAdjustment(
                adjustmentId = adjustmentId,
                decision = if (approve) "approve" else "reject",
                rejectionReason = if (approve) null else rejectionReason
            ).onSuccess {
                _serviceAdjustmentDecisionState.value = ServiceAdjustmentDecisionState.Success(
                    if (approve) "Tambahan biaya disetujui." else "Penyesuaian harga ditolak."
                )
                loadServiceAdjustments(orderId)
                fetchOrderDetail(orderId)
            }.onFailure { error ->
                _serviceAdjustmentDecisionState.value = ServiceAdjustmentDecisionState.Error(
                    error.localizedMessage ?: "Keputusan penyesuaian harga gagal diproses"
                )
            }
        }
    }

    fun resetServiceAdjustmentDecisionState() {
        _serviceAdjustmentDecisionState.value = ServiceAdjustmentDecisionState.Idle
    }
}
