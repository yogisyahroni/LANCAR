package com.tembus.courier.worker

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.tembus.courier.data.repository.LocationRepository
import com.tembus.courier.data.repository.OrderRepository
import com.tembus.courier.data.session.AuthSessionManager
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.flow.first

/**
 * Order Sync Worker
 * 
 * Background worker to sync pending orders with backend.
 * Runs periodically or when triggered by network changes.
 */
@HiltWorker
class OrderSyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val orderRepository: OrderRepository,
    private val locationRepository: LocationRepository,
    private val authSessionManager: AuthSessionManager
) : CoroutineWorker(context, params) {

    private val TAG = "OrderSyncWorker"

    override suspend fun doWork(): Result {

        // Check if courier is logged in
        val isLoggedIn = authSessionManager.isLoggedIn.first()
        if (!isLoggedIn) {
            Log.d(TAG, "Courier not logged in, skipping sync")
            return Result.success()
        }

        val session = authSessionManager.getSession()
        if (session == null) {
            Log.e(TAG, "Session data unavailable")
            return Result.failure()
        }

        // 🚨 TELEMETRY SWEEP & DATABASE MAINTENANCE
        try {
            val deviceId = android.provider.Settings.Secure.getString(
                applicationContext.contentResolver, 
                android.provider.Settings.Secure.ANDROID_ID
            ) ?: "unknown_worker"
            
            // Flush residual locations (<10 items) from DB to prevent courier freezing on dashboard
            locationRepository.syncLocations(session.courierId, deviceId)
            
            // Purge location records older than 7 days to keep storage clean
            locationRepository.cleanupOldLocations()
            Log.i(TAG, "Telemetry flush and 7-day local database purging executed successfully.")
        } catch (e: Exception) {
            Log.w(TAG, "Background telemetry maintenance skipped or aborted: ${e.message}")
        }

        // Sync pending orders
        val result = orderRepository.syncPendingOrders()
        
        return result.fold(
            onSuccess = { syncedIds ->
                if (syncedIds.isNotEmpty()) {
                    Log.d(TAG, "Synced ${syncedIds.size} orders")
                    Result.success()
                } else {
                    Log.d(TAG, "No pending orders to sync")
                    Result.success()
                }
            },
            onFailure = { e ->
                Log.e(TAG, "Sync failed", e)
                Result.retry()
            }
        )
    }

    companion object {
        private const val UNIQUE_WORK = "courier-order-sync"

        fun enqueue(context: Context, reason: String) {
            val request = OneTimeWorkRequestBuilder<OrderSyncWorker>()
                .setInputData(workDataOf("reason" to reason))
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, java.util.concurrent.TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                UNIQUE_WORK,
                ExistingWorkPolicy.REPLACE,
                request
            )
        }
    }
}
