package com.tembus.customer.data.security

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

data class LocalDeviceSecuritySettings(
    val enabled: Boolean = false,
    val pinConfigured: Boolean = false,
    val biometricEnabled: Boolean = false,
    val biometricSupported: Boolean = false
) {
    val active: Boolean
        get() = enabled && pinConfigured
}

class LocalDeviceSecurityManager(private val context: Context) {

    private val sharedPreferences: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            "local_device_security",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private val _settings = MutableStateFlow(readSettings())
    val settings: StateFlow<LocalDeviceSecuritySettings> = _settings.asStateFlow()

    fun refresh() {
        _settings.value = readSettings()
    }

    fun configurePin(pin: String) {
        require(pin.matches(PIN_REGEX)) { "PIN harus 6 digit." }
        val salt = ByteArray(SALT_BYTES)
        SecureRandom().nextBytes(salt)
        val pinHash = hashPin(pin, salt)

        sharedPreferences.edit()
            .putString(KEY_PIN_HASH, pinHash)
            .putString(KEY_PIN_SALT, Base64.encodeToString(salt, Base64.NO_WRAP))
            .putBoolean(KEY_ENABLED, true)
            .apply()
        refresh()
    }

    fun setEnabled(enabled: Boolean) {
        if (enabled && !isPinConfigured()) {
            throw IllegalStateException("Buat PIN perangkat terlebih dahulu.")
        }
        sharedPreferences.edit().putBoolean(KEY_ENABLED, enabled).apply()
        refresh()
    }

    fun setBiometricEnabled(enabled: Boolean) {
        if (enabled && !isPinConfigured()) {
            throw IllegalStateException("Buat PIN perangkat terlebih dahulu.")
        }
        if (enabled && !isBiometricSupported()) {
            throw IllegalStateException("Biometrik perangkat tidak aktif.")
        }
        sharedPreferences.edit().putBoolean(KEY_BIOMETRIC_ENABLED, enabled).apply()
        refresh()
    }

    fun verifyPin(pin: String): Boolean {
        if (!pin.matches(PIN_REGEX)) return false
        val storedHash = sharedPreferences.getString(KEY_PIN_HASH, null) ?: return false
        val saltBase64 = sharedPreferences.getString(KEY_PIN_SALT, null) ?: return false
        val salt = runCatching { Base64.decode(saltBase64, Base64.NO_WRAP) }.getOrNull() ?: return false
        val candidateHash = hashPin(pin, salt)
        return MessageDigest.isEqual(
            storedHash.toByteArray(Charsets.UTF_8),
            candidateHash.toByteArray(Charsets.UTF_8)
        )
    }

    fun clear() {
        sharedPreferences.edit()
            .remove(KEY_PIN_HASH)
            .remove(KEY_PIN_SALT)
            .remove(KEY_ENABLED)
            .remove(KEY_BIOMETRIC_ENABLED)
            .apply()
        refresh()
    }

    fun isBiometricSupported(): Boolean {
        return BiometricManager.from(context).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        ) == BiometricManager.BIOMETRIC_SUCCESS
    }

    private fun readSettings(): LocalDeviceSecuritySettings {
        val pinConfigured = isPinConfigured()
        val biometricSupported = isBiometricSupported()
        val biometricEnabled = sharedPreferences.getBoolean(KEY_BIOMETRIC_ENABLED, false) && biometricSupported
        return LocalDeviceSecuritySettings(
            enabled = sharedPreferences.getBoolean(KEY_ENABLED, false) && pinConfigured,
            pinConfigured = pinConfigured,
            biometricEnabled = biometricEnabled,
            biometricSupported = biometricSupported
        )
    }

    private fun isPinConfigured(): Boolean {
        return !sharedPreferences.getString(KEY_PIN_HASH, null).isNullOrBlank() &&
            !sharedPreferences.getString(KEY_PIN_SALT, null).isNullOrBlank()
    }

    private fun hashPin(pin: String, salt: ByteArray): String {
        val spec = PBEKeySpec(pin.toCharArray(), salt, PBKDF_ITERATIONS, HASH_BITS)
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val hash = factory.generateSecret(spec).encoded
        return Base64.encodeToString(hash, Base64.NO_WRAP)
    }

    companion object {
        private val PIN_REGEX = Regex("^\\d{6}$")
        private const val SALT_BYTES = 32
        private const val PBKDF_ITERATIONS = 120_000
        private const val HASH_BITS = 256
        private const val KEY_ENABLED = "enabled"
        private const val KEY_PIN_HASH = "pin_hash"
        private const val KEY_PIN_SALT = "pin_salt"
        private const val KEY_BIOMETRIC_ENABLED = "biometric_enabled"
    }
}
