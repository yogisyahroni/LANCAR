package com.tembus.customer.domain.config

import com.tembus.customer.data.config.StartupCampaignStore
import com.tembus.customer.data.config.ExperienceBannerAnalytics
import com.tembus.customer.data.config.ExperienceBannerEvent
import com.tembus.customer.data.config.ExperienceBannerEventType
import com.tembus.customer.data.config.model.ExperienceConfigSnapshot
import com.tembus.customer.data.session.AuthSessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Coordinates non-blocking post-splash campaign delivery. The normal app
 * shell is rendered independently of this state flow.
 */
@Singleton
class StartupCampaignCoordinator @Inject constructor(
    private val experienceConfigManager: ExperienceConfigManager,
    private val campaignStore: StartupCampaignStore,
    private val sessionManager: AuthSessionManager,
    private val experienceBannerAnalytics: ExperienceBannerAnalytics,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _decision = MutableStateFlow<StartupCampaignDecision?>(null)
    private val suppressedForSession = ConcurrentHashMap.newKeySet<String>()
    private val impressionRecordedForSession = ConcurrentHashMap.newKeySet<String>()

    val decision: StateFlow<StartupCampaignDecision?> = _decision.asStateFlow()

    @Volatile
    private var started = false

    fun start() {
        if (started) return
        started = true
        scope.launch {
            var previousUserId: String? = null
            sessionManager.customerId.distinctUntilChanged().collectLatest { userId ->
                if (previousUserId != null && previousUserId != userId) {
                    campaignStore.clear()
                    suppressedForSession.clear()
                    impressionRecordedForSession.clear()
                }
                previousUserId = userId
                if (userId.isNullOrBlank()) {
                    _decision.value = null
                    return@collectLatest
                }
                experienceConfigManager.snapshot.collectLatest { snapshot ->
                    _decision.value = evaluate(snapshot, userId)
                }
            }
        }
    }

    fun skipForSession(decision: StartupCampaignDecision) {
        val key = decision.campaign.campaignId
        suppressedForSession.add(key)
        clearIfCurrent(key)
    }

    fun dismiss(decision: StartupCampaignDecision) {
        val key = decision.campaign.campaignId
        suppressedForSession.add(key)
        clearIfCurrent(key)
        recordAnalytics(decision, ExperienceBannerEventType.DISMISS)
        scope.launch {
            sessionManager.getUserIdSync()?.let { userId ->
                campaignStore.dismiss(userId, decision.campaign.campaignId)
            }
        }
    }

    fun recordImpression(decision: StartupCampaignDecision) {
        val key = decision.campaign.campaignId
        if (!impressionRecordedForSession.add(key)) return
        // Prevent a StateFlow re-evaluation from showing the same campaign
        // repeatedly after its first impression has been persisted.
        suppressedForSession.add(key)
        clearIfCurrent(key)
        recordAnalytics(decision, ExperienceBannerEventType.IMPRESSION)
        scope.launch {
            sessionManager.getUserIdSync()?.let { userId ->
                campaignStore.recordImpression(
                    userId = userId,
                    campaignId = decision.campaign.campaignId,
                    nowMillis = System.currentTimeMillis(),
                )
            }
        }
    }

    fun recordAssetError(decision: StartupCampaignDecision) {
        val key = decision.campaign.campaignId
        suppressedForSession.add(key)
        clearIfCurrent(key)
        recordAnalytics(decision, ExperienceBannerEventType.ASSET_BROKEN, "campaign_asset_load_failed")
    }

    private fun recordAnalytics(
        decision: StartupCampaignDecision,
        type: ExperienceBannerEventType,
        errorCode: String? = null,
    ) {
        scope.launch {
            experienceBannerAnalytics.record(
                ExperienceBannerEvent(
                    type = type,
                    component = "campaign_strip",
                    campaignId = decision.campaign.campaignId,
                    sectionId = "campaign_intro",
                    manifestRevision = decision.manifestRevision,
                    marketCode = decision.marketCode,
                    manifestId = decision.manifestId,
                    errorCode = errorCode,
                ),
            )
        }
    }

    private suspend fun evaluate(
        snapshot: ExperienceConfigSnapshot,
        userId: String,
    ): StartupCampaignDecision? {
        val campaign = StartupCampaignPolicy.parse(snapshot.manifest) ?: run {
            return null
        }
        if (campaign.campaignId in suppressedForSession) return null
        val record = campaignStore.read(userId)
        val assetPath = campaign.mediaAssetId?.let { assetId ->
            experienceConfigManager.resolveAssetPath(snapshot, assetId)
        }
        return StartupCampaignPolicy.evaluate(
            snapshot = snapshot,
            record = record,
            resolveAssetPath = { reference ->
                if (reference.assetId == campaign.mediaAssetId) assetPath else null
            },
        )
    }

    private fun clearIfCurrent(campaignId: String) {
        if (_decision.value?.campaign?.campaignId == campaignId) {
            _decision.value = null
        }
    }
}
