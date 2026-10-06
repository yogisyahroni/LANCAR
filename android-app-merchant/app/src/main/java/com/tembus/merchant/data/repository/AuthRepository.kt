package com.tembus.merchant.data.repository

import com.tembus.merchant.data.api.MerchantErrorMessages
import com.tembus.merchant.data.api.TEMBUSApiService
import com.tembus.merchant.data.device.DeviceIdentityProvider
import com.tembus.merchant.data.model.AccountRegistrationRequest
import com.tembus.merchant.data.model.AuthResponse
import com.tembus.merchant.data.model.LoginRequest
import com.tembus.merchant.data.model.OtpVerifyRequest
import com.tembus.merchant.data.model.RefreshTokenRequest
import com.tembus.merchant.data.onboarding.OnboardingPreferences
import com.tembus.merchant.data.session.AuthSessionManager

/**
 * AuthRepository — login email/password + simpan sesi.
 * Endpoint login auth-service generic untuk semua role (termasuk merchant).
 */
class AuthRepository(
    private val api: TEMBUSApiService,
    private val sessionManager: AuthSessionManager,
    private val onboardingPreferences: OnboardingPreferences,
    private val deviceIdentityProvider: DeviceIdentityProvider
) {

    suspend fun login(email: String, password: String): Result<AuthResponse> {
        return try {
            val resp = api.login(
                LoginRequest(
                    email = email.trim(),
                    password = password,
                    deviceId = deviceIdentityProvider.deviceId(),
                    deviceInfo = deviceIdentityProvider.deviceInfo()
                )
            )
            if (!resp.isSuccessful) {
                val body = resp.errorBody()?.string()
                throw Exception(parseErrorMessage(body, "Login gagal"))
            }
            val auth = resp.body() ?: throw Exception("Response kosong")
            if (auth.success == false) {
                throw Exception(auth.message ?: "Login gagal")
            }

            saveAuthenticatedSession(auth, email)
            Result.success(auth)
        } catch (error: Exception) {
            Result.failure(Exception(MerchantErrorMessages.from(error, "Login gagal. Periksa email dan password Anda."), error))
        }
    }

    suspend fun startAccountRegistration(
        fullName: String,
        email: String,
        phoneNumber: String,
        password: String
    ): Result<AuthResponse> {
        return try {
            val response = api.startAccountRegistration(
                AccountRegistrationRequest(
                    fullName = fullName.trim(),
                    email = email.trim(),
                    phoneNumber = phoneNumber.trim(),
                    password = password,
                    deviceId = deviceIdentityProvider.deviceId(),
                    deviceInfo = deviceIdentityProvider.deviceInfo()
                )
            )
            if (!response.isSuccessful) {
                throw Exception(parseErrorMessage(response.errorBody()?.string(), "Pendaftaran akun belum dapat diproses"))
            }
            val auth = response.body() ?: throw Exception("Response pendaftaran kosong")
            if (auth.success == false) throw Exception(auth.message ?: "Pendaftaran akun belum dapat diproses")
            Result.success(auth)
        } catch (error: Exception) {
            Result.failure(Exception(MerchantErrorMessages.from(error, "Pendaftaran akun belum dapat diproses. Coba lagi."), error))
        }
    }

    suspend fun verifyAccountRegistrationOtp(email: String, code: String): Result<AuthResponse> {
        return try {
            val response = api.verifyRegistrationOtp(
                OtpVerifyRequest(
                    phoneNumber = email.trim(),
                    code = code.trim(),
                    deviceId = deviceIdentityProvider.deviceId(),
                    deviceInfo = deviceIdentityProvider.deviceInfo()
                )
            )
            if (!response.isSuccessful) {
                throw Exception(parseErrorMessage(response.errorBody()?.string(), "Kode verifikasi tidak sesuai"))
            }
            val auth = response.body() ?: throw Exception("Response verifikasi kosong")
            if (auth.success == false) throw Exception(auth.message ?: "Kode verifikasi tidak sesuai")
            saveAuthenticatedSession(auth, email)
            Result.success(auth)
        } catch (error: Exception) {
            Result.failure(Exception(MerchantErrorMessages.from(error, "Kode verifikasi tidak sesuai atau sudah kedaluwarsa."), error))
        }
    }

    /** Refresh manual (dipakai TokenAuthenticator via OkHttp; di sini untuk reuse logic). */
    suspend fun refreshSession(): Result<Boolean> = runCatching {
        val refreshToken = sessionManager.getRefreshTokenSync()
            ?: throw Exception("Tidak ada refresh token")
        val resp = api.refreshToken(
            RefreshTokenRequest(refreshToken, deviceIdentityProvider.deviceId())
        )
        if (!resp.isSuccessful) throw Exception("Refresh gagal")
        val auth = resp.body() ?: throw Exception("Response kosong")
        val newAccess = auth.accessToken ?: auth.data?.token
            ?: throw Exception("Access token tidak ditemukan")
        val newRefresh = auth.refreshToken ?: refreshToken
        sessionManager.updateTokens(newAccess, newRefresh)
        true
    }

    fun logout() {
        sessionManager.clearSession()
    }

    suspend fun saveSessionFromAuth(auth: AuthResponse, fallbackEmail: String): Result<Unit> =
        runCatching { saveAuthenticatedSession(auth, fallbackEmail) }

    private suspend fun saveAuthenticatedSession(auth: AuthResponse, fallbackEmail: String) {
        val token = auth.accessToken
            ?: auth.data?.token
            ?: throw Exception("Token tidak ditemukan di response")
        val userId = auth.authUser?.id
            ?: auth.data?.customerId
            ?: throw Exception("User ID tidak ditemukan di response")
        val name = auth.authUser?.name ?: auth.authUser?.fullName ?: auth.data?.name
        val emailSaved = auth.authUser?.email ?: fallbackEmail

        sessionManager.saveLogin(token, auth.refreshToken, userId, name, emailSaved)
        onboardingPreferences.markHadLoggedIn()
    }

    private fun parseErrorMessage(body: String?, fallback: String): String {
        if (body.isNullOrBlank()) return fallback
        return try {
            val json = org.json.JSONObject(body)
            MerchantErrorMessages.from(
                Exception(json.optString("message").takeIf { it.isNotBlank() } ?: json.optString("error")),
                fallback
            )
        } catch (e: Exception) {
            fallback
        }
    }
}
