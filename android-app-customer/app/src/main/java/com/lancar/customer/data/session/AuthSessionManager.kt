package com.lancar.customer.data.session

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.nio.charset.StandardCharsets

enum class SessionInvalidationReason {
    USER_LOGOUT,
    TOKEN_EXPIRED
}

/**
 * Auth Session Manager for LANCAR Customer App using EncryptedSharedPreferences
 */
class AuthSessionManager(private val context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val sharedPreferences: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "secure_auth_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val _isLoggedIn = MutableStateFlow(
        !sharedPreferences.getString(KEY_AUTH_TOKEN, null).isNullOrEmpty() &&
        !sharedPreferences.getString(KEY_CUSTOMER_ID, null).isNullOrEmpty()
    )
    val isLoggedIn: Flow<Boolean> = _isLoggedIn.asStateFlow()

    private val _authToken = MutableStateFlow(sharedPreferences.getString(KEY_AUTH_TOKEN, null))
    val authToken: Flow<String?> = _authToken.asStateFlow()

    private val _customerId = MutableStateFlow(sharedPreferences.getString(KEY_CUSTOMER_ID, null))
    val customerId: Flow<String?> = _customerId.asStateFlow()

    private val _customerName = MutableStateFlow(sharedPreferences.getString(KEY_CUSTOMER_NAME, null))
    val customerName: Flow<String?> = _customerName.asStateFlow()

    private val _sessionInvalidationReason = MutableStateFlow<SessionInvalidationReason?>(null)
    val sessionInvalidationReason = _sessionInvalidationReason.asStateFlow()

    fun saveUserData(token: String, name: String) {
        sharedPreferences.edit().apply {
            if (token.isNotBlank()) {
                putString(KEY_AUTH_TOKEN, token)
            }
            putString(KEY_CUSTOMER_NAME, name)
            apply()
        }
        if (token.isNotBlank()) {
            _authToken.value = token
        }
        _customerName.value = name
        _sessionInvalidationReason.value = null
        _isLoggedIn.value = !sharedPreferences.getString(KEY_AUTH_TOKEN, null).isNullOrEmpty() &&
            !sharedPreferences.getString(KEY_CUSTOMER_ID, null).isNullOrEmpty()
    }

    fun updateCustomerName(name: String) {
        sharedPreferences.edit().apply {
            putString(KEY_CUSTOMER_NAME, name)
            apply()
        }
        _customerName.value = name
    }

    fun saveSessionSync(token: String, id: String, name: String? = "") {
        sharedPreferences.edit().apply {
            putString(KEY_AUTH_TOKEN, token)
            putString(KEY_CUSTOMER_ID, id)
            putString(KEY_CUSTOMER_NAME, name ?: "")
            apply()
        }
        _authToken.value = token
        _customerId.value = id
        _customerName.value = name ?: ""
        _sessionInvalidationReason.value = null
        _isLoggedIn.value = true
    }

    suspend fun saveSession(token: String, id: String, name: String? = "") {
        saveSessionSync(token, id, name)
    }

    suspend fun clearSession(reason: SessionInvalidationReason = SessionInvalidationReason.USER_LOGOUT) {
        sharedPreferences.edit().clear().apply()
        _authToken.value = null
        _customerId.value = null
        _customerName.value = null
        _sessionInvalidationReason.value = reason
        _isLoggedIn.value = false
    }

    fun consumeSessionInvalidationReason() {
        _sessionInvalidationReason.value = null
    }

    fun isCurrentTokenExpired(clockSkewSeconds: Long = TOKEN_EXPIRY_CLOCK_SKEW_SECONDS): Boolean {
        return isTokenExpired(sharedPreferences.getString(KEY_AUTH_TOKEN, null), clockSkewSeconds)
    }

    fun isTokenExpired(
        token: String?,
        clockSkewSeconds: Long = TOKEN_EXPIRY_CLOCK_SKEW_SECONDS
    ): Boolean {
        val expiresAtEpochSeconds = parseJwtExpirationEpochSeconds(token) ?: return false
        val currentEpochSeconds = System.currentTimeMillis() / 1000
        return expiresAtEpochSeconds <= currentEpochSeconds + clockSkewSeconds
    }

    suspend fun getTokenOnce(): String? {
        return sharedPreferences.getString(KEY_AUTH_TOKEN, null)
    }

    fun getTokenSync(): String? {
        return sharedPreferences.getString(KEY_AUTH_TOKEN, null)
    }

    fun getUserIdSync(): String? {
        return sharedPreferences.getString(KEY_CUSTOMER_ID, null)
    }

    companion object {
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_CUSTOMER_ID = "customer_id"
        private const val KEY_CUSTOMER_NAME = "customer_name"
        private const val TOKEN_EXPIRY_CLOCK_SKEW_SECONDS = 60L

        private fun parseJwtExpirationEpochSeconds(token: String?): Long? {
            if (token.isNullOrBlank()) return null
            val parts = token.split(".")
            if (parts.size < 2) return null

            return runCatching {
                val payloadBytes = Base64.decode(
                    parts[1],
                    Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
                )
                val payload = String(payloadBytes, StandardCharsets.UTF_8)
                JSONObject(payload).optLong("exp", -1L).takeIf { it > 0L }
            }.getOrNull()
        }
    }
}
