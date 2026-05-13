package com.lancar.courier.worker

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.lancar.courier.data.repository.OrderRepository
import com.lancar.courier.data.session.AuthSessionManager
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

        // Sync pending orders
        val result = orderRepository.syncPendingOrders(session.authToken)
        
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
}
