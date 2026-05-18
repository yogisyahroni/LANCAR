package com.lancar.customer.ui.screens.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lancar.customer.data.model.DeliveryServiceProduct
import com.lancar.customer.data.model.Order
import com.lancar.customer.data.repository.OrderRepository
import com.lancar.customer.data.session.AuthSessionManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val sessionManager: AuthSessionManager
) : ViewModel() {

    val customerName: StateFlow<String?> = sessionManager.customerName
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "Pelanggan")

    private val _activeOrder = MutableStateFlow<Order?>(null)
    val activeOrder = _activeOrder.asStateFlow()

    private val _services = MutableStateFlow<List<DeliveryServiceProduct>>(emptyList())
    val services = _services.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading = _isLoading.asStateFlow()

    init {
        refreshData()
    }

    fun refreshData() {
        viewModelScope.launch {
            _isLoading.value = true
            orderRepository.getOrderHistory().collectLatest { result ->
                _isLoading.value = false
                result.onSuccess { orders ->
                    // Find the most recent active order (pending/transit/etc)
                    _activeOrder.value = orders.firstOrNull { it.status != "delivered" && it.status != "failed" }
                }
            }
        }
        viewModelScope.launch {
            orderRepository.getCustomerDeliveryServices().collectLatest { result ->
                result.onSuccess { services ->
                    _services.value = services
                        .filter { it.serviceCategory == "on_demand" && it.isEnabled }
                        .sortedBy { it.displayOrder }
                }
            }
        }
    }
}
