package com.lancar.customer.data.repository

import com.lancar.customer.data.api.LANCARApiService
import com.lancar.customer.data.device.DeviceIdentityProvider
import com.lancar.customer.data.model.AuthResponse
import com.lancar.customer.data.model.CustomerPasswordLoginStartRequest
import com.lancar.customer.data.model.CustomerPasswordRegisterStartRequest
import com.lancar.customer.data.model.LoginV1Request
import com.lancar.customer.data.model.OtpV1Request
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val apiService: LANCARApiService,
    private val deviceIdentityProvider: DeviceIdentityProvider
) {

    suspend fun requestOtp(phone: String): Result<AuthResponse> {
        return try {
            handleResponse(apiService.requestOtpV1(OtpV1Request(phone)))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun startPasswordLogin(email: String, password: String): Result<AuthResponse> {
        return try {
            handleResponse(
                apiService.startCustomerPasswordLogin(
                    CustomerPasswordLoginStartRequest(
                        email = email,
                        password = password,
                        deviceId = deviceIdentityProvider.deviceId(),
                        deviceInfo = deviceIdentityProvider.deviceInfo()
                    )
                )
            )
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
                    CustomerPasswordRegisterStartRequest(
                        fullName = fullName,
                        email = email,
                        phoneNumber = phoneNumber,
                        password = password,
                        deviceId = deviceIdentityProvider.deviceId(),
                        deviceInfo = deviceIdentityProvider.deviceInfo()
                    )
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun verifyOtp(phone: String, otpCode: String): Result<AuthResponse> {
        return try {
            handleResponse(
                apiService.loginV1(
                    LoginV1Request(
                        phoneNumber = phone,
                        code = otpCode,
                        deviceId = deviceIdentityProvider.deviceId(),
                        deviceInfo = deviceIdentityProvider.deviceInfo()
                    )
                )
            )
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
