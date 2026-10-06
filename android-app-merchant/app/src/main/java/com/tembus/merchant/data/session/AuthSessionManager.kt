package com.tembus.merchant.data.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class SessionInvalidationReason {
    USER_LOGOUT,
    TOKEN_EXPIRED
}

data class MerchantAccessSession(
    val sessionToken: String,
    val branchId: String,
    val deviceId: String
)

/**
 * Auth Session Manager — token + user id merchant disimpan di EncryptedSharedPreferences.
 * Pola sama dengan customer app (FOOD-BIKE-028: ikuti struktur android-app-customer).
 */
class AuthSessionManager(private val context: Context) {

    private val sharedPreferences: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "merchant_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private val _isLoggedIn = MutableStateFlow(
        !sharedPreferences.getString(KEY_AUTH_TOKEN, null).isNullOrEmpty() &&
            !sharedPreferences.getString(KEY_USER_ID, null).isNullOrEmpty()
    )
    val isLoggedIn: Flow<Boolean> = _isLoggedIn.asStateFlow()

    private val _authToken = MutableStateFlow(sharedPreferences.getString(KEY_AUTH_TOKEN, null))
    val authToken: Flow<String?> = _authToken.asStateFlow()

    private val _refreshToken = MutableStateFlow(sharedPreferences.getString(KEY_REFRESH_TOKEN, null))
    val refreshToken: Flow<String?> = _refreshToken.asStateFlow()

    private val _userId = MutableStateFlow(sharedPreferences.getString(KEY_USER_ID, null))
    val userId: Flow<String?> = _userId.asStateFlow()

    private val _userName = MutableStateFlow(sharedPreferences.getString(KEY_USER_NAME, null))
    val userName: Flow<String?> = _userName.asStateFlow()

    private val _userEmail = MutableStateFlow(sharedPreferences.getString(KEY_USER_EMAIL, null))
    val userEmail: Flow<String?> = _userEmail.asStateFlow()

    private val _sessionInvalidationReason = MutableStateFlow<SessionInvalidationReason?>(null)
    val sessionInvalidationReason = _sessionInvalidationReason.asStateFlow()

    fun saveLogin(token: String, refreshToken: String?, userId: String, name: String?, email: String?) {
        sharedPreferences.edit().apply {
            putString(KEY_AUTH_TOKEN, token)
            putString(KEY_REFRESH_TOKEN, refreshToken)
            putString(KEY_USER_ID, userId)
            putString(KEY_USER_NAME, name)
            putString(KEY_USER_EMAIL, email)
            remove(KEY_MERCHANT_SESSION_TOKEN)
            remove(KEY_MERCHANT_BRANCH_ID)
            remove(KEY_MERCHANT_DEVICE_ID)
            apply()
        }
        _authToken.value = token
        _refreshToken.value = refreshToken
        _userId.value = userId
        _userName.value = name
        _userEmail.value = email
        _sessionInvalidationReason.value = null
        _isLoggedIn.value = true
    }

    /** Ganti access token (dan refresh token bila ada) setelah refresh — ADR-004. */
    fun updateTokens(newAccessToken: String, newRefreshToken: String?) {
        sharedPreferences.edit().apply {
            putString(KEY_AUTH_TOKEN, newAccessToken)
            if (!newRefreshToken.isNullOrBlank()) putString(KEY_REFRESH_TOKEN, newRefreshToken)
            apply()
        }
        _authToken.value = newAccessToken
        if (!newRefreshToken.isNullOrBlank()) _refreshToken.value = newRefreshToken
    }

    fun clearSession(reason: SessionInvalidationReason = SessionInvalidationReason.USER_LOGOUT) {
        sharedPreferences.edit().clear().apply()
        _authToken.value = null
        _refreshToken.value = null
        _userId.value = null
        _userName.value = null
        _userEmail.value = null
        _sessionInvalidationReason.value = reason
        _isLoggedIn.value = false
    }

    fun saveMerchantAccessSession(sessionToken: String, branchId: String, deviceId: String) {
        sharedPreferences.edit().apply {
            putString(KEY_MERCHANT_SESSION_TOKEN, sessionToken)
            putString(KEY_MERCHANT_BRANCH_ID, branchId)
            putString(KEY_MERCHANT_DEVICE_ID, deviceId)
            apply()
        }
    }

    fun getMerchantAccessSessionSync(): MerchantAccessSession? {
        val token = sharedPreferences.getString(KEY_MERCHANT_SESSION_TOKEN, null)
        val branchId = sharedPreferences.getString(KEY_MERCHANT_BRANCH_ID, null)
        val deviceId = sharedPreferences.getString(KEY_MERCHANT_DEVICE_ID, null)
        if (token.isNullOrBlank() || branchId.isNullOrBlank() || deviceId.isNullOrBlank()) return null
        return MerchantAccessSession(token, branchId, deviceId)
    }

    fun saveMerchantBranchId(branchId: String?) {
        sharedPreferences.edit().apply {
            if (branchId.isNullOrBlank()) remove(KEY_MERCHANT_BRANCH_ID)
            else putString(KEY_MERCHANT_BRANCH_ID, branchId)
            apply()
        }
    }

    fun getMerchantBranchIdSync(): String? = sharedPreferences.getString(KEY_MERCHANT_BRANCH_ID, null)

    fun clearMerchantAccessSession() {
        sharedPreferences.edit().apply {
            remove(KEY_MERCHANT_SESSION_TOKEN)
            remove(KEY_MERCHANT_BRANCH_ID)
            remove(KEY_MERCHANT_DEVICE_ID)
            apply()
        }
    }

    fun isTokenExpired(token: String): Boolean = false // JWT expiry di-handle refresh interceptor / 401 flow

    /** Baca userId sinkron dari SharedPreferences (untuk ViewModel init). */
    fun getUserIdSync(): String? = sharedPreferences.getString(KEY_USER_ID, null)

    /** Baca access token sinkron — dipakai TokenAuthenticator (OkHttp thread). */
    fun getAuthTokenSync(): String? = sharedPreferences.getString(KEY_AUTH_TOKEN, null)

    /** Baca refresh token sinkron — dipakai TokenAuthenticator (OkHttp thread). */
    fun getRefreshTokenSync(): String? = sharedPreferences.getString(KEY_REFRESH_TOKEN, null)

    companion object {
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USER_NAME = "user_name"
        private const val KEY_USER_EMAIL = "user_email"
        private const val KEY_MERCHANT_SESSION_TOKEN = "merchant_session_token"
        private const val KEY_MERCHANT_BRANCH_ID = "merchant_branch_id"
        private const val KEY_MERCHANT_DEVICE_ID = "merchant_device_id"
    }
}
