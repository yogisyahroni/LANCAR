package com.tembus.merchant.data.notifications

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.tembus.merchant.data.api.ApiClient
import com.tembus.merchant.data.api.TEMBUSApiService
import com.tembus.merchant.data.device.DeviceIdentityProvider
import com.tembus.merchant.data.model.RegisterDeviceTokenRequest
import com.tembus.merchant.data.session.AuthSessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 11.4 — Daftarkan FCM device token ke backend (POST /api/v1/device-tokens)
 * supaya push_service.go bisa kirim alert order baru walau app di
 * background/killed. Dipanggil: (1) saat FCM onNewToken, (2) setelah login
 * sukses, (3) saat app start kalau belum terdaftar.
 *
 * Token yang belum terdaftar disimpan dulu (pending) lalu dikirim begitu
 * session login ada.
 */
object DeviceTokenRegistrar {

    private const val TAG = "DeviceTokenRegistrar"
    private const val PREFS = "fcm_token_store"
    private const val KEY_PENDING_TOKEN = "pending_fcm_token"

    /** Simpan token sebagai pending (belum login). Dikirim saat login. */
    fun enqueuePendingToken(context: Context, token: String) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_PENDING_TOKEN, token).apply()
    }

    private fun takePendingToken(context: Context): String? {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val t = prefs.getString(KEY_PENDING_TOKEN, null)
        if (!t.isNullOrBlank()) prefs.edit().remove(KEY_PENDING_TOKEN).apply()
        return t
    }

    /**
     * Kirim token ke backend. Aman dipanggil dari coroutine.
     * Gagal hanya di-log (non-fatal: alert tetap jalan via polling fallback).
     */
    suspend fun register(context: Context, token: String, session: AuthSessionManager) {
        val appContext = context.applicationContext
        // Token pending yang tersimpan (dari onNewToken sebelum login) ikut dikirim.
        val finalToken = takePendingToken(appContext) ?: token
        if (finalToken.isBlank()) return

        runCatching {
            withContext(Dispatchers.IO) {
                val service: TEMBUSApiService =
                    ApiClient.createService(session, DeviceIdentityProvider(appContext))
                service.registerDeviceToken(
                    RegisterDeviceTokenRequest(
                        token = finalToken,
                        platform = "android",
                        appName = "tembus-merchant"
                    )
                )
            }
        }.onFailure { e ->
            Log.w(TAG, "Gagal register FCM token: ${e.message}")
            // Simpan kembali supaya di-retry saat login berikutnya.
            enqueuePendingToken(appContext, finalToken)
        }
    }

    /** Ambil FCM token saat ini lalu daftarkan. Panggil setelah login sukses. */
    suspend fun registerCurrentToken(context: Context, session: AuthSessionManager) {
        val appContext = context.applicationContext
        val token = try {
            com.google.android.gms.tasks.Tasks.await(
                com.google.firebase.messaging.FirebaseMessaging.getInstance().token
            )
        } catch (e: Exception) {
            Log.w(TAG, "Gagal ambil FCM token: ${e.message}")
            return
        }
        register(appContext, token, session)
    }
}
