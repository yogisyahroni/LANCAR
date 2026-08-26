package com.tembus.merchant.data.notifications

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.tembus.merchant.data.api.ApiClient
import com.tembus.merchant.data.device.DeviceIdentityProvider
import com.tembus.merchant.data.session.AuthSessionManager
import java.util.concurrent.TimeUnit

/**
 * 11.4 — FALLBACK polling saat FCM tidak tersedia (google-services.json placeholder
 * / token belum terdaftar / device tidak punya Google Play Services).
 * Jalan tiap 15 menit di background (Doze-friendly) dan memicu alert lokal
 * via OrderAlertNotifier untuk order pending_merchant yang belum pernah dilihat.
 *
 * Tidak mengganti FCM, tapi menjamin SLA alert walau app di-kill tanpa FCM.
 */
class OrderPollWorker(
    private val appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val session = AuthSessionManager(appContext)
        if (!session.getAuthTokenSync().isNullOrBlank()) {
            runCatching {
                val service = ApiClient.createService(session, DeviceIdentityProvider(appContext))
                val orders = service.listOrders(status = "pending_merchant", pageSize = 20)
                    .body()?.orders ?: emptyList()
                val notifier = OrderAlertNotifier(appContext)
                val ids = orders.mapNotNull { it.id }.toSet()
                if (ids.isNotEmpty()) {
                    val merchantName = try {
                        service.getProfile().body()?.namaToko
                    } catch (_: Exception) { null }
                    val alerted = notifier.alertNewOrders(ids, merchantName)
                    if (alerted.isNotEmpty()) notifier.markOrdersSeen(ids)
                }
            }
        }
        return Result.success()
    }

    companion object {
        private const val WORK_NAME = "order_poll_fallback"

        /** Daftarkan periodic poll (idempoten — UPDATE policy). */
        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<OrderPollWorker>(15, TimeUnit.MINUTES)
                .setInitialDelay(15, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context.applicationContext)
                .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, req)
        }
    }
}
