package com.tembus.customer.worker

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.tembus.customer.data.config.ExperienceConfigRepository
import com.tembus.customer.data.session.AuthSessionManager
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit

/** Refreshes the already audience-scoped manifest on Wi-Fi for eligible assets. */
@HiltWorker
class ExperienceAssetPrefetchWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val repository: ExperienceConfigRepository,
    private val sessionManager: AuthSessionManager,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result = runCatching {
        val scope = repository.currentScope(sessionManager.getUserIdSync())
        repository.refresh(scope, forceNetwork = true)
        Log.d(TAG, "Experience asset prefetch completed for ${scope.marketCode}/${scope.locale}")
        Result.success()
    }.getOrElse { error ->
        Log.w(TAG, "Experience asset prefetch failed", error)
        Result.retry()
    }

    companion object {
        private const val TAG = "ExperienceAssetPrefetch"
        private const val UNIQUE_WORK = "experience-asset-prefetch"

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.UNMETERED)
                .build()
            val request = PeriodicWorkRequestBuilder<ExperienceAssetPrefetchWorker>(6, TimeUnit.HOURS)
                .setInitialDelay(30, TimeUnit.MINUTES)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
                UNIQUE_WORK,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }
    }
}
