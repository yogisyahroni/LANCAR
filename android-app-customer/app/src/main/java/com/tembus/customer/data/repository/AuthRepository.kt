package com.tembus.customer.data.repository

import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.api.withRequestReference
import com.tembus.customer.data.device.DeviceIdentityProvider
import com.tembus.customer.data.model.AuthResponse
import com.tembus.customer.data.model.CustomerPasswordLoginStartRequest
import com.tembus.customer.data.model.CustomerPasswordRegisterStartRequest
import com.tembus.customer.data.model.LoginV1Request
import com.tembus.customer.data.model.OtpV1Request
import com.tembus.customer.data.model.PasswordResetConfirmRequest
import com.tembus.customer.data.model.PasswordResetRequest
import com.tembus.customer.data.model.PasswordResetResponse
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val apiService: TEMBUSApiService,
    private val deviceIdentityProvider: DeviceIdentityProvider
) {
    private val technicalErrorMarkers = listOf(
        "HTTP ",
        "Exception",
        "retrofit",
        "okhttp",
        "java.",
        "kotlin.",
        "failed to",
        "Unable to",
        "UnknownHost",
        "timeout",
        "SSL",
        "certificate",
        "stack"
    )

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

    suspend fun requestPasswordReset(email: String): Result<PasswordResetResponse> {
        return try {
            handlePasswordResetResponse(
                apiService.requestPasswordReset(
                    PasswordResetRequest(email = email.trim())
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun confirmPasswordReset(email: String, code: String, newPassword: String): Result<PasswordResetResponse> {
        return try {
            handlePasswordResetResponse(
                apiService.confirmPasswordReset(
                    PasswordResetConfirmRequest(
                        email = email.trim(),
                        code = code.trim(),
                        newPassword = newPassword
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

    private fun handlePasswordResetResponse(response: Response<PasswordResetResponse>): Result<PasswordResetResponse> {
        return if (response.isSuccessful) {
            val body = response.body()
            if (body != null && body.success) {
                Result.success(body)
            } else {
                Result.failure(
                    Exception(
                        userSafeMessage(
                            raw = body?.message,
                            fallback = "Reset password belum dapat diproses. Coba lagi."
                        ).withRequestReference(response)
                    )
                )
            }
        } else {
            val fallback = when (response.code()) {
                400, 401 -> "Kode reset tidak valid atau sudah kedaluwarsa."
                403 -> "Akun belum memiliki akses layanan."
                429 -> "Terlalu banyak percobaan. Coba lagi nanti."
                else -> "Reset password belum dapat diproses. Coba lagi."
            }
            Result.failure(
                Exception(fallback.withRequestReference(response))
            )
        }
    }

    private fun handleResponse(response: Response<AuthResponse>): Result<AuthResponse> {
        return if (response.isSuccessful) {
            val body = response.body()
            if (body != null && body.success) {
                Result.success(body)
            } else {
                Result.failure(
                    Exception(
                        userSafeMessage(
                            raw = body?.message,
                            fallback = "Akses belum dapat diproses. Coba lagi beberapa saat."
                        ).withRequestReference(response)
                    )
                )
            }
        } else {
            val fallback = when (response.code()) {
                401 -> "Email atau password tidak sesuai."
                403 -> "Akun belum memiliki akses layanan."
                429 -> "Terlalu banyak percobaan. Coba lagi nanti."
                else -> "Akses belum dapat diproses. Coba lagi beberapa saat."
            }
            Result.failure(
                Exception(fallback.withRequestReference(response))
            )
        }
    }

    private fun userSafeMessage(raw: String?, fallback: String): String {
        val message = raw?.trim().orEmpty()
        if (message.isBlank()) return fallback
        return if (technicalErrorMarkers.any { marker -> message.contains(marker, ignoreCase = true) }) {
            fallback
        } else {
            message.take(160)
        }
    }

}
