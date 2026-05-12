package com.lancar.customer.data.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

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

    fun saveUserData(token: String, name: String) {
        sharedPreferences.edit().apply {
            putString(KEY_AUTH_TOKEN, token)
            putString(KEY_CUSTOMER_NAME, name)
            apply()
        }
        _authToken.value = token
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
        _isLoggedIn.value = true
    }

    suspend fun saveSession(token: String, id: String, name: String? = "") {
        saveSessionSync(token, id, name)
    }

    suspend fun clearSession() {
        sharedPreferences.edit().clear().apply()
        _authToken.value = null
        _customerId.value = null
        _customerName.value = null
        _isLoggedIn.value = false
    }

    suspend fun getTokenOnce(): String? {
        return sharedPreferences.getString(KEY_AUTH_TOKEN, null)
    }

    fun getTokenSync(): String? {
        return sharedPreferences.getString(KEY_AUTH_TOKEN, null)
    }

    companion object {
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_CUSTOMER_ID = "customer_id"
        private const val KEY_CUSTOMER_NAME = "customer_name"
    }
}
