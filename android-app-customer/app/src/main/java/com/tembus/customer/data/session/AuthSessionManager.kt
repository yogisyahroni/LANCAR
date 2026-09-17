package com.tembus.customer.data.session

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.io.File
import java.nio.charset.StandardCharsets

enum class SessionInvalidationReason {
    USER_LOGOUT,
    TOKEN_EXPIRED
}

/**
 * Auth Session Manager for TEMBUS Customer App using EncryptedSharedPreferences
 */
class AuthSessionManager(private val context: Context) {

    private val sharedPreferences: SharedPreferences by lazy {
        createSecurePreferences()
    }

    private val _isLoggedIn = MutableStateFlow(com.tembus.customer.BuildConfig.DEBUG)
    val isLoggedIn: Flow<Boolean> = _isLoggedIn.asStateFlow()

    private val _authToken = MutableStateFlow<String?>(if (com.tembus.customer.BuildConfig.DEBUG) "debug_active_token" else null)
    val authToken: Flow<String?> = _authToken.asStateFlow()

    private val _customerId = MutableStateFlow<String?>(if (com.tembus.customer.BuildConfig.DEBUG) "CUST-DEBUG-001" else null)
    val customerId: Flow<String?> = _customerId.asStateFlow()

    private val _customerName = MutableStateFlow<String?>(if (com.tembus.customer.BuildConfig.DEBUG) "Pelanggan TEMBUS" else null)
    val customerName: Flow<String?> = _customerName.asStateFlow()

    init {
        // Baca secure prefs di IO, jangan block main thread (penyebab splash nyangkut).
        kotlinx.coroutines.GlobalScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            runCatching {
                val token = sharedPreferences.getString(KEY_AUTH_TOKEN, null)
                val cid = sharedPreferences.getString(KEY_CUSTOMER_ID, null)
                // UAT FIX: sesi real yang tersimpan tidak boleh ditimpa token debug.
                // Token debug hanya dipakai sebagai fallback saat belum ada sesi sama sekali,
                // supaya login asli di build DEBUG tetap bertahan setelah cold start.
                if (!token.isNullOrEmpty() && !cid.isNullOrEmpty() && token != DEBUG_FALLBACK_TOKEN) {
                    _isLoggedIn.value = true
                    _authToken.value = token
                    _customerId.value = cid
                    _customerName.value = sharedPreferences.getString(KEY_CUSTOMER_NAME, null)
                } else if (com.tembus.customer.BuildConfig.DEBUG) {
                    saveSessionSync(DEBUG_FALLBACK_TOKEN, DEBUG_FALLBACK_CUSTOMER_ID, "Pelanggan TEMBUS")
                } else {
                    _isLoggedIn.value = false
                    _authToken.value = null
                    _customerId.value = null
                    _customerName.value = null
                }
            }
        }
    }

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

    fun saveSessionSync(
        token: String,
        id: String,
        name: String? = "",
        refreshToken: String? = null,
        deviceId: String? = null,
    ) {
        sharedPreferences.edit().apply {
            putString(KEY_AUTH_TOKEN, token)
            putString(KEY_CUSTOMER_ID, id)
            putString(KEY_CUSTOMER_NAME, name ?: "")
            // Refresh token & device id hanya ditimpa bila ada nilai baru,
            // supaya silent-refresh parsial tidak menghapus kredensial refresh.
            if (!refreshToken.isNullOrBlank()) putString(KEY_REFRESH_TOKEN, refreshToken)
            if (!deviceId.isNullOrBlank()) putString(KEY_DEVICE_ID, deviceId)
            apply()
        }
        _authToken.value = token
        _customerId.value = id
        _customerName.value = name ?: ""
        _sessionInvalidationReason.value = null
        _isLoggedIn.value = true
    }

    suspend fun saveSession(
        token: String,
        id: String,
        name: String? = "",
        refreshToken: String? = null,
        deviceId: String? = null,
    ) {
        saveSessionSync(token, id, name, refreshToken, deviceId)
    }

    /** Refresh token tersimpan (null bila belum pernah login dengan refresh). */
    fun getRefreshTokenSync(): String? {
        return sharedPreferences.getString(KEY_REFRESH_TOKEN, null)
    }

    /** Device id yang dipakai saat login (untuk /auth/refresh). */
    fun getDeviceIdSync(): String? {
        return sharedPreferences.getString(KEY_DEVICE_ID, null)
    }

    suspend fun clearSession(reason: SessionInvalidationReason = SessionInvalidationReason.USER_LOGOUT) {
        if (com.tembus.customer.BuildConfig.DEBUG && reason == SessionInvalidationReason.TOKEN_EXPIRED) {
            return
        }
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
        if (com.tembus.customer.BuildConfig.DEBUG) return false
        return isTokenExpired(sharedPreferences.getString(KEY_AUTH_TOKEN, null), clockSkewSeconds)
    }

    /**
     * UAT FIX: cek kedaluwarsa JWT tersimpan TANPA bypass DEBUG.
     * Dipakai routing cold-start supaya token real yang sudah kedaluwarsa
     * tidak dianggap valid (yang menyebabkan banner 401 abadi di build DEBUG).
     * Token debug/placeholder, token kosong, dan token yang tidak bisa di-parse
     * dianggap TIDAK kedaluwarsa (perilaku lama dipertahankan).
     */
    fun isStoredRealTokenExpired(clockSkewSeconds: Long = TOKEN_EXPIRY_CLOCK_SKEW_SECONDS): Boolean {
        val stored = sharedPreferences.getString(KEY_AUTH_TOKEN, null)
        if (stored.isNullOrBlank() || stored == DEBUG_FALLBACK_TOKEN) return false
        val expiresAtEpochSeconds = parseJwtExpirationEpochSeconds(stored) ?: return false
        val currentEpochSeconds = System.currentTimeMillis() / 1000
        return expiresAtEpochSeconds <= currentEpochSeconds + clockSkewSeconds
    }

    fun isTokenExpired(
        token: String?,
        clockSkewSeconds: Long = TOKEN_EXPIRY_CLOCK_SKEW_SECONDS
    ): Boolean {
        if (com.tembus.customer.BuildConfig.DEBUG) return false
        val expiresAtEpochSeconds = parseJwtExpirationEpochSeconds(token) ?: return false
        val currentEpochSeconds = System.currentTimeMillis() / 1000
        return expiresAtEpochSeconds <= currentEpochSeconds + clockSkewSeconds
    }

    suspend fun getTokenOnce(): String? {
        // UAT FIX: kembalikan token real bila ada; token debug hanya fallback.
        val stored = sharedPreferences.getString(KEY_AUTH_TOKEN, null)
        if (!stored.isNullOrBlank() && stored != DEBUG_FALLBACK_TOKEN) return stored
        if (com.tembus.customer.BuildConfig.DEBUG) {
            return stored ?: DEBUG_FALLBACK_TOKEN
        }
        return stored
    }

    fun getTokenSync(): String? {
        // UAT FIX: kembalikan token real bila ada; token debug hanya fallback.
        val stored = sharedPreferences.getString(KEY_AUTH_TOKEN, null)
        if (!stored.isNullOrBlank() && stored != DEBUG_FALLBACK_TOKEN) return stored
        if (com.tembus.customer.BuildConfig.DEBUG) {
            return stored ?: DEBUG_FALLBACK_TOKEN
        }
        return stored
    }

    fun getUserIdSync(): String? {
        return sharedPreferences.getString(KEY_CUSTOMER_ID, null)
    }

    /** Nama tersimpan (untuk dipertahankan saat refresh token). */
    fun getCustomerNameSync(): String? {
        return sharedPreferences.getString(KEY_CUSTOMER_NAME, null)
    }

    companion object {
        private const val TAG = "AuthSessionManager"
        private const val SECURE_PREFS_NAME = "secure_auth_prefs"
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_CUSTOMER_ID = "customer_id"
        private const val KEY_CUSTOMER_NAME = "customer_name"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_DEVICE_ID = "device_id"
        // Token debug hanya fallback UAT offline; sesi real selalu diutamakan.
        private const val DEBUG_FALLBACK_TOKEN = "debug_active_token"
        private const val DEBUG_FALLBACK_CUSTOMER_ID = "CUST-DEBUG-001"
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

    private fun createSecurePreferences(): SharedPreferences {
        return runCatching {
            encryptedPreferences()
        }.getOrElse { error ->
            Log.e(TAG, "Encrypted session storage initialization failed. Recreating local secure store.", error)
            runCatching {
                File("${context.filesDir.parent}/shared_prefs/$SECURE_PREFS_NAME.xml").delete()
            }
            encryptedPreferences()
        }
    }

    private fun encryptedPreferences(): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        return EncryptedSharedPreferences.create(
            context,
            SECURE_PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }
}
