package com.lancar.courier.ui.screens.order

import android.content.Context
import com.lancar.courier.data.repository.OrderRepository

/**
 * Order Module
 * 
 * Provides OrderRepository instance for dependency injection.
 */
object OrderModule {

    private var orderRepository: OrderRepository? = null

    fun init(context: Context) {
        if (orderRepository == null) {
            orderRepository = OrderRepository(context.applicationContext)
        }
    }

    fun getOrderRepository(): OrderRepository {
        return orderRepository ?: throw IllegalStateException("OrderRepository not initialized")
    }
}
