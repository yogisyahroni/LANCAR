package com.tembus.customer.domain.config

import com.tembus.customer.data.config.ExperienceConfigRepository
import com.tembus.customer.data.config.model.ExperienceConfigScope
import com.tembus.customer.data.config.model.ExperienceConfigSnapshot
import com.tembus.customer.data.config.model.ExperienceConfigSource
import com.tembus.customer.data.config.model.ExperienceManifestValidator
import com.tembus.customer.data.session.AuthSessionManager
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
    private val repository: ExperienceConfigRepository,
    private val sessionManager: AuthSessionManager,
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

    fun setMarketCode(marketCode: String) {
        repository.setMarketCode(marketCode)
        refreshNow()
    }

    private suspend fun refreshForUser(userId: String?) {
        val scope = repository.currentScope(userId)
        _snapshot.value = repository.loadLastKnownGood(scope)
        // The network operation is deliberately launched from the manager's
        // background scope; this coroutine never blocks MainActivity startup.
        _snapshot.value = repository.refresh(scope)
    }
}
