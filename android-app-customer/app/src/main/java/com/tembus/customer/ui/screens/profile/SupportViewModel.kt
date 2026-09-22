package com.tembus.customer.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.Order
import com.tembus.customer.data.repository.OrderRepository
import com.tembus.customer.ui.screens.main.ActiveOrderRecoveryPolicy
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

data class SupportUiState(
    val isLoading: Boolean = true,
    val activeOrder: Order? = null,
    val loadError: String? = null,
)

@HiltViewModel
class SupportViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SupportUiState())
    val uiState: StateFlow<SupportUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val result = orderRepository.getOrderHistory().first()
            result.onSuccess { orders ->
                _uiState.value = SupportUiState(
                    isLoading = false,
                    activeOrder = ActiveOrderRecoveryPolicy.recoverableOrders(orders)
                        .maxByOrNull { it.updatedAt },
                )
            }.onFailure { error ->
                _uiState.value = SupportUiState(
                    isLoading = false,
                    loadError = error.message ?: "Konteks order belum dapat dimuat.",
                )
            }
        }
    }
}
