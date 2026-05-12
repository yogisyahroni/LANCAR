package com.lancar.customer.data.repository

import com.lancar.customer.data.api.LANCARApiService
import com.lancar.customer.data.model.AuthResponse
import com.lancar.customer.data.model.LoginRequest
import com.lancar.customer.data.model.OtpRequest
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val apiService: LANCARApiService
) {

    suspend fun requestOtp(phone: String): Result<AuthResponse> {
        return try {
            val response = apiService.requestOtp(OtpRequest(phone))
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun verifyOtp(phone: String, otpCode: String): Result<AuthResponse> {
        return try {
            val response = apiService.login(LoginRequest(phone, otpCode))
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun handleResponse(response: Response<AuthResponse>): Result<AuthResponse> {
        return if (response.isSuccessful) {
            val body = response.body()
            if (body != null && body.success) {
                Result.success(body)
            } else {
                Result.failure(Exception(body?.message ?: "Operasi Gagal"))
            }
        } else {
            Result.failure(Exception("HTTP Error ${response.code()}: ${response.message()}"))
        }
    }
}
