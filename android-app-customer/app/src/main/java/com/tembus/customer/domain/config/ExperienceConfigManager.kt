package com.tembus.customer.domain.config

import android.content.Context
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.tembus.customer.data.config.ExperienceBannerAnalytics
import com.tembus.customer.data.config.ExperienceBannerEvent
import com.tembus.customer.data.config.ExperienceBannerEventType
import com.tembus.customer.data.config.ExperienceConfigRepository
import com.tembus.customer.data.config.model.ExperienceConfigScope
import com.tembus.customer.data.config.model.ExperienceConfigSnapshot
import com.tembus.customer.data.config.model.ExperienceConfigSource
import com.tembus.customer.data.config.model.ExperienceManifestValidator
import com.tembus.customer.data.session.AuthSessionManager
import com.tembus.customer.worker.ExperienceAssetPrefetchWorker
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Process-wide owner for presentation configuration. It exposes a packaged
 * safe snapshot immediately and performs disk/network work in the background.
 * No startup path awaits this manager before showing the normal app shell.
 */
@Singleton
class ExperienceConfigManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repository: ExperienceConfigRepository,
    private val sessionManager: AuthSessionManager,
    private val experienceBannerAnalytics: ExperienceBannerAnalytics,
) {
    private val managerScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _snapshot = MutableStateFlow(
        ExperienceConfigSnapshot(
            manifest = ExperienceManifestValidator.packagedDefault(
                ExperienceConfigScope(
                    marketCode = ExperienceManifestValidator.DEFAULT_MARKET_CODE,
                    locale = "id-ID",
                    appVersion = "0.0.0",
                ),
            ),
            source = ExperienceConfigSource.PACKAGED_DEFAULT,
            loadedAtMillis = System.currentTimeMillis(),
        ),
    )
    val snapshot: StateFlow<ExperienceConfigSnapshot> = _snapshot.asStateFlow()

    @Volatile
    private var started = false
    private var accountObserver: Job? = null

    fun start() {
        if (started) return
        started = true
        ExperienceAssetPrefetchWorker.schedule(context)
        accountObserver = managerScope.launch {
            var previousUserId: String? = null
            sessionManager.customerId.distinctUntilChanged().collectLatest { userId ->
                if (previousUserId != null && previousUserId != userId) {
                    repository.clearUserTargetingAssignment()
                }
                previousUserId = userId
                refreshForUser(userId)
            }
        }
    }

    fun refreshNow() {
        managerScope.launch {
            refreshForUser(sessionManager.getUserIdSync())
        }
    }

    suspend fun clearUserTargetingAssignment() {
        repository.clearUserTargetingAssignment()
    }

    suspend fun saveUserTargetingAssignment(userId: String, cohort: String?, experimentRef: String?) {
        repository.saveUserTargetingAssignment(userId, cohort, experimentRef)
    }

    suspend fun resolveAssetPath(
        snapshot: ExperienceConfigSnapshot,
        assetId: String,
    ): String? = repository.resolveAssetPath(snapshot, assetId)

    fun setMarketCode(marketCode: String) {
        repository.setMarketCode(marketCode)
        refreshNow()
    }

    private suspend fun refreshForUser(userId: String?) {
        val scope = repository.currentScope(userId)
        // Do not expose the previous account's resolved manifest while the
        // new scope is being loaded; this is especially important for
        // cohort-targeted startup campaigns.
        _snapshot.value = ExperienceConfigSnapshot(
            manifest = ExperienceManifestValidator.packagedDefault(scope),
            source = ExperienceConfigSource.PACKAGED_DEFAULT,
            loadedAtMillis = System.currentTimeMillis(),
            scope = scope,
            assetBundleKey = "packaged",
        )
        _snapshot.value = repository.loadLastKnownGood(scope)
        recordCrashContext(_snapshot.value)
        // The network operation is deliberately launched from the manager's
        // background scope; this coroutine never blocks MainActivity startup.
        val refreshStartedAt = System.nanoTime()
        val refreshed = repository.refresh(scope)
        _snapshot.value = refreshed
        recordCrashContext(refreshed)
        val refreshLatencyMs = ((System.nanoTime() - refreshStartedAt) / 1_000_000L).coerceAtLeast(0L)
        if (refreshLatencyMs >= STARTUP_REGRESSION_THRESHOLD_MILLIS) {
            managerScope.launch {
                experienceBannerAnalytics.record(
                    ExperienceBannerEvent(
                        type = ExperienceBannerEventType.STARTUP_REGRESSION,
                        component = "startup",
                        campaignId = "runtime",
                        sectionId = "runtime",
                        manifestRevision = refreshed.manifest.revision.coerceAtLeast(0),
                        marketCode = scope.marketCode,
                        manifestId = refreshed.manifest.manifestId.takeIf { it.isNotBlank() && it != "packaged-default" },
                        latencyMs = refreshLatencyMs.coerceAtMost(60_000L),
                        errorCode = "startup_refresh_slow",
                    ),
                )
            }
        }
    }

    companion object {
        private const val STARTUP_REGRESSION_THRESHOLD_MILLIS = 3_000L
    }

    private fun recordCrashContext(snapshot: ExperienceConfigSnapshot) {
        runCatching {
            FirebaseCrashlytics.getInstance().apply {
                setCustomKey("experience_manifest_revision", snapshot.manifest.revision)
                setCustomKey("experience_manifest_id", snapshot.manifest.manifestId.take(128))
                setCustomKey("experience_config_source", snapshot.source.name)
            }
        }
    }
}
