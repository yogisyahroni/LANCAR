package com.tembus.customer.worker

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.google.firebase.messaging.FirebaseMessaging
import com.tembus.customer.data.repository.NotificationRepository
import com.tembus.customer.data.repository.OrderRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit

@HiltWorker
class CustomerResyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val notificationRepository: NotificationRepository,
    private val orderRepository: OrderRepository
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val reason = inputData.getString(KEY_REASON) ?: "unknown"
        return try {
            val token = FirebaseMessaging.getInstance().token.await()
            if (token.isNotBlank()) {
                val tokenResult = notificationRepository.registerDeviceToken(token)
                if (tokenResult.isFailure) {
                    Log.w(TAG, "Token sync failed: ${tokenResult.exceptionOrNull()?.message}")
                    return Result.retry()
                }
            }

            val historyResult = orderRepository.refreshOrderHistoryFromServer()
            if (historyResult.isFailure) {
                Log.w(TAG, "Order state sync failed: ${historyResult.exceptionOrNull()?.message}")
                return Result.retry()
            }

            Log.i(TAG, "Customer resync completed. reason=$reason orders=${historyResult.getOrNull()?.size ?: 0}")
            Result.success()
        } catch (e: Exception) {
            Log.w(TAG, "Customer resync failed. reason=$reason", e)
            Result.retry()
        }
    }

    companion object {
        private const val TAG = "CustomerResyncWorker"
        private const val KEY_REASON = "reason"
        private const val UNIQUE_WORK = "customer-session-resync"

        fun enqueue(context: Context, reason: String) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = OneTimeWorkRequestBuilder<CustomerResyncWorker>()
                .setInputData(workDataOf(KEY_REASON to reason))
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                UNIQUE_WORK,
                ExistingWorkPolicy.REPLACE,
                request
            )
        }
    }
}
