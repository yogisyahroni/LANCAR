package com.tembus.merchant.data.repository

import com.tembus.merchant.data.api.TEMBUSApiService
import com.tembus.merchant.data.model.AuthResponse
import com.tembus.merchant.data.model.LoginRequest
import com.tembus.merchant.data.onboarding.OnboardingPreferences
import com.tembus.merchant.data.session.AuthSessionManager

/**
 * AuthRepository — login email/password + simpan sesi.
 * Endpoint login auth-service generic untuk semua role (termasuk merchant).
 */
class AuthRepository(
    private val api: TEMBUSApiService,
    private val sessionManager: AuthSessionManager,
    private val onboardingPreferences: OnboardingPreferences
) {

    suspend fun login(email: String, password: String): Result<AuthResponse> {
        return runCatching {
            val resp = api.login(
                LoginRequest(
                    email = email.trim(),
                    password = password
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

            // Ekstrak token + user id (toleran terhadap beberapa bentuk response)
            val token = auth.accessToken
                ?: auth.data?.token
                ?: throw Exception("Token tidak ditemukan di response")
            val userId = auth.authUser?.id
                ?: auth.data?.customerId
                ?: throw Exception("User ID tidak ditemukan di response")
            val name = auth.authUser?.name ?: auth.authUser?.fullName ?: auth.data?.name
            val emailSaved = auth.authUser?.email ?: email

            sessionManager.saveLogin(token, userId, name, emailSaved)
            onboardingPreferences.markHadLoggedIn()
            auth
        }
    }

    fun logout() {
        sessionManager.clearSession()
    }

    private fun parseErrorMessage(body: String?, fallback: String): String {
        if (body.isNullOrBlank()) return fallback
        return try {
            val json = org.json.JSONObject(body)
            json.optString("message")?.takeIf { it.isNotBlank() }
                ?: json.optString("error")?.takeIf { it.isNotBlank() }
                ?: fallback
        } catch (e: Exception) {
            fallback
        }
    }
}
