package com.lancar.courier.ui.screens.order

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.lancar.courier.data.repository.OrderRepository

/**
 * Order ViewModel Factory
 * 
 * Provides OrderViewModel instances with proper dependencies.
 */
class OrderViewModelFactory(
    private val orderRepository: OrderRepository
) : ViewModelProvider.Factory {

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(OrderViewModel::class.java)) {
            return OrderViewModel(orderRepository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
