package com.lancar.customer.data.repository

import com.lancar.customer.data.api.LANCARApiService
import com.lancar.customer.data.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OrderRepository @Inject constructor(
    private val apiService: LANCARApiService
) {
    fun getOrderHistory(): Flow<Result<List<Order>>> = flow {
        try {
            val response = apiService.getOrderHistory()
            if (response.isSuccessful && response.body()?.success == true) {
                emit(Result.success(response.body()?.data ?: emptyList()))
            } else {
                emit(Result.failure(Exception(response.body()?.message ?: "Unknown Error")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    fun createOrder(request: CreateOrderRequest): Flow<Result<Order>> = flow {
        try {
            val response = apiService.createOrder(request)
            val data = response.body()?.data
            if (response.isSuccessful && response.body()?.success == true && data != null) {
                emit(Result.success(data))
            } else {
                emit(Result.failure(Exception(response.body()?.message ?: "Failed to create order")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    fun getOrderDetail(orderId: String): Flow<Result<Order>> = flow {
        try {
            val response = apiService.getOrderDetail(orderId)
            val data = response.body()?.data
            if (response.isSuccessful && response.body()?.success == true && data != null) {
                emit(Result.success(data))
            } else {
                emit(Result.failure(Exception(response.body()?.message ?: "Order not found")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    fun initiatePayment(orderId: String, method: String = "QRIS"): Flow<Result<String>> = flow {
        try {
            val response = apiService.initiatePayment(orderId, PaymentRequest(method))
            val paymentUrl = response.body()?.data?.paymentUrl
            if (response.isSuccessful && paymentUrl != null) {
                emit(Result.success(paymentUrl))
            } else {
                emit(Result.failure(Exception("Gagal memicu pembayaran")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }
}
