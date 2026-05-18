package com.lancar.customer.data.repository

import com.lancar.customer.data.api.LANCARApiService
import com.lancar.customer.data.model.AuthResponse
import com.lancar.customer.data.model.CustomerPasswordLoginStartRequest
import com.lancar.customer.data.model.CustomerPasswordRegisterStartRequest
import com.lancar.customer.data.model.LoginRequest
import com.lancar.customer.data.model.LoginV1Request
import com.lancar.customer.data.model.OtpRequest
import com.lancar.customer.data.model.OtpV1Request
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val apiService: LANCARApiService
) {

    suspend fun requestOtp(phone: String): Result<AuthResponse> {
        return withFallback(
            primary = { apiService.requestOtp(OtpRequest(phone)) },
            fallback = { apiService.requestOtpV1(OtpV1Request(phone)) }
        )
    }

    suspend fun startPasswordLogin(email: String, password: String): Result<AuthResponse> {
        return try {
            handleResponse(apiService.startCustomerPasswordLogin(CustomerPasswordLoginStartRequest(email, password)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun startPasswordRegistration(
        fullName: String,
        email: String,
        phoneNumber: String,
        password: String
    ): Result<AuthResponse> {
        return try {
            handleResponse(
                apiService.startCustomerPasswordRegistration(
                    CustomerPasswordRegisterStartRequest(fullName, email, phoneNumber, password)
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun verifyOtp(phone: String, otpCode: String): Result<AuthResponse> {
        return withFallback(
            primary = { apiService.login(LoginRequest(phone, otpCode)) },
            fallback = { apiService.loginV1(LoginV1Request(phone, otpCode)) }
        )
    }

    private suspend fun withFallback(
        primary: suspend () -> Response<AuthResponse>,
        fallback: suspend () -> Response<AuthResponse>
    ): Result<AuthResponse> {
        var primaryException: Exception? = null
        val primaryResponse = try {
            primary()
        } catch (e: Exception) {
            primaryException = e
            null
        }

        if (primaryResponse != null) {
            val primaryResult = handleResponse(primaryResponse)
            if (primaryResult.isSuccess || !primaryResponse.shouldTryFallback()) {
                return primaryResult
            }
        }

        return try {
            handleResponse(fallback())
        } catch (e: Exception) {
            Result.failure(primaryException ?: e)
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

    private fun Response<AuthResponse>.shouldTryFallback(): Boolean {
        return code() in setOf(400, 404, 405, 422)
    }
}
