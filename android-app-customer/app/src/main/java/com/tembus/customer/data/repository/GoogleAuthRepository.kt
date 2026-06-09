package com.tembus.customer.data.repository

import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.api.withRequestReference
import com.tembus.customer.data.device.DeviceIdentityProvider
import com.tembus.customer.data.model.CustomerOtpSendRequest
import com.tembus.customer.data.model.CustomerOtpSendResponse
import com.tembus.customer.data.model.CustomerOtpVerifyRequest
import com.tembus.customer.data.model.CustomerOtpVerifyResponse
import com.tembus.customer.data.model.GoogleAuthCompleteRequest
import com.tembus.customer.data.model.GoogleAuthCompleteResponse
import com.tembus.customer.data.model.GoogleAuthStartRequest
import com.tembus.customer.data.model.GoogleAuthStartResponse
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * GoogleAuthRepository handles all Google OAuth and Customer OTP API calls.
 * Follows the same Result<T> pattern as AuthRepository.
 */
@Singleton
class GoogleAuthRepository @Inject constructor(
    private val apiService: TEMBUSApiService,
    private val deviceIdentityProvider: DeviceIdentityProvider
) {
    private val technicalErrorMarkers = listOf(
        "HTTP ", "Exception", "retrofit", "okhttp",
        "java.", "kotlin.", "failed to", "Unable to",
        "UnknownHost", "timeout", "SSL", "certificate", "stack"
    )

    // ─────────────────────────────────────────────
    // Google Auth
    // ─────────────────────────────────────────────

    /**
     * startGoogleAuth — creates a Google auth transaction on the backend.
     * Returns the nonce + authorization URL to use with Credential Manager.
     */
    suspend fun startGoogleAuth(): Result<GoogleAuthStartResponse> {
        return try {
            handleGoogleStartResponse(
                apiService.startGoogleAuth(
                    GoogleAuthStartRequest(deviceId = deviceIdentityProvider.deviceId())
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * completeGoogleAuth — sends the ID token obtained from Google Credential Manager
     * to the backend and returns the polymorphic status response.
     */
    suspend fun completeGoogleAuth(
        idToken: String,
        nonce: String?,
        transactionId: String?
    ): Result<GoogleAuthCompleteResponse> {
        return try {
            handleGoogleCompleteResponse(
                apiService.completeGoogleAuth(
                    GoogleAuthCompleteRequest(
                        idToken = idToken,
                        nonce = nonce,
                        transactionId = transactionId,
                        deviceId = deviceIdentityProvider.deviceId(),
                        deviceInfo = deviceIdentityProvider.deviceInfo()
                    )
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ─────────────────────────────────────────────
    // Customer OTP
    // ─────────────────────────────────────────────

    /**
     * sendCustomerOtp — sends an OTP to a phone number via Zenziva.
     * Optionally tied to a Google auth transaction for step-up flows.
     */
    suspend fun sendCustomerOtp(
        phoneNumber: String,
        channel: String = "whatsapp",
        transactionId: String? = null
    ): Result<CustomerOtpSendResponse> {
        return try {
            handleOtpSendResponse(
                apiService.sendCustomerOtp(
                    CustomerOtpSendRequest(
                        phoneNumber = phoneNumber,
                        channel = channel,
                        transactionId = transactionId,
                        deviceId = deviceIdentityProvider.deviceId()
                    )
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * verifyCustomerOtp — verifies the OTP code entered by the user.
     */
    suspend fun verifyCustomerOtp(
        challengeId: String,
        code: String,
        phoneNumber: String
    ): Result<CustomerOtpVerifyResponse> {
        return try {
            handleOtpVerifyResponse(
                apiService.verifyCustomerOtp(
                    CustomerOtpVerifyRequest(
                        challengeId = challengeId,
                        code = code,
                        phoneNumber = phoneNumber,
                        deviceId = deviceIdentityProvider.deviceId(),
                        deviceInfo = deviceIdentityProvider.deviceInfo()
                    )
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ─────────────────────────────────────────────
    // Response handlers
    // ─────────────────────────────────────────────

    private fun handleGoogleStartResponse(
        response: Response<GoogleAuthStartResponse>
    ): Result<GoogleAuthStartResponse> {
        return if (response.isSuccessful) {
            val body = response.body()
            if (body != null) {
                Result.success(body)
            } else {
                Result.failure(Exception("Respons Google Auth tidak valid. Coba lagi."))
            }
        } else {
            val fallback = when (response.code()) {
                403 -> "Fitur login Google belum tersedia."
                429 -> "Terlalu banyak percobaan. Coba lagi nanti."
                else -> "Login Google belum dapat diproses. Coba lagi."
            }
            Result.failure(Exception(fallback.withHttpDiagnostics(response)))
        }
    }

    private fun handleGoogleCompleteResponse(
        response: Response<GoogleAuthCompleteResponse>
    ): Result<GoogleAuthCompleteResponse> {
        return if (response.isSuccessful) {
            val body = response.body()
            if (body != null) {
                Result.success(body)
            } else {
                Result.failure(Exception("Verifikasi Google gagal. Coba lagi."))
            }
        } else {
            val fallback = when (response.code()) {
                401 -> "Token Google tidak valid atau sudah kedaluwarsa."
                403 -> "Akun tidak memiliki akses layanan."
                409 -> "Email sudah terdaftar dengan metode login lain."
                429 -> "Terlalu banyak percobaan. Coba lagi nanti."
                else -> "Verifikasi Google belum dapat diproses. Coba lagi."
            }
            Result.failure(Exception(fallback.withHttpDiagnostics(response)))
        }
    }

    private fun handleOtpSendResponse(
        response: Response<CustomerOtpSendResponse>
    ): Result<CustomerOtpSendResponse> {
        return if (response.isSuccessful) {
            val body = response.body()
            if (body != null) {
                Result.success(body)
            } else {
                Result.failure(Exception("Kode OTP belum dapat dikirim. Coba lagi."))
            }
        } else {
            val fallback = when (response.code()) {
                400 -> "Nomor handphone tidak valid."
                429 -> "Terlalu banyak permintaan OTP. Coba beberapa menit lagi."
                else -> "Kode OTP belum dapat dikirim. Coba lagi."
            }
            Result.failure(Exception(fallback.withHttpDiagnostics(response)))
        }
    }

    private fun handleOtpVerifyResponse(
        response: Response<CustomerOtpVerifyResponse>
    ): Result<CustomerOtpVerifyResponse> {
        return if (response.isSuccessful) {
            val body = response.body()
            if (body != null) {
                Result.success(body)
            } else {
                Result.failure(Exception("Verifikasi OTP gagal. Coba lagi."))
            }
        } else {
            val fallback = when (response.code()) {
                400, 401 -> "Kode OTP tidak valid atau sudah kedaluwarsa."
                429 -> "Terlalu banyak percobaan. Tunggu sebentar."
                else -> "Verifikasi OTP belum dapat diproses. Coba lagi."
            }
            Result.failure(Exception(fallback.withHttpDiagnostics(response)))
        }
    }

    private fun String.withHttpDiagnostics(response: Response<*>): String {
        return "$this (HTTP ${response.code()})".withRequestReference(response)
    }

    @Suppress("unused")
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
