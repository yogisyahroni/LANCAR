package com.tembus.courier.data.session

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import android.util.Log
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import com.tembus.courier.notification.FcmTopicManager
import org.json.JSONObject
import java.io.File

private val Context.legacyDataStore: DataStore<Preferences> by preferencesDataStore(name = "auth_session")

/**
 * Encrypted Auth Session Manager for TEMBUS Courier App
 *
 * Manages courier authentication session using AndroidX Security EncryptedSharedPreferences.
 * Encrypts auth token, courier ID, and courier name locally using AES-256-GCM.
 * Exposes in-memory StateFlows for instant reactive lookups & synchronous getters for Interceptors.
 * Also provides legacy migration from standard Preferences DataStore to prevent logged out users.
 */
class AuthSessionManager(private val context: Context) {

    private val topicScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val sharedPreferences: SharedPreferences by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                "secure_auth_session",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.e(
                "AuthSessionManager",
                "Gagal menginisialisasi EncryptedSharedPreferences. Melakukan fallback.",
                e
            )
            // In rare cases of Keystore corruption, we wipe the corrupted store to prevent app crashes
            try {
                val sharedPrefsFile =
                    File("${context.filesDir.parent}/shared_prefs/secure_auth_session.xml")
                if (sharedPrefsFile.exists()) sharedPrefsFile.delete()
            } catch (ex: Exception) {
            }

            // Retry creation
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                "secure_auth_session",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }
    }

    // ── IN-MEMORY TOKEN CACHE FOR FAST INTERCEPTION ──
    private val _authTokenFlow = MutableStateFlow<String?>(null)
    private val _courierIdFlow = MutableStateFlow<String?>(null)
    private val _courierNameFlow = MutableStateFlow<String?>(null)
    private val _isLoggedInFlow = MutableStateFlow(false)
    private val _isOnlineFlow = MutableStateFlow(false)
    /** Unix epoch seconds when current token expires. 0 = unknown/never parsed. */
    private val _tokenExpiresAtFlow = MutableStateFlow(0L)

    // Public Reactive API matching original signatures
    val authToken: Flow<String?> = _authTokenFlow.asStateFlow()
    val courierId: Flow<String?> = _courierIdFlow.asStateFlow()
    val courierName: Flow<String?> = _courierNameFlow.asStateFlow()
    /**
     * S2-MA-02 Fix: isLoggedIn now emits false when the persisted JWT has expired,
     * even before the server rejects the request. This prevents stale session state
     * from misleading the UI and background workers.
     */
    val isLoggedIn: Flow<Boolean> = _isLoggedInFlow.asStateFlow().map { loggedIn ->
        loggedIn && !isTokenExpired()
    }
    val isOnline: Flow<Boolean> = _isOnlineFlow.asStateFlow()

    init {
        // 1. Load existing credentials into memory synchronously
        loadCredentialsIntoCache()

        // 2. Trigger async migration from legacy DataStore if present
        CoroutineScope(Dispatchers.IO).launch {
            migrateLegacyDataStore()
        }
    }

    private fun loadCredentialsIntoCache() {
        val token = sharedPreferences.getString(KEY_AUTH_TOKEN, null)
        val cid = sharedPreferences.getString(KEY_COURIER_ID, null)
        val name = sharedPreferences.getString(KEY_COURIER_NAME, null) ?: ""
        val online = sharedPreferences.getBoolean(KEY_IS_ONLINE, false)
        val storedExp = sharedPreferences.getLong(KEY_TOKEN_EXPIRES_AT, 0L)

        _authTokenFlow.value = token
        _courierIdFlow.value = cid
        _courierNameFlow.value = name
        _isLoggedInFlow.value = !token.isNullOrEmpty() && !cid.isNullOrEmpty()
        _isOnlineFlow.value = online
        _tokenExpiresAtFlow.value = if (storedExp > 0L) storedExp else extractJwtExpiry(token)

        // Ensure FCM topic subscription (courier_all + courier_online) is active for
        // already-logged-in couriers whose token predates the broadcast feature.
        if (!token.isNullOrEmpty()) {
            topicScope.launch {
                try {
                    FcmTopicManager.sync(_isOnlineFlow.value)
                } catch (error: Exception) {
                    Log.w("AuthSessionManager", "Topic sync skipped: ${error.message}")
                }
            }
        }
    }

    // ── JWT EXPIRY HELPERS (S2-MA-02) ────────────────────────────────────────────

    /**
     * Decode the JWT payload and extract the `exp` Unix timestamp (seconds).
     * NOTE: This does NOT verify the signature — that is the server's responsibility.
     * This is purely a client-side guard to avoid using a known-expired token.
     * Returns 0L on any parse failure (treated as unknown, not expired).
     */
    private fun extractJwtExpiry(token: String?): Long {
        if (token.isNullOrBlank()) return 0L
        return try {
            val parts = token.split('.')
            if (parts.size != 3) return 0L
            // Add padding required by standard Base64 decoder
            val payload = parts[1].let { encoded ->
                val padded = encoded.length % 4
                if (padded == 0) encoded else encoded + "=".repeat(4 - padded)
            }
            val decoded = Base64.decode(payload, Base64.URL_SAFE or Base64.NO_WRAP)
            val json = JSONObject(String(decoded, Charsets.UTF_8))
            json.optLong("exp", 0L)
        } catch (e: Exception) {
            Log.w("AuthSessionManager", "Failed to parse JWT expiry: ${e.message}")
            0L
        }
    }

    /**
     * Returns true when the cached token's `exp` claim is in the past.
     * A token with exp==0 (unknown) is treated as NOT expired.
     * A 60-second clock-skew buffer prevents premature logout on slow devices.
     */
    fun isTokenExpired(): Boolean {
        val exp = _tokenExpiresAtFlow.value
        if (exp <= 0L) return false
        val nowSeconds = System.currentTimeMillis() / 1000L
        val clockSkewSeconds = 60L
        return nowSeconds >= (exp - clockSkewSeconds)
    }

    /**
     * FAST SYNCHRONOUS ACCESS FOR OKHTTP INTERCEPTORS
     */
    fun getAuthTokenSync(): String? {
        return _authTokenFlow.value
    }

    fun getCourierIdSync(): String? {
        return _courierIdFlow.value
    }

    /**
     * Save session securely
     */
    suspend fun saveSession(authToken: String, courierId: String, courierName: String = "") {
        val exp = extractJwtExpiry(authToken)
        sharedPreferences.edit().apply {
            putString(KEY_AUTH_TOKEN, authToken)
            putString(KEY_COURIER_ID, courierId)
            putString(KEY_COURIER_NAME, courierName)
            if (exp > 0L) putLong(KEY_TOKEN_EXPIRES_AT, exp)
            apply() // asynchronous save to disk
        }

        // Instantly update in-memory cache
        _authTokenFlow.value = authToken
        _courierIdFlow.value = courierId
        _courierNameFlow.value = courierName
        _tokenExpiresAtFlow.value = exp
        _isLoggedInFlow.value = true
    }

    /**
     * Update the active duty status (Online/Offline)
     */
    suspend fun setOnlineStatus(online: Boolean) {
        sharedPreferences.edit().apply {
            putBoolean(KEY_IS_ONLINE, online)
            apply()
        }
        _isOnlineFlow.value = online
        Log.d("AuthSessionManager", "Status online diubah menjadi: $online")
    }

    /**
     * Synchronously clear session data immediately.
     * Optimized for execution on background threads/interceptors.
     */
    fun clearSessionSync() {
        sharedPreferences.edit().apply {
            remove(KEY_AUTH_TOKEN)
            remove(KEY_COURIER_ID)
            remove(KEY_COURIER_NAME)
            remove(KEY_IS_ONLINE)
            remove(KEY_TOKEN_EXPIRES_AT)
            apply()
        }

        // Flush memory cache instantly
        _authTokenFlow.value = null
        _courierIdFlow.value = null
        _courierNameFlow.value = null
        _isLoggedInFlow.value = false
        _isOnlineFlow.value = false
        _tokenExpiresAtFlow.value = 0L

        Log.d("AuthSessionManager", "Sesi kurir berhasil dihapus secara sinkron.")
    }

    /**
     * Clear session securely on logout (Suspendable bridge for UI flows)
     */
    suspend fun clearSession() {
        clearSessionSync()
    }

    /**
     * Get current session — safe one-shot read
     * Returns null if not logged in
     */
    suspend fun getSession(): SessionData? {
        val token = _authTokenFlow.value
        val cid = _courierIdFlow.value
        val name = _courierNameFlow.value ?: ""
        // S2-MA-02: Fail-closed — expired token is treated as no session.
        // The server would reject it anyway; refuse to even send the request.
        if (isTokenExpired()) {
            Log.w("AuthSessionManager", "Token telah kedaluwarsa. Menghapus sesi secara otomatis.")
            clearSessionSync()
            return null
        }
        return if (!token.isNullOrEmpty() && !cid.isNullOrEmpty()) {
            SessionData(token, cid, name)
        } else null
    }

    /**
     * Graceful migration logic to move users from plain DataStore to EncryptedStorage
     */
    private suspend fun migrateLegacyDataStore() {
        try {
            val prefs = context.legacyDataStore.data.first()
            val legacyToken = prefs[LEGACY_KEY_AUTH_TOKEN]
            val legacyCid = prefs[LEGACY_KEY_COURIER_ID]
            val legacyName = prefs[LEGACY_KEY_COURIER_NAME] ?: ""

            if (!legacyToken.isNullOrEmpty() && !legacyCid.isNullOrEmpty()) {
                Log.d(
                    "AuthSessionManager",
                    "Menemukan session lama di DataStore. Memulai enkripsi..."
                )

                // Persist to Encrypted Storage
                saveSession(legacyToken, legacyCid, legacyName)

                // Purge legacy data to prevent repeating migration
                context.legacyDataStore.edit { legacyPrefs ->
                    legacyPrefs.remove(LEGACY_KEY_AUTH_TOKEN)
                    legacyPrefs.remove(LEGACY_KEY_COURIER_ID)
                    legacyPrefs.remove(LEGACY_KEY_COURIER_NAME)
                }
                Log.d("AuthSessionManager", "Migrasi keamanan session berhasil diselesaikan.")
            }
        } catch (e: Exception) {
            Log.e("AuthSessionManager", "Error saat migrasi session: ${e.message}")
        }
    }

    data class SessionData(
        val authToken: String,
        val courierId: String,
        val courierName: String = ""
    )

    companion object {
        private const val KEY_AUTH_TOKEN = "secure_auth_token"
        private const val KEY_COURIER_ID = "secure_courier_id"
        private const val KEY_COURIER_NAME = "secure_courier_name"
        private const val KEY_IS_ONLINE = "secure_is_online"
        private const val KEY_TOKEN_EXPIRES_AT = "secure_token_expires_at"

        // Legacy keys to clean up
        private val LEGACY_KEY_AUTH_TOKEN = stringPreferencesKey("auth_token")
        private val LEGACY_KEY_COURIER_ID = stringPreferencesKey("courier_id")
        private val LEGACY_KEY_COURIER_NAME = stringPreferencesKey("courier_name")
    }
}
