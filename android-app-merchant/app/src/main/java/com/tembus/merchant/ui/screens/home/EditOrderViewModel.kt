package com.tembus.merchant.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.EditOrderItemRequest
import com.tembus.merchant.data.model.EditOrderResult
import com.tembus.merchant.data.model.FoodOrderItem
import com.tembus.merchant.data.model.OrderEditData
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * EditOrderViewModel — FB-087: merchant mengubah item order food sebelum konfirmasi.
 * Load GET /merchant/orders/{id}/items → edit qty lokal → PUT items baru.
 * Backend menerapkan Grab pattern: nilai baru TIDAK boleh melebihi order awal.
 */
class EditOrderViewModel(
    private val merchantRepository: MerchantRepository,
    private val orderId: String
) : ViewModel() {

    data class EditOrderUiState(
        val isLoading: Boolean = true,
        val saving: Boolean = false,
        val order: OrderEditData? = null,
        // qty per item saat ini (index → qty). Index 0..n-1 sesuai order.items.
        val quantities: List<Int> = emptyList(),
        val errorMessage: String? = null,
        // hasil PUT sukses (total baru) — tampilkan dialog sebelum kembali.
        val result: EditOrderResult? = null
    ) {
        val subtotalEstimate: Long
            get() = order?.items?.mapIndexed { i, item ->
                item.itemPrice * (quantities.getOrElse(i) { item.quantity })
            }?.sum() ?: 0

        val hasChanges: Boolean
            get() = order != null && quantities.isNotEmpty() &&
                quantities != order.items.map { it.quantity }

        val totalEstimate: Long
            get() {
                val o = order ?: return 0
                return (subtotalEstimate + o.deliveryFeeIdr + o.platformFeeIdr - o.discountIdr).coerceAtLeast(0)
            }
    }

    private val _uiState = MutableStateFlow(EditOrderUiState())
    val uiState: StateFlow<EditOrderUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.value = EditOrderUiState(isLoading = true)
            val result = merchantRepository.getOrderEdit(orderId)
            result.onSuccess { data ->
                _uiState.value = EditOrderUiState(
                    isLoading = false,
                    order = data,
                    quantities = data.items.map { it.quantity }
                )
            }.onFailure { e ->
                _uiState.value = EditOrderUiState(
                    isLoading = false,
                    errorMessage = e.message ?: "Gagal memuat data order"
                )
            }
        }
    }

    fun increment(index: Int) {
        val s = _uiState.value ?: return
        if (index !in s.quantities.indices) return
        val q = s.quantities[index] + 1
        // Batas wajar 99 — backend tetap memvalidasi (nilai tidak boleh melebihi order awal).
        if (q > 99) return
        _uiState.value = s.copy(quantities = s.quantities.toMutableList().also { it[index] = q })
    }

    fun decrement(index: Int) {
        val s = _uiState.value ?: return
        if (index !in s.quantities.indices) return
        val q = (s.quantities[index] - 1).coerceAtLeast(1)
        _uiState.value = s.copy(quantities = s.quantities.toMutableList().also { it[index] = q })
    }

    fun save() {
        val s = _uiState.value ?: return
        val items = s.order?.items ?: return
        if (items.isEmpty()) return
        if (s.saving) return

        val payload = items.mapIndexed { i, item ->
            EditOrderItemRequest(
                menuItemId = item.menuItemId,
                quantity = s.quantities.getOrElse(i) { item.quantity }
            )
        }
        _uiState.value = s.copy(saving = true, errorMessage = null)
        viewModelScope.launch {
            val result = merchantRepository.editOrderItems(orderId, payload)
            result.onSuccess { res ->
                _uiState.value = _uiState.value.copy(saving = false, result = res)
            }.onFailure { e ->
                _uiState.value = _uiState.value.copy(
                    saving = false,
                    errorMessage = e.message ?: "Gagal menyimpan perubahan"
                )
            }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}
